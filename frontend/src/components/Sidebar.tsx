import React from 'react';

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
  setActivePage: (pageNum: number) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ pages, activePage, filename, setActivePage }) => {
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
              gap: '6px', padding: '10px',
            }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: isActive ? 'var(--teal-dark)' : 'var(--medium)' }}>
                {isScanned ? '[Scan]' : '[Text]'} Page {page.number}
              </span>
              {isScanned && (
                <span style={{
                  background: 'var(--orange)', color: 'white',
                  fontSize: '0.58rem', fontWeight: 900,
                  padding: '2px 7px', borderRadius: 'var(--r-pill)',
                  textTransform: 'uppercase', letterSpacing: '0.5px',
                }}>
                  Scanned
                </span>
              )}
              <span style={{ fontSize: '0.6rem', color: 'var(--medium)', fontWeight: 600, opacity: 0.7 }}>
                {Math.round(page.width)}x{Math.round(page.height)}
              </span>
            </div>
            <div className="thumbnail-num">{page.number}</div>
          </div>
        );
      })}
    </aside>
  );
};
