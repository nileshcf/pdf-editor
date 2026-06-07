import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Download, AlertCircle, CheckCircle, X, Undo2, Redo2 } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { PDFCanvas } from './components/PDFCanvas';
import { PropertiesPanel } from './components/PropertiesPanel';
import { CommandConsole } from './components/CommandConsole';
import { PageToolbar } from './components/PageToolbar';
import { api, EditResponse, HistoryState, PDFPage } from './api';

interface Session {
  session_id: string;
  filename: string;
  metadata: { title: string; author: string; pages: number };
  pages: PDFPage[];
}
interface SelectedBlock { pageNumber: number; bbox: number[]; text: string; font: string; size: number; color: string; }
interface Toast { text: string; type: 'success' | 'error' | 'info' | null; }

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [history, setHistory] = useState<HistoryState | null>(null);
  const [activePage, setActivePage] = useState<number>(1);
  const [selectedBlock, setSelectedBlock] = useState<SelectedBlock | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>({ text: '', type: null });
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (text: string, type: Toast['type']) => {
    setToast({ text, type });
    setTimeout(() => setToast({ text: '', type: null }), 4000);
  };

  // Single place to fold an EditResponse back into UI state.
  const applyEdit = useCallback((data: EditResponse, fallbackMsg?: string) => {
    setSession((prev) => (prev ? { ...prev, pages: data.pages, metadata: data.metadata } : prev));
    setHistory(data.history);
    setSelectedBlock(null);
    const total = data.metadata.pages;
    setActivePage((p) => Math.min(Math.max(1, p), total));
    if (data.warnings && data.warnings.length) {
      showToast(data.warnings[0], 'info');
    } else {
      showToast(data.message || fallbackMsg || 'Done!', 'success');
    }
  }, []);

  // Generic guarded runner for mutating calls.
  const run = useCallback(async (fn: () => Promise<EditResponse>, fallbackMsg?: string) => {
    if (!session) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fn();
      applyEdit(data, fallbackMsg);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [session, applyEdit]);

  const handleFileUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are supported.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.upload(file);
      setSession({ session_id: data.session_id, filename: data.filename, metadata: data.metadata, pages: data.pages });
      setHistory(data.history);
      setActivePage(1);
      setSelectedBlock(null);
      const p = data.metadata.pages;
      showToast(`"${file.name}" loaded — ${p} page${p !== 1 ? 's' : ''}!`, 'success');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) { handleFileUpload(e.target.files[0]); e.target.value = ''; }
  };
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const f = e.dataTransfer.files?.[0]; if (f) handleFileUpload(f);
  }, []);

  const sid = session?.session_id;

  const handleSaveBlockEdits = (text: string, size: number, font: string, color: string, align: number) =>
    sid && selectedBlock && run(() => api.editBlock(sid, {
      page_number: selectedBlock.pageNumber, original_bbox: selectedBlock.bbox,
      new_text: text, font_size: size, font_name: font, hex_color: color, align,
    }), 'Text block updated!');

  const handleSearchReplace = (search: string, replacement: string, pageOnly: boolean, opts: { caseSensitive: boolean; wholeWord: boolean }) =>
    sid && run(() => api.replace(sid, {
      search_term: search, replacement, page_number: pageOnly ? activePage : null,
      case_sensitive: opts.caseSensitive, whole_word: opts.wholeWord,
    }));

  const handleExecuteCommand = (cmd: string) => sid && run(() => api.command(sid, cmd));
  const handleUndo = () => sid && run(() => api.undo(sid), 'Undid last change');
  const handleRedo = () => sid && run(() => api.redo(sid), 'Redid change');

  const handleRotate = (deg: number) => sid && run(() => api.rotate(sid, activePage, deg));
  const handleDuplicate = () => sid && run(() => api.duplicate(sid, activePage));
  const handleInsertBlank = () => sid && run(() => api.insertBlank(sid, activePage));
  const handleDelete = () => sid && run(() => api.deletePages(sid, [activePage]));

  const handleExportPDF = () => { if (sid) window.open(api.downloadUrl(sid), '_blank'); };

  const handleOCRComplete = (pageNum: number, ocrBlocks: any[]) => {
    if (!session) return;
    setSession({
      ...session,
      pages: session.pages.map((p) => (p.number === pageNum ? { ...p, blocks: [...p.blocks, ...ocrBlocks] } : p)),
    });
    showToast('OCR complete — text is now editable!', 'success');
  };

  // Keyboard shortcuts: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z (or Ctrl+Y) redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!sid || isLoading) return;
      const mod = e.ctrlKey || e.metaKey;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); if (history?.can_undo) handleUndo(); }
      else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault(); if (history?.can_redo) handleRedo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sid, isLoading, history]);

  const toastBg = toast.type === 'error' ? 'var(--red)' : toast.type === 'success' ? 'var(--green)' : 'var(--dark)';
  const iconBtn = (disabled: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: '5px',
    background: disabled ? 'transparent' : 'rgba(255,255,255,0.18)',
    border: 'none', borderRadius: 'var(--r-pill)', padding: '7px 11px',
    color: disabled ? 'rgba(255,255,255,0.35)' : 'white',
    cursor: disabled ? 'default' : 'pointer', fontWeight: 800, fontSize: '0.8rem',
  });

  return (
    <div className="app-container">
      <header className="header">
        <div className="app-logo">
          <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>PDF</span>
          <span>AeroPDF</span>
        </div>
        {session ? (
          <>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button style={iconBtn(!history?.can_undo || isLoading)} onClick={handleUndo}
                disabled={!history?.can_undo || isLoading} title="Undo (Ctrl+Z)">
                <Undo2 size={15} /> Undo
              </button>
              <button style={iconBtn(!history?.can_redo || isLoading)} onClick={handleRedo}
                disabled={!history?.can_redo || isLoading} title="Redo (Ctrl+Shift+Z)">
                <Redo2 size={15} /> Redo
              </button>
            </div>
            <CommandConsole onExecuteCommand={handleExecuteCommand} isLoading={isLoading} />
            <button className="btn btn-export" onClick={handleExportPDF}>
              <Download size={15} /> Export PDF
            </button>
          </>
        ) : (
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.88rem', fontWeight: 700 }}>
            Upload a PDF to get started
          </span>
        )}
      </header>

      {!session ? (
        <div className="upload-overlay fade-in">
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <h1 style={{ fontSize: '2.2rem', fontWeight: 900, color: 'var(--red)', margin: '0 0 10px 0', letterSpacing: '-0.5px' }}>
              Don't let bad PDFs win.
            </h1>
            <p style={{ color: 'var(--medium)', fontSize: '1rem', maxWidth: '460px', margin: '0 auto', fontWeight: 600 }}>
              Edit text, run OCR on scanned pages, reorder pages, and export without losing formatting.
            </p>
          </div>

          <div
            className={'dropzone' + (isDragging ? ' drag-active' : '')}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
            role="button" tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
          >
            {isLoading ? (
              <p style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--teal)' }}>Parsing PDF...</p>
            ) : (
              <>
                <div style={{
                  width: 72, height: 72,
                  background: isDragging ? 'var(--teal)' : 'var(--bg)',
                  border: '3px solid ' + (isDragging ? 'var(--teal-dark)' : 'var(--border)'),
                  borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '16px', transition: 'all 0.2s',
                }}>
                  <Download size={28} style={{ color: isDragging ? 'white' : 'var(--teal)', transform: 'rotate(180deg)' }} />
                </div>
                <h3 style={{ margin: '0 0 6px 0', fontSize: '1.1rem', fontWeight: 800 }}>
                  {isDragging ? 'Drop your PDF here!' : 'Drag and drop your PDF here'}
                </h3>
                <p style={{ color: 'var(--medium)', fontSize: '0.85rem', margin: '0 0 20px 0', fontWeight: 600 }}>
                  or click to browse files
                </p>
                <button className="btn btn-primary" style={{ pointerEvents: 'none' }}>Browse PDF</button>
              </>
            )}
            <input type="file" ref={fileInputRef} onChange={onFileChange} accept="application/pdf" style={{ display: 'none' }} />
          </div>

          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px', marginTop: '20px',
              background: 'rgba(255,59,47,0.08)', border: '2px solid rgba(255,59,47,0.3)',
              padding: '12px 18px', borderRadius: 'var(--r-md)', color: 'var(--red)',
              maxWidth: '540px', width: '100%',
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>{error}</span>
              <button onClick={() => setError(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto', color: 'var(--red)' }}>
                <X size={16} />
              </button>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '28px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {['Edit text', 'Find and replace', 'OCR scanned pages', 'Reorder pages', 'Undo / redo', 'Export PDF'].map((label) => (
              <div key={label} style={{
                background: 'var(--white)', border: '2.5px solid var(--border)',
                borderRadius: 'var(--r-pill)', padding: '7px 16px',
                fontSize: '0.82rem', fontWeight: 800, color: 'var(--dark)',
              }}>{label}</div>
            ))}
          </div>
        </div>
      ) : (
        <div className="workspace-layout">
          <Sidebar pages={session.pages} activePage={activePage} filename={session.filename}
            setActivePage={(n) => { setActivePage(n); setSelectedBlock(null); }} />
          <main className="canvas-viewport">
            {toast.text && (
              <div className="fade-in" style={{
                position: 'absolute', top: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 40,
                background: toastBg, color: 'white', padding: '10px 18px', borderRadius: 'var(--r-pill)',
                fontSize: '0.85rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.15)', maxWidth: '90%',
              }}>
                {toast.type === 'success' ? <CheckCircle size={15} /> : toast.type === 'error' ? <AlertCircle size={15} /> : null}
                {toast.text}
                <button onClick={() => setToast({ text: '', type: null })}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', padding: '0 0 0 4px' }}>
                  <X size={14} />
                </button>
              </div>
            )}
            <PageToolbar
              activePage={activePage}
              totalPages={session.pages.length}
              isLoading={isLoading}
              onRotate={handleRotate}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
              onInsertBlank={handleInsertBlank}
            />
            <PDFCanvas page={session.pages[activePage - 1]}
              pdfUrl={api.downloadUrl(session.session_id)}
              docVersion={history?.version ?? 0}
              onSelectBlock={setSelectedBlock} onOCRComplete={handleOCRComplete} />
          </main>
          <PropertiesPanel selectedBlock={selectedBlock} onSaveBlockEdits={handleSaveBlockEdits}
            onSearchReplace={handleSearchReplace} isLoading={isLoading} activePage={activePage} />
        </div>
      )}
    </div>
  );
}

export default App;
