import React, { useState } from 'react';
import { Image as ImageIcon, X } from 'lucide-react';

interface ImageInsertModalProps {
  onClose: () => void;
  onInsert: (file: File, x: number, y: number, w: number, h: number) => void;
  isLoading: boolean;
}

export const ImageInsertModal: React.FC<ImageInsertModalProps> = ({ onClose, onInsert, isLoading }) => {
  const [file, setFile] = useState<File | null>(null);
  const [x, setX] = useState(100);
  const [y, setY] = useState(100);
  const [w, setW] = useState(200);
  const [h, setH] = useState(200);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (file && !isLoading) {
      onInsert(file, x, y, w, h);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        background: 'var(--white)', padding: '24px', borderRadius: 'var(--r-md)',
        width: '400px', maxWidth: '90%', border: '3px solid var(--border)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ImageIcon size={20} /> Insert Image
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 800 }}>Image File</label>
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)}
              style={{ width: '100%', marginTop: '4px' }} required />
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 800 }}>X Position</label>
              <input type="number" className="input-text" value={x} onChange={(e) => setX(Number(e.target.value))} required />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 800 }}>Y Position</label>
              <input type="number" className="input-text" value={y} onChange={(e) => setY(Number(e.target.value))} required />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 800 }}>Width</label>
              <input type="number" className="input-text" value={w} onChange={(e) => setW(Number(e.target.value))} required />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 800 }}>Height</label>
              <input type="number" className="input-text" value={h} onChange={(e) => setH(Number(e.target.value))} required />
            </div>
          </div>
          
          <button type="submit" className="btn btn-primary" disabled={!file || isLoading} style={{ marginTop: '12px' }}>
            {isLoading ? 'Inserting...' : 'Insert Image'}
          </button>
        </form>
      </div>
    </div>
  );
};
