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
  const [w, setW] = useState(220);
  const [h, setH] = useState(180);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || isLoading) return;
    onInsert(file, x, y, w, h);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-panel">
        <div className="modal-header">
          <h3>
            <ImageIcon size={16} strokeWidth={1.5} />
            <span>Insert Image</span>
          </h3>
          <button onClick={onClose} className="modal-close-btn">
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <label className="modal-label">
            File
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
          </label>

          <div className="modal-grid">
            <label className="modal-label">
              X
              <input type="number" className="prop-input" value={x} onChange={(e) => setX(Number(e.target.value))} required />
            </label>
            <label className="modal-label">
              Y
              <input type="number" className="prop-input" value={y} onChange={(e) => setY(Number(e.target.value))} required />
            </label>
            <label className="modal-label">
              Width
              <input type="number" className="prop-input" value={w} onChange={(e) => setW(Number(e.target.value))} required />
            </label>
            <label className="modal-label">
              Height
              <input type="number" className="prop-input" value={h} onChange={(e) => setH(Number(e.target.value))} required />
            </label>
          </div>

          <button type="submit" className="download-btn" disabled={!file || isLoading}>
            {isLoading ? 'Inserting...' : 'Insert Image'}
          </button>
        </form>
      </div>
    </div>
  );
};
