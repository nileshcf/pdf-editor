import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

interface PDFPage {
  number: number;
  width: number;
  height: number;
  blocks: any[];
  images: any[];
}

interface SidebarProps {
  pages: PDFPage[];
  activePage: number;
  filename: string;
  pdfUrl: string;
  docVersion: number;
  setActivePage: (pageNum: number) => void;
}

const ThumbnailCanvas: React.FC<{ page: PDFPage; pdfDoc: any }> = ({ page, pdfDoc }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: any = null;
    const renderPage = async () => {
      if (!canvasRef.current || !pdfDoc) return;
      try {
        const pdfPage = await pdfDoc.getPage(page.number);
        if (cancelled) return;
        const viewport = pdfPage.getViewport({ scale: 1 });
        const thumbHeight = 120; // max height
        const scale = thumbHeight / viewport.height;
        const scaledViewport = pdfPage.getViewport({ scale });
        
        const canvas = canvasRef.current;
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          renderTask = pdfPage.render({ canvasContext: ctx, viewport: scaledViewport });
          await renderTask.promise;
        }
      } catch (err) {
        // ignore cancellation
      }
    };
    renderPage();
    return () => { cancelled = true; renderTask?.cancel(); };
  }, [page, pdfDoc]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />;
};

export const Sidebar: React.FC<SidebarProps> = ({ pages, activePage, filename, pdfUrl, docVersion, setActivePage }) => {
  const [pdfDoc, setPdfDoc] = useState<any>(null);

  useEffect(() => {
    let loadingTask: any = null;
    const loadPdf = async () => {
      if (!pdfUrl) return;
      try {
        loadingTask = pdfjsLib.getDocument(pdfUrl + '?v=' + docVersion);
        const doc = await loadingTask.promise;
        setPdfDoc(doc);
      } catch (err) {
        console.error('Sidebar PDF load error:', err);
      }
    };
    loadPdf();
    return () => { loadingTask?.destroy(); };
  }, [pdfUrl, docVersion]);
  return (
    <aside className="sidebar">
      <div style={{
        background: 'var(--bg)',
        border: '2.5px solid var(--border)',
        borderRadius: 'var(--r-md)',
        padding: '10px 12px',
        marginBottom: '14px',
      }}>
        <div className="section-label" style={{ marginBottom: '4px' }}>Open file</div>
        <div style={{
          fontSize: '0.8rem', fontWeight: 700, color: 'var(--dark)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }} title={filename}>
          {filename}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span className="section-label">Pages</span>
        <span style={{
          background: 'var(--teal)', color: 'white',
          fontSize: '0.68rem', fontWeight: 900,
          padding: '2px 9px', borderRadius: 'var(--r-pill)',
        }}>
          {pages.length}
        </span>
      </div>

      {pages.map((page) => {
        const isActive = page.number === activePage;
        const isScanned = page.images.length > 0 && page.blocks.length === 0;
        return (
          <div
            key={page.number}
            className={`thumbnail-item${isActive ? ' active' : ''}`}
            onClick={() => setActivePage(page.number)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && setActivePage(page.number)}
            title={`Go to page ${page.number}`}
          >
            <div style={{
              width: '100%', height: '100%',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              position: 'relative'
            }}>
              {pdfDoc ? (
                <ThumbnailCanvas page={page} pdfDoc={pdfDoc} />
              ) : (
                <div style={{ padding: '20px', color: 'var(--medium)', fontSize: '0.8rem', fontWeight: 800 }}>Loading...</div>
              )}
              {isScanned && (
                <span style={{
                  position: 'absolute', top: '4px', left: '4px',
                  background: 'var(--orange)', color: 'white',
                  fontSize: '0.58rem', fontWeight: 900,
                  padding: '2px 7px', borderRadius: 'var(--r-pill)',
                  textTransform: 'uppercase', letterSpacing: '0.5px',
                  zIndex: 10
                }}>
                  Scanned
                </span>
              )}
            </div>
            <div className="thumbnail-num">{page.number}</div>
          </div>
        );
      })}
    </aside>
  );
};
