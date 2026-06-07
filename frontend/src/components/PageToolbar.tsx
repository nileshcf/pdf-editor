import React from 'react';
import { RotateCcw, RotateCw, Copy, Trash2, FilePlus } from 'lucide-react';

interface PageToolbarProps {
  activePage: number;
  totalPages: number;
  isLoading: boolean;
  onRotate: (degrees: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onInsertBlank: () => void;
}

const ToolButton: React.FC<{
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}> = ({ title, onClick, disabled, danger, children }) => (
  <button
    title={title}
    onClick={onClick}
    disabled={disabled}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      background: 'var(--white)',
      border: '2.5px solid var(--border)',
      borderRadius: 'var(--r-pill)',
      padding: '6px 12px',
      fontSize: '0.78rem',
      fontWeight: 800,
      color: danger ? 'var(--red)' : 'var(--dark)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.45 : 1,
      transition: 'all 0.15s',
    }}
  >
    {children}
  </button>
);

export const PageToolbar: React.FC<PageToolbarProps> = ({
  activePage,
  totalPages,
  isLoading,
  onRotate,
  onDuplicate,
  onDelete,
  onInsertBlank,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      flexWrap: 'wrap',
      padding: '8px 12px',
      marginBottom: '12px',
      background: 'var(--bg)',
      border: '2.5px solid var(--border)',
      borderRadius: 'var(--r-md)',
    }}
  >
    <span style={{ fontWeight: 900, fontSize: '0.72rem', color: 'var(--medium)', textTransform: 'uppercase', letterSpacing: '0.8px', marginRight: '4px' }}>
      Page {activePage}
    </span>
    <ToolButton title="Rotate left 90°" onClick={() => onRotate(-90)} disabled={isLoading}>
      <RotateCcw size={14} /> Left
    </ToolButton>
    <ToolButton title="Rotate right 90°" onClick={() => onRotate(90)} disabled={isLoading}>
      <RotateCw size={14} /> Right
    </ToolButton>
    <ToolButton title="Duplicate this page" onClick={onDuplicate} disabled={isLoading}>
      <Copy size={14} /> Duplicate
    </ToolButton>
    <ToolButton title="Insert a blank page after this one" onClick={onInsertBlank} disabled={isLoading}>
      <FilePlus size={14} /> Insert blank
    </ToolButton>
    <ToolButton title="Delete this page" onClick={onDelete} disabled={isLoading || totalPages <= 1} danger>
      <Trash2 size={14} /> Delete
    </ToolButton>
  </div>
);
