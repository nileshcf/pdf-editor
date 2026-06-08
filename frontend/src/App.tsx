import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Download,
  FolderOpen,
  Image,
  MessageSquare,
  MousePointer2,
  PenTool,
  Pencil,
  Redo2,
  Share2,
  Type,
  Undo2,
  User,
  X,
} from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { PDFCanvas } from './components/PDFCanvas';
import { PropertiesPanel } from './components/PropertiesPanel';
import { ImageInsertModal } from './components/ImageInsertModal';
import { api, EditResponse, HistoryState, OCRBlockPayload, PDFPage } from './api';

type ToolKey = 'cursor' | 'text' | 'image' | 'draw' | 'signature' | 'comment';

interface Session {
  session_id: string;
  filename: string;
  metadata: { title: string; author: string; pages: number };
  pages: PDFPage[];
}

interface SelectedBlock {
  pageNumber: number;
  bbox: number[];
  text: string;
  font: string;
  size: number;
  color: string;
  flags?: number;
}

interface Toast {
  text: string;
  type: 'success' | 'error' | 'info' | null;
}

const MOCK_PAGES: PDFPage[] = [1, 2, 3, 4].map((n) => ({
  number: n,
  width: 595,
  height: 842,
  blocks: [],
  images: [],
}));

const TOOL_LIST: Array<{ key: ToolKey; icon: React.ReactNode; label: string }> = [
  { key: 'cursor', icon: <MousePointer2 size={18} strokeWidth={1.5} />, label: 'Cursor (V)' },
  { key: 'text', icon: <Type size={18} strokeWidth={1.5} />, label: 'Text Tool (T)' },
  { key: 'image', icon: <Image size={18} strokeWidth={1.5} />, label: 'Image Tool' },
  { key: 'draw', icon: <PenTool size={18} strokeWidth={1.5} />, label: 'Draw Tool' },
  { key: 'signature', icon: <Pencil size={18} strokeWidth={1.5} />, label: 'Signature Pen' },
  { key: 'comment', icon: <MessageSquare size={18} strokeWidth={1.5} />, label: 'Comment' },
];

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [history, setHistory] = useState<HistoryState | null>(null);
  const [activePage, setActivePage] = useState<number>(1);
  const [selectedBlock, setSelectedBlock] = useState<SelectedBlock | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [toast, setToast] = useState<Toast>({ text: '', type: null });
  const [activeTool, setActiveTool] = useState<ToolKey>('text');
  const [showImageModal, setShowImageModal] = useState(false);
  const [activeShape, setActiveShape] = useState<'rect' | 'circle' | 'line' | 'arrow' | null>(null);
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [fillColor, setFillColor] = useState('#ffffff');
  const [lineWidth, setLineWidth] = useState(2);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = useCallback((text: string, type: Toast['type']) => {
    setToast({ text, type });
    setTimeout(() => setToast({ text: '', type: null }), 3500);
  }, []);

  const displayPages = session?.pages ?? MOCK_PAGES;
  const displayedFilename = session?.filename || 'annual_report_draft.pdf';
  const sid = session?.session_id;

  useEffect(() => {
    const maxPage = displayPages.length;
    setActivePage((current) => Math.min(Math.max(1, current), maxPage));
  }, [displayPages.length]);

  const applyEdit = useCallback(
    (data: EditResponse, fallbackMsg?: string) => {
      setSession((prev) => (prev ? { ...prev, pages: data.pages, metadata: data.metadata } : prev));
      setHistory(data.history);
      setSelectedBlock(null);
      const total = data.metadata.pages;
      setActivePage((p) => Math.min(Math.max(1, p), total));
      if (data.warnings?.length) {
        showToast(data.warnings[0], 'info');
      } else {
        showToast(data.message || fallbackMsg || 'Done', 'success');
      }
    },
    [showToast]
  );

  const run = useCallback(
    async (fn: () => Promise<EditResponse>, fallbackMsg?: string) => {
      if (!session) return;
      setIsLoading(true);
      try {
        const data = await fn();
        applyEdit(data, fallbackMsg);
      } catch (err: any) {
        showToast(err.message || 'Request failed', 'error');
      } finally {
        setIsLoading(false);
      }
    },
    [session, applyEdit, showToast]
  );

  const handleFileUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      showToast('Only PDF files are supported.', 'error');
      return;
    }
    setIsLoading(true);
    try {
      const data = await api.upload(file);
      setSession({
        session_id: data.session_id,
        filename: data.filename,
        metadata: data.metadata,
        pages: data.pages,
      });
      setHistory(data.history);
      setActivePage(1);
      setSelectedBlock(null);
      showToast(`${data.filename} loaded`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Upload failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const openFilePicker = () => fileInputRef.current?.click();

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      handleFileUpload(e.target.files[0]);
      e.target.value = '';
    }
  };

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (session) return;
    e.preventDefault();
    setIsDragging(true);
  }, [session]);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (session) return;
    e.preventDefault();
    setIsDragging(false);
  }, [session]);

  const onDrop = useCallback((e: React.DragEvent) => {
    if (session) return;
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  }, [session]);

  const handleSaveBlockEdits = (text: string, size: number, font: string, color: string, align: number) =>
    sid &&
    selectedBlock &&
    run(
      () =>
        api.editBlock(sid, {
          page_number: selectedBlock.pageNumber,
          original_bbox: selectedBlock.bbox,
          new_text: text,
          font_size: size,
          font_name: font,
          hex_color: color,
          align,
        }),
      'Text updated'
    );

  const handleUndo = () => sid && run(() => api.undo(sid), 'Undid change');
  const handleRedo = () => sid && run(() => api.redo(sid), 'Redid change');
  const handleRotate = (deg: number) => sid && run(() => api.rotate(sid, activePage, deg), 'Page rotated');
  const handleDuplicate = () => sid && run(() => api.duplicate(sid, activePage), 'Page duplicated');
  const handleInsertBlank = () => sid && run(() => api.insertBlank(sid, activePage), 'Blank page inserted');
  const handleDelete = () => {
    if (!sid) return;
    if (!window.confirm(`Delete page ${activePage}? This action can be undone.`)) return;
    run(() => api.deletePages(sid, [activePage]), 'Page deleted');
  };

  const handleExportPDF = () => {
    if (!sid) return;
    window.open(api.downloadUrl(sid), '_blank');
  };

  const handleOCRComplete = async (pageNum: number, ocrBlocks: OCRBlockPayload[]) => {
    if (!sid) return;
    if (!ocrBlocks.length) {
      showToast('No text detected on this page.', 'info');
      return;
    }
    setIsLoading(true);
    try {
      const data = await api.persistOcr(sid, { page_number: pageNum, blocks: ocrBlocks });
      applyEdit(data, `OCR text saved on page ${pageNum}`);
    } catch (err: any) {
      showToast(err.message || 'OCR save failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInsertImage = async (file: File, x: number, y: number, w: number, h: number) => {
    if (!sid) return;
    setIsLoading(true);
    try {
      const data = await api.addImage(sid, file, x, y, w, h, activePage);
      applyEdit(data, 'Image inserted');
      setShowImageModal(false);
      setActiveTool('cursor');
    } catch (err: any) {
      showToast(err.message || 'Image insert failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrawShape = async (bbox: number[]) => {
    if (!sid || !activeShape) return;
    setIsLoading(true);
    try {
      const data = await api.drawShape(sid, {
        page_number: activePage,
        shape_type: activeShape,
        bbox,
        stroke_color: strokeColor,
        fill_color: fillColor || undefined,
        line_width: lineWidth,
      });
      applyEdit(data, 'Shape added');
      setActiveShape(null);
      setActiveTool('cursor');
    } catch (err: any) {
      showToast(err.message || 'Shape draw failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const onToolSelect = (tool: ToolKey) => {
    setActiveTool(tool);
    if (tool !== 'draw') setActiveShape(null);
    if (tool === 'draw') setActiveShape((prev) => prev || 'rect');
    if (tool === 'image' && session) setShowImageModal(true);
  };

  const activePageData = displayPages[Math.max(0, activePage - 1)];

  return (
    <div className="app-shell">
      <header className="top-toolbar">
        <div className="toolbar-left">
          <button className="tool-btn" title="Menu">
            <ChevronDown size={18} strokeWidth={1.5} />
          </button>
          {TOOL_LIST.map((tool) => (
            <button
              key={tool.key}
              className={`tool-btn${activeTool === tool.key ? ' active' : ''}`}
              title={tool.label}
              onClick={() => onToolSelect(tool.key)}
              disabled={!session && tool.key !== 'text' && tool.key !== 'cursor'}
            >
              {tool.icon}
            </button>
          ))}
        </div>

        <div className="toolbar-center">
          <span className="doc-title">{displayedFilename}</span>
        </div>

        <div className="toolbar-right">
          {!session && (
            <button className="icon-action" title="Open PDF" onClick={openFilePicker}>
              <FolderOpen size={16} strokeWidth={1.5} />
            </button>
          )}
          <button className="icon-action" title="Undo" onClick={handleUndo} disabled={!history?.can_undo || isLoading}>
            <Undo2 size={16} strokeWidth={1.5} />
          </button>
          <button className="icon-action" title="Redo" onClick={handleRedo} disabled={!history?.can_redo || isLoading}>
            <Redo2 size={16} strokeWidth={1.5} />
          </button>
          <button className="share-btn" disabled={!session}>
            <Share2 size={15} strokeWidth={1.5} />
            <span>Share</span>
          </button>
          <button className="export-btn" onClick={handleExportPDF} disabled={!session}>
            <Download size={15} strokeWidth={1.5} />
            <span>Export PDF</span>
          </button>
          <button className="avatar-btn" title="User">
            <User size={16} strokeWidth={1.5} />
          </button>
        </div>
      </header>

      <div className="editor-shell">
        <Sidebar
          pages={displayPages}
          activePage={activePage}
          filename={displayedFilename}
          pdfUrl={session ? api.downloadUrl(session.session_id) : undefined}
          docVersion={history?.version ?? 0}
          setActivePage={setActivePage}
        />

        <main className={`editor-stage${isDragging ? ' dragging' : ''}`} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
          {toast.text && (
            <div className={`toast${toast.type ? ` ${toast.type}` : ''}`}>
              {toast.type === 'success' ? <CheckCircle2 size={14} /> : null}
              {toast.type === 'error' ? <AlertCircle size={14} /> : null}
              <span>{toast.text}</span>
              <button onClick={() => setToast({ text: '', type: null })} className="toast-close">
                <X size={12} />
              </button>
            </div>
          )}

          {session ? (
            <PDFCanvas
              page={activePageData}
              pdfUrl={api.downloadUrl(session.session_id)}
              docVersion={history?.version ?? 0}
              onSelectBlock={setSelectedBlock}
              onOCRComplete={handleOCRComplete}
              selectedBlock={selectedBlock}
              activeShape={activeTool === 'draw' ? activeShape : null}
              onDrawShape={handleDrawShape}
            />
          ) : (
            <button className="mock-document" onClick={openFilePicker}>
              <div className="mock-title">Quarterly Revenue Summary</div>
              <div className="mock-paragraph">
                This placeholder document mirrors the active editing surface. Open a PDF to start editing live text, images, and annotations.
              </div>
              <div className="mock-image" />
              <div className="mock-selection">
                <span>Executive overview selected</span>
                {Array.from({ length: 8 }).map((_, i) => (
                  <b key={i} className={`mock-handle h-${i + 1}`} />
                ))}
              </div>
            </button>
          )}
        </main>

        <PropertiesPanel
          selectedBlock={selectedBlock}
          activeTool={activeTool}
          isLoading={isLoading}
          activePage={activePage}
          onSaveBlockEdits={handleSaveBlockEdits}
          onInsertImage={() => setShowImageModal(true)}
          onToggleDraw={() => onToolSelect(activeTool === 'draw' ? 'cursor' : 'draw')}
          isDrawing={activeTool === 'draw'}
          onExport={handleExportPDF}
          onRotate={handleRotate}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onInsertBlank={handleInsertBlank}
          strokeColor={strokeColor}
          onChangeStrokeColor={setStrokeColor}
          fillColor={fillColor}
          onChangeFillColor={setFillColor}
          lineWidth={lineWidth}
          onChangeLineWidth={setLineWidth}
          canEdit={!!session}
        />
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={onFileChange}
        accept="application/pdf"
        style={{ display: 'none' }}
      />

      {showImageModal && session && (
        <ImageInsertModal
          onClose={() => setShowImageModal(false)}
          onInsert={handleInsertImage}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}

export default App;
