import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';

// Worker CDN must match pdfjs-dist version (3.4.120)
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

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
}

interface PDFCanvasProps {
  page: PDFPage;
  pdfUrl: string;
  // Bumped on every committed edit/undo/redo so the canvas re-fetches and
  // re-renders the latest version (the download URL itself is static).
  docVersion: number;
  onSelectBlock: (block: SelectedBlock) => void;
  onOCRComplete: (pageNum: number, ocrBlocks: any[]) => void;
}

export const PDFCanvas: React.FC<PDFCanvasProps> = ({
  page,
  pdfUrl,
  docVersion,
  onSelectBlock,
  onOCRComplete,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rendering, setRendering] = useState(false);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState('');

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
    try {
      setOcrRunning(true);
      setOcrProgress(5);
      setOcrStatus('Starting OCR engine...');

      const canvas = canvasRef.current;
      const worker = await createWorker({
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
      const ocrBlocks: any[] = data.paragraphs
        .filter((p: any) => p.text.trim().length > 0)
        .map((p: any) => {
          const { x0, y0, x1, y1 } = p.bbox;
          const pdfX0 = (x0 / cw) * page.width;
          const pdfY0 = (y0 / ch) * page.height;
          const pdfX1 = (x1 / cw) * page.width;
          const pdfY1 = (y1 / ch) * page.height;
          return {
            bbox: [pdfX0, pdfY0, pdfX1, pdfY1],
            lines: [{
              bbox: [pdfX0, pdfY0, pdfX1, pdfY1],
              spans: [{
                text: p.text.trim(),
                bbox: [pdfX0, pdfY0, pdfX1, pdfY1],
                font: 'Helvetica',
                size: 12,
                color: '#000000',
              }],
            }],
          };
        });

      await worker.terminate();
      setOcrRunning(false);
      onOCRComplete(page.number, ocrBlocks);
    } catch (err) {
      console.error('OCR error:', err);
      setOcrStatus('OCR failed. Please try again.');
      setOcrRunning(false);
    }
  };

  const isScanned = page.blocks.length === 0 && page.images.length > 0;

  return (
    <div
      className="pdf-page-container fade-in"
      style={{ width: page.width * SCALE, height: page.height * SCALE }}
    >
      {/* Rendering spinner */}
      {rendering && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 25,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '10px',
          background: 'rgba(248,244,238,0.85)',
          borderRadius: 'calc(var(--r-sm) - 3px)',
        }}>
          <span style={{ fontWeight: 800, color: 'var(--medium)', fontSize: '0.9rem' }}>
            Rendering page {page.number}...
          </span>
        </div>
      )}

      {/* OCR progress overlay */}
      {ocrRunning && (
        <div className="ocr-progress-overlay">
          <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--dark)' }}>
            {ocrStatus}
          </span>
          <div className="progress-bar-container">
            <div className="progress-bar-fill" style={{ width: `${ocrProgress}%` }} />
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--medium)', fontWeight: 700 }}>
            {ocrProgress}% complete
          </span>
        </div>
      )}

      {/* PDF canvas */}
      <canvas ref={canvasRef} className="pdf-canvas" />

      {/* WYSIWYG editable overlay */}
      <div className="editing-overlay-layer">
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
                  className="editable-text-block"
                  title="Double-click to edit"
                  style={{
                    left: `${x0 * SCALE}px`,
                    top: `${y0 * SCALE}px`,
                    width: `${(x1 - x0) * SCALE + 4}px`,
                    height: `${(y1 - y0) * SCALE + 2}px`,
                    fontSize: `${span.size * SCALE}px`,
                    fontFamily,
                    color: 'transparent',
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onSelectBlock({
                      pageNumber: page.number,
                      bbox: span.bbox,
                      text: span.text,
                      font: span.font,
                      size: span.size,
                      color: span.color,
                    });
                  }}
                >
                  {span.text}
                </div>
              );
            })
          )
        )}

        {/* Scanned page OCR prompt */}
        {isScanned && !ocrRunning && (
          <div
            className="scanned-img-highlight"
            style={{ left: '5%', top: '5%', width: '90%', height: '90%' }}
            onClick={runLocalOCR}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && runLocalOCR()}
          >
            <div className="ocr-prompt-badge">
              Scanned page detected -- click to run OCR
            </div>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: '100%', gap: '14px',
            }}>
              <span style={{
                fontSize: '1rem', fontWeight: 800,
                color: 'var(--orange)', textAlign: 'center', maxWidth: '280px',
              }}>
                This page has no text layer.
                <br />Click to extract text with OCR!
              </span>
              <button
                className="btn btn-yellow"
                style={{ pointerEvents: 'none' }}
              >
                Run OCR
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
