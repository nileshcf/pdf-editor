import React from 'react';
import { FileText, FileImage } from 'lucide-react';

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
  setActivePage: (pageNum: number) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ pages, activePage, setActivePage }) => {
  return (
    <aside className="sidebar">
      <h3 style={{ margin: '0 0 16px 0', fontSize: '0.95rem', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>
        PAGES ({pages.length})
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {pages.map((page) => {
          const isActive = page.number === activePage;
          const hasImages = page.images && page.images.length > 0;
          
          return (
            <div
              key={page.number}
              className={`thumbnail-item ${isActive ? 'active' : ''}`}
              onClick={() => setActivePage(page.number)}
            >
              {/* Abstract page content preview */}
              <div style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '12px',
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)'
              }}>
                {hasImages ? (
                  <FileImage size={24} style={{ color: isActive ? 'var(--warning)' : 'inherit' }} />
                ) : (
                  <FileText size={24} style={{ color: isActive ? 'var(--accent-light)' : 'inherit' }} />
                )}
                <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>
                  Page {page.number}
                </span>
                <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>
                  {Math.round(page.width)} x {Math.round(page.height)}
                </span>
              </div>
              <div className="thumbnail-num">{page.number}</div>
            </div>
          );
        })}
      </div>
    </aside>
  );
};
