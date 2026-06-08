import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';
import { createWorker } from 'tesseract.js';
import type { OCRBlockPayload } from '../api';

import { ShapeType } from './ShapeToolbar';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const SCALE = 1.25;

interface PDFPage {
  number: number;
  width: number;
  height: number;
  blocks: any[];
  images: any[];
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

interface PDFCanvasProps {
  page: PDFPage;
  pdfUrl: string;
  // Bumped on every committed edit/undo/redo so the canvas re-fetches and
  // re-renders the latest version (the download URL itself is static).
  docVersion: number;
  onSelectBlock: (block: SelectedBlock) => void;
  onOCRComplete: (pageNum: number, ocrBlocks: OCRBlockPayload[]) => Promise<void> | void;
  selectedBlock: SelectedBlock | null;
  activeShape?: ShapeType | null;
  onDrawShape?: (bbox: number[]) => void;
}

export const PDFCanvas: React.FC<PDFCanvasProps> = ({
  page,
  pdfUrl,
  docVersion,
  onSelectBlock,
  onOCRComplete,
  selectedBlock,
  activeShape,
  onDrawShape,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rendering, setRendering] = useState(false);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState('');

  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentPoint, setCurrentPoint] = useState<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!activeShape) return;
    setIsDrawing(true);
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setStartPoint({ x, y });
    setCurrentPoint({ x, y });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing || !startPoint) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCurrentPoint({ x, y });
  };

  const handlePointerUp = () => {
    if (!isDrawing || !startPoint || !currentPoint || !onDrawShape) return;
    setIsDrawing(false);
    
    const pdfX0 = (Math.min(startPoint.x, currentPoint.x) / SCALE);
    const pdfY0 = (Math.min(startPoint.y, currentPoint.y) / SCALE);
    const pdfX1 = (Math.max(startPoint.x, currentPoint.x) / SCALE);
    const pdfY1 = (Math.max(startPoint.y, currentPoint.y) / SCALE);

    let bbox = [pdfX0, pdfY0, pdfX1, pdfY1];
    if (activeShape === 'line' || activeShape === 'arrow') {
      bbox = [startPoint.x / SCALE, startPoint.y / SCALE, currentPoint.x / SCALE, currentPoint.y / SCALE];
    }
    
    if (Math.abs(currentPoint.x - startPoint.x) > 5 || Math.abs(currentPoint.y - startPoint.y) > 5) {
      onDrawShape(bbox);
    }
    
    setStartPoint(null);
    setCurrentPoint(null);
  };

  /**
   * Bug fix: the old code used a stale `rendering` state closure as a guard,
   * which meant switching pages while a render was in progress would leave the
   * canvas blank. The correct pattern is a per-invocation `cancelled` flag.
   */
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

        // Cache-bust so PDF.js fetches the freshly-edited document, not a stale copy.
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

  // OCR via Tesseract.js
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
          const pdfX0 = (x0 / cw) * page.width;
          const pdfY0 = (y0 / ch) * page.height;
          const pdfX1 = (x1 / cw) * page.width;
          const pdfY1 = (y1 / ch) * page.height;
          return {
            text: p.text.trim(),
            bbox: [pdfX0, pdfY0, pdfX1, pdfY1],
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

  const isScanned = page.blocks.length === 0 && page.images.length > 0;
  const isSelectedSpan = (bbox: number[]) => {
    if (!selectedBlock || selectedBlock.pageNumber !== page.number) return false;
    const eps = 0.01;
    return bbox.length === 4 && selectedBlock.bbox.every((v, i) => Math.abs(v - bbox[i]) < eps);
  };

  return (
    <div
      className="pdf-page-container"
      style={{ width: page.width * SCALE, height: page.height * SCALE }}
    >
      {/* Rendering spinner */}
      {rendering && (
        <div className="rendering-overlay">
          <span className="rendering-label">
            Rendering page {page.number}...
          </span>
        </div>
      )}

      {/* OCR progress overlay */}
      {ocrRunning && (
        <div className="ocr-progress-overlay">
          <span className="ocr-status-label">
            {ocrStatus}
          </span>
          <div className="progress-bar-container">
            <div className="progress-bar-fill" style={{ width: `${ocrProgress}%` }} />
          </div>
          <span className="ocr-percent-label">
            {ocrProgress}% complete
          </span>
        </div>
      )}

      {/* PDF canvas */}
      <canvas ref={canvasRef} className="pdf-canvas" />

      {/* WYSIWYG editable overlay */}
      <div 
        className="editing-overlay-layer"
        style={{ pointerEvents: activeShape ? 'auto' : 'none', cursor: activeShape ? 'crosshair' : 'default' }}
        onPointerDown={activeShape ? handlePointerDown : undefined}
        onPointerMove={activeShape ? handlePointerMove : undefined}
        onPointerUp={activeShape ? handlePointerUp : undefined}
      >
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
              <svg
                className="draw-preview-svg"
                style={{
                  left: startPoint.x < currentPoint.x ? 0 : startPoint.x - currentPoint.x,
                  top: startPoint.y < currentPoint.y ? 0 : startPoint.y - currentPoint.y,
                }}
              >
                <line 
                  x1={startPoint.x < currentPoint.x ? 0 : startPoint.x - currentPoint.x} 
                  y1={startPoint.y < currentPoint.y ? 0 : startPoint.y - currentPoint.y} 
                  x2={startPoint.x < currentPoint.x ? currentPoint.x - startPoint.x : 0} 
                  y2={startPoint.y < currentPoint.y ? currentPoint.y - startPoint.y : 0} 
                  stroke="var(--accent-blue)"
                  strokeWidth={1.5}
                  markerEnd={activeShape === 'arrow' ? 'url(#arrow)' : ''}
                />
                {activeShape === 'arrow' && (
                  <defs>
                    <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent-blue)" />
                    </marker>
                  </defs>
                )}
              </svg>
            )}
          </div>
        )}
        {page.blocks.map((block, bIdx) =>
          block.lines.map((line: any, lIdx: number) =>
            line.spans.map((span: any, sIdx: number) => {
              const [x0, y0, x1, y1] = span.bbox;
              const fontFamily =
                span.font?.includes('Courier') ? 'Courier New' :
                span.font?.includes('Times') ? 'Times New Roman' :
                'Arial';

              return (
                <div
                  key={`${bIdx}-${lIdx}-${sIdx}`}
                  className={`editable-text-block${isSelectedSpan(span.bbox) ? ' selected' : ''}`}
                  title={activeShape ? "" : "Double-click to edit"}
                  style={{
                    left: `${x0 * SCALE}px`,
                    top: `${y0 * SCALE}px`,
                    width: `${(x1 - x0) * SCALE + 4}px`,
                    height: `${(y1 - y0) * SCALE + 2}px`,
                    fontSize: `${span.size * SCALE}px`,
                    fontFamily,
                    color: 'transparent',
                    pointerEvents: activeShape ? 'none' : 'auto',
                  }}
                  onDoubleClick={(e) => {
                    if (activeShape) return;
                    e.stopPropagation();
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
                  {isSelectedSpan(span.bbox) && (
                    <>
                      {Array.from({ length: 8 }).map((_, idx) => (
                        <span key={idx} className={`selection-handle p-${idx + 1}`} />
                      ))}
                    </>
                  )}
                </div>
              );
            })
          )
        )}

        {/* Scanned page OCR prompt */}
        {isScanned && !ocrRunning && (
          <div
            className="scanned-img-highlight"
            style={{ left: '8%', top: '10%', width: '84%', height: '80%' }}
            onClick={runLocalOCR}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && runLocalOCR()}
          >
            <div className="ocr-prompt-badge">
              Scanned page detected
            </div>
            <div className="ocr-empty-state">
              <span className="ocr-empty-label">
                Click to extract text with OCR
              </span>
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
