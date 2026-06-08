import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';
import { createWorker } from 'tesseract.js';
import type { EditorObject, OCRBlockPayload, PDFPage, ShapeObjectType, UpdateObjectPayload } from '../api';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const SCALE = 1.25;

type ToolKey = 'cursor' | 'text' | 'image' | 'draw' | 'signature' | 'comment';

interface SelectedBlock {
  pageNumber: number;
  bbox: number[];
  text: string;
  font: string;
  size: number;
  color: string;
  flags?: number;
}

interface PDFCanvasProps {
  page: PDFPage;
  pdfUrl: string;
  docVersion: number;
  onSelectBlock: (block: SelectedBlock | null) => void;
  onOCRComplete: (pageNum: number, ocrBlocks: OCRBlockPayload[]) => Promise<void> | void;
  selectedBlock: SelectedBlock | null;
  selectedObjectId: string | null;
  onSelectObject: (objectId: string | null) => void;
  activeTool: ToolKey;
  activeShape?: ShapeObjectType | null;
  onDrawShape?: (bbox: number[]) => void;
  onCreateObject: (tool: 'text' | 'comment' | 'signature', bbox: [number, number, number, number]) => Promise<void> | void;
  onUpdateObject: (objectId: string, changes: UpdateObjectPayload) => void;
  assetUrlFor: (assetId: string) => string;
}

interface Point {
  x: number;
  y: number;
}

interface DragState {
  id: string;
  start: Point;
  origin: [number, number, number, number];
  delta: Point;
}

export const PDFCanvas: React.FC<PDFCanvasProps> = ({
  page,
  pdfUrl,
  docVersion,
  onSelectBlock,
  onOCRComplete,
  selectedBlock,
  selectedObjectId,
  onSelectObject,
  activeTool,
  activeShape,
  onDrawShape,
  onCreateObject,
  onUpdateObject,
  assetUrlFor,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [rendering, setRendering] = useState(false);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const objects = useMemo(() => [...(page.objects || [])].sort((a, b) => (a.z_index ?? 0) - (b.z_index ?? 0)), [page.objects]);

  useEffect(() => {
    let cancelled = false;
    let renderTask: any = null;

    const renderPage = async () => {
      if (!canvasRef.current) return;
      setRendering(true);
      try {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx || cancelled) return;

        const versionedUrl = pdfUrl + (pdfUrl.includes('?') ? '&' : '?') + 'v=' + docVersion;
        const loadingTask = pdfjsLib.getDocument(versionedUrl);
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        const pdfPage = await pdf.getPage(page.number);
        if (cancelled) return;

        const viewport = pdfPage.getViewport({ scale: SCALE });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        renderTask = pdfPage.render({ canvasContext: ctx, viewport });
        await renderTask.promise;
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('PDF render error:', err);
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    };

    renderPage();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdfUrl, page.number, docVersion]);

  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (event: PointerEvent) => {
      setDragState((current) =>
        current
          ? {
              ...current,
              delta: {
                x: event.clientX - current.start.x,
                y: event.clientY - current.start.y,
              },
            }
          : null
      );
    };

    const handlePointerUp = () => {
      setDragState((current) => {
        if (current) {
          const dx = current.delta.x / SCALE;
          const dy = current.delta.y / SCALE;
          if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
            const [x0, y0, x1, y1] = current.origin;
            onUpdateObject(current.id, {
              bbox: [x0 + dx, y0 + dy, x1 + dx, y1 + dy],
            });
          }
        }
        return null;
      });
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragState, onUpdateObject]);

  const isScanned = page.blocks.length === 0 && page.images.length > 0;

  const isSelectedSpan = (bbox: number[]) => {
    if (!selectedBlock || selectedBlock.pageNumber !== page.number) return false;
    const eps = 0.01;
    return bbox.length === 4 && selectedBlock.bbox.every((v, i) => Math.abs(v - bbox[i]) < eps);
  };

  const getPointerPoint = (event: React.PointerEvent<HTMLElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const beginShapeDraw = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = getPointerPoint(event);
    setIsDrawing(true);
    setStartPoint(point);
    setCurrentPoint(point);
  };

  const continueShapeDraw = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawing || !startPoint) return;
    setCurrentPoint(getPointerPoint(event));
  };

  const finishShapeDraw = () => {
    if (!isDrawing || !startPoint || !currentPoint || !onDrawShape) return;
    setIsDrawing(false);

    let bbox: [number, number, number, number] = [
      Math.min(startPoint.x, currentPoint.x) / SCALE,
      Math.min(startPoint.y, currentPoint.y) / SCALE,
      Math.max(startPoint.x, currentPoint.x) / SCALE,
      Math.max(startPoint.y, currentPoint.y) / SCALE,
    ];
    if (activeShape === 'line' || activeShape === 'arrow') {
      bbox = [startPoint.x / SCALE, startPoint.y / SCALE, currentPoint.x / SCALE, currentPoint.y / SCALE];
    }

    if (Math.abs(currentPoint.x - startPoint.x) > 5 || Math.abs(currentPoint.y - startPoint.y) > 5) {
      onDrawShape(bbox);
    }

    setStartPoint(null);
    setCurrentPoint(null);
  };

  const handleLayerPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;

    if (activeTool === 'draw' && activeShape) {
      beginShapeDraw(event);
      return;
    }

    if (activeTool === 'text' || activeTool === 'comment' || activeTool === 'signature') {
      const point = getPointerPoint(event);
      const baseHeight = activeTool === 'comment' ? 88 : 48;
      const baseWidth = activeTool === 'comment' ? 190 : 220;
      onCreateObject(activeTool, [
        point.x / SCALE,
        point.y / SCALE,
        (point.x + baseWidth) / SCALE,
        (point.y + baseHeight) / SCALE,
      ]);
      return;
    }

    onSelectObject(null);
    onSelectBlock(null);
  };

  const handleLayerPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool === 'draw' && activeShape) {
      continueShapeDraw(event);
    }
  };

  const handleLayerPointerUp = () => {
    if (activeTool === 'draw' && activeShape) {
      finishShapeDraw();
    }
  };

  const handleObjectPointerDown = (event: React.PointerEvent<HTMLDivElement>, object: EditorObject) => {
    event.stopPropagation();
    onSelectObject(object.id);
    if (activeTool !== 'cursor' || object.locked) return;
    setDragState({
      id: object.id,
      start: { x: event.clientX, y: event.clientY },
      origin: [...object.bbox] as [number, number, number, number],
      delta: { x: 0, y: 0 },
    });
  };

  const getRenderBBox = (object: EditorObject): [number, number, number, number] => {
    if (dragState?.id !== object.id) return object.bbox;
    const dx = dragState.delta.x / SCALE;
    const dy = dragState.delta.y / SCALE;
    return [
      object.bbox[0] + dx,
      object.bbox[1] + dy,
      object.bbox[2] + dx,
      object.bbox[3] + dy,
    ];
  };

  const renderObject = (object: EditorObject) => {
    const bbox = getRenderBBox(object);
    const [x0, y0, x1, y1] = bbox;
    const style: React.CSSProperties = {
      left: x0 * SCALE,
      top: y0 * SCALE,
      width: Math.max((x1 - x0) * SCALE, 2),
      height: Math.max((y1 - y0) * SCALE, 2),
      zIndex: (object.z_index ?? 0) + 10,
      opacity: object.opacity ?? 1,
    };
    const selected = selectedObjectId === object.id;

    if (object.type === 'image') {
      return (
        <div
          key={object.id}
          className={`canvas-object image-object${selected ? ' selected' : ''}`}
          style={style}
          onPointerDown={(event) => handleObjectPointerDown(event, object)}
        >
          <img src={assetUrlFor(object.asset_id)} alt="" draggable={false} />
          {selected && Array.from({ length: 8 }).map((_, idx) => <span key={idx} className={`selection-handle p-${idx + 1}`} />)}
        </div>
      );
    }

    if (object.type === 'shape') {
      if (object.shape_type === 'line' || object.shape_type === 'arrow') {
        return (
          <div
            key={object.id}
            className={`canvas-object line-object${selected ? ' selected' : ''}`}
            style={style}
            onPointerDown={(event) => handleObjectPointerDown(event, object)}
          >
            <svg className="line-object-svg" viewBox={`0 0 ${Math.max(style.width as number, 2)} ${Math.max(style.height as number, 2)}`}>
              <defs>
                <marker id={`arrow-${object.id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={object.stroke_color || '#000000'} />
                </marker>
              </defs>
              <line
                x1={0}
                y1={0}
                x2={Math.max(style.width as number, 2)}
                y2={Math.max(style.height as number, 2)}
                stroke={object.stroke_color || '#000000'}
                strokeWidth={object.line_width || 2}
                markerEnd={object.shape_type === 'arrow' ? `url(#arrow-${object.id})` : undefined}
              />
            </svg>
            {selected && Array.from({ length: 8 }).map((_, idx) => <span key={idx} className={`selection-handle p-${idx + 1}`} />)}
          </div>
        );
      }

      return (
        <div
          key={object.id}
          className={`canvas-object shape-object ${object.shape_type}${selected ? ' selected' : ''}`}
          style={{
            ...style,
            borderColor: object.stroke_color || '#000000',
            borderWidth: object.line_width || 2,
            background: object.fill_color || 'transparent',
          }}
          onPointerDown={(event) => handleObjectPointerDown(event, object)}
        >
          {selected && Array.from({ length: 8 }).map((_, idx) => <span key={idx} className={`selection-handle p-${idx + 1}`} />)}
        </div>
      );
    }

    const textStyle: React.CSSProperties = {
      ...style,
      color: object.color || '#000000',
      fontSize: `${object.font_size || (object.type === 'signature' ? 20 : 14)}px`,
      fontFamily: object.type === 'signature' ? `"Times New Roman", serif` : object.font_family || 'Inter',
      fontStyle: object.type === 'signature' ? 'italic' : object.font_style || 'normal',
      fontWeight: object.font_weight?.toLowerCase() === 'bold' ? 600 : 400,
      justifyContent:
        object.align === 'center' ? 'center' :
        object.align === 'right' ? 'flex-end' :
        'flex-start',
      textAlign: object.align || 'left',
      background: object.type === 'comment' ? object.fill_color || '#fff6bf' : 'transparent',
      borderColor: object.type === 'comment' ? object.stroke_color || '#d7b200' : 'transparent',
      borderWidth: object.type === 'comment' ? object.line_width || 1.5 : 1,
    };

    return (
      <div
        key={object.id}
        className={`canvas-object textlike-object ${object.type}${selected ? ' selected' : ''}`}
        style={textStyle}
        onPointerDown={(event) => handleObjectPointerDown(event, object)}
      >
        <span>{object.text}</span>
        {selected && Array.from({ length: 8 }).map((_, idx) => <span key={idx} className={`selection-handle p-${idx + 1}`} />)}
      </div>
    );
  };

  const runLocalOCR = async () => {
    if (!canvasRef.current || ocrRunning) return;
    let worker: any = null;
    try {
      setOcrRunning(true);
      setOcrProgress(5);
      setOcrStatus('Starting OCR engine...');

      const canvas = canvasRef.current;
      worker = await createWorker({
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            setOcrStatus('Reading characters...');
            setOcrProgress(Math.round(m.progress * 100));
          }
        },
      });

      setOcrStatus('Loading English language data...');
      await worker.loadLanguage('eng');
      await worker.initialize('eng');

      setOcrStatus('Scanning page...');
      const dataUrl = canvas.toDataURL('image/png');
      const { data } = await worker.recognize(dataUrl);

      const cw = canvas.width;
      const ch = canvas.height;
      const ocrBlocks: OCRBlockPayload[] = data.paragraphs
        .filter((p: any) => p.text.trim().length > 0)
        .map((p: any) => {
          const { x0, y0, x1, y1 } = p.bbox;
          return {
            text: p.text.trim(),
            bbox: [(x0 / cw) * page.width, (y0 / ch) * page.height, (x1 / cw) * page.width, (y1 / ch) * page.height],
            font_name: 'Helvetica',
            font_size: 12,
            hex_color: '#000000',
            auto_shrink: true,
          };
        });
      if (!ocrBlocks.length) {
        setOcrStatus('No text detected on this page.');
        return;
      }
      setOcrProgress(100);
      setOcrStatus('Saving OCR text...');
      await onOCRComplete(page.number, ocrBlocks);
    } catch (err) {
      console.error('OCR error:', err);
      setOcrStatus('OCR failed. Please try again.');
    } finally {
      try {
        await worker?.terminate();
      } catch {
        // no-op
      }
      setOcrRunning(false);
    }
  };

  return (
    <div className="pdf-page-container" style={{ width: page.width * SCALE, height: page.height * SCALE }}>
      {rendering && (
        <div className="rendering-overlay">
          <span className="rendering-label">Rendering page {page.number}...</span>
        </div>
      )}

      {ocrRunning && (
        <div className="ocr-progress-overlay">
          <span className="ocr-status-label">{ocrStatus}</span>
          <div className="progress-bar-container">
            <div className="progress-bar-fill" style={{ width: `${ocrProgress}%` }} />
          </div>
          <span className="ocr-percent-label">{ocrProgress}% complete</span>
        </div>
      )}

      <canvas ref={canvasRef} className="pdf-canvas" />

      <div
        ref={layerRef}
        className={`editing-overlay-layer${activeTool === 'draw' ? ' drawing-mode' : ''}`}
        onPointerDown={handleLayerPointerDown}
        onPointerMove={handleLayerPointerMove}
        onPointerUp={handleLayerPointerUp}
      >
        <div className="object-overlay-layer">
          {objects.map((object) => renderObject(object))}
        </div>

        {isDrawing && startPoint && currentPoint && (
          <div
            className={`draw-preview${activeShape === 'line' || activeShape === 'arrow' ? ' line-preview' : ''}`}
            style={{
              left: Math.min(startPoint.x, currentPoint.x),
              top: Math.min(startPoint.y, currentPoint.y),
              width: Math.abs(currentPoint.x - startPoint.x),
              height: Math.abs(currentPoint.y - startPoint.y),
            }}
          >
            {(activeShape === 'line' || activeShape === 'arrow') && (
              <svg className="draw-preview-svg">
                <defs>
                  <marker id="shape-arrow-preview" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent-blue)" />
                  </marker>
                </defs>
                <line
                  x1={startPoint.x < currentPoint.x ? 0 : Math.abs(currentPoint.x - startPoint.x)}
                  y1={startPoint.y < currentPoint.y ? 0 : Math.abs(currentPoint.y - startPoint.y)}
                  x2={startPoint.x < currentPoint.x ? Math.abs(currentPoint.x - startPoint.x) : 0}
                  y2={startPoint.y < currentPoint.y ? Math.abs(currentPoint.y - startPoint.y) : 0}
                  stroke="var(--accent-blue)"
                  strokeWidth={1.5}
                  markerEnd={activeShape === 'arrow' ? 'url(#shape-arrow-preview)' : undefined}
                />
              </svg>
            )}
          </div>
        )}

        {page.blocks.map((block, bIdx) =>
          block.lines.map((line: any, lIdx: number) =>
            line.spans.map((span: any, sIdx: number) => {
              const [x0, y0, x1, y1] = span.bbox;
              const fontFamily =
                span.font?.includes('Courier') ? 'Courier New' : span.font?.includes('Times') ? 'Times New Roman' : 'Arial';

              return (
                <div
                  key={`${bIdx}-${lIdx}-${sIdx}`}
                  className={`editable-text-block${isSelectedSpan(span.bbox) ? ' selected' : ''}`}
                  title={activeTool === 'draw' ? '' : 'Double-click to edit'}
                  style={{
                    left: `${x0 * SCALE}px`,
                    top: `${y0 * SCALE}px`,
                    width: `${(x1 - x0) * SCALE + 4}px`,
                    height: `${(y1 - y0) * SCALE + 2}px`,
                    fontSize: `${span.size * SCALE}px`,
                    fontFamily,
                    color: 'transparent',
                    pointerEvents: activeTool === 'draw' ? 'none' : 'auto',
                  }}
                  onDoubleClick={(e) => {
                    if (activeTool === 'draw') return;
                    e.stopPropagation();
                    onSelectObject(null);
                    onSelectBlock({
                      pageNumber: page.number,
                      bbox: span.bbox,
                      text: span.text,
                      font: span.font,
                      size: span.size,
                      color: span.color,
                      flags: span.flags,
                    });
                  }}
                >
                  {span.text}
                  {isSelectedSpan(span.bbox) && Array.from({ length: 8 }).map((_, idx) => <span key={idx} className={`selection-handle p-${idx + 1}`} />)}
                </div>
              );
            })
          )
        )}

        {isScanned && !ocrRunning && (
          <div
            className="scanned-img-highlight"
            style={{ left: '8%', top: '10%', width: '84%', height: '80%' }}
            onClick={runLocalOCR}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && runLocalOCR()}
          >
            <div className="ocr-prompt-badge">Scanned page detected</div>
            <div className="ocr-empty-state">
              <span className="ocr-empty-label">Click to extract text with OCR</span>
              <button className="ocr-action-btn" style={{ pointerEvents: 'none' }}>
                Run OCR
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
