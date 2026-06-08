import React, { useEffect, useState } from 'react';
import { Copy, FilePlus, Image as ImageIcon, RotateCcw, RotateCw, Trash2 } from 'lucide-react';

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

interface PropertiesPanelProps {
  selectedBlock: SelectedBlock | null;
  activeTool: ToolKey;
  onSaveBlockEdits: (updatedText: string, size: number, font: string, color: string, align: number) => void;
  onInsertImage: () => void;
  onToggleDraw: () => void;
  isDrawing: boolean;
  isLoading: boolean;
  activePage: number;
  onExport: () => void;
  onRotate: (degrees: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onInsertBlank: () => void;
  strokeColor: string;
  onChangeStrokeColor: (color: string) => void;
  fillColor: string;
  onChangeFillColor: (color: string) => void;
  lineWidth: number;
  onChangeLineWidth: (width: number) => void;
  canEdit: boolean;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedBlock,
  activeTool,
  onSaveBlockEdits,
  onInsertImage,
  onToggleDraw,
  isDrawing,
  isLoading,
  activePage,
  onExport,
  onRotate,
  onDuplicate,
  onDelete,
  onInsertBlank,
  strokeColor,
  onChangeStrokeColor,
  fillColor,
  onChangeFillColor,
  lineWidth,
  onChangeLineWidth,
  canEdit,
}) => {
  const [textVal, setTextVal] = useState('');
  const [fontSize, setFontSize] = useState(12);
  const [fontFamily, setFontFamily] = useState('Inter');
  const [colorHex, setColorHex] = useState('#000000');
  const [align, setAlign] = useState(0);
  const [fontWeight, setFontWeight] = useState('Regular');

  useEffect(() => {
    if (!selectedBlock) return;
    setTextVal(selectedBlock.text);
    setFontSize(Math.round(selectedBlock.size));
    setColorHex(selectedBlock.color || '#000000');
    setFontFamily((selectedBlock.font || 'Inter').includes('Courier') ? 'Courier' : 'Inter');
    const flags = selectedBlock.flags || 0;
    const isBold = !!(flags & (1 << 4)) || (selectedBlock.font || '').toLowerCase().includes('bold');
    setFontWeight(isBold ? 'Bold' : 'Regular');
    setAlign(0);
  }, [selectedBlock]);

  return (
    <aside className="right-panel">
      <section className="prop-section">
        <header className="prop-title">PAGE</header>
        <div className="prop-row">
          <span className="prop-label">Page Size</span>
          <span className="prop-value">A4</span>
        </div>
        <div className="prop-row">
          <span className="prop-label">Orientation</span>
          <span className="prop-value">Portrait</span>
        </div>
        <div className="page-actions">
          <button className="mini-icon-btn" title="Rotate Left" onClick={() => onRotate(-90)} disabled={!canEdit || isLoading}>
            <RotateCcw size={14} strokeWidth={1.5} />
          </button>
          <button className="mini-icon-btn" title="Rotate Right" onClick={() => onRotate(90)} disabled={!canEdit || isLoading}>
            <RotateCw size={14} strokeWidth={1.5} />
          </button>
          <button className="mini-icon-btn" title="Duplicate Page" onClick={onDuplicate} disabled={!canEdit || isLoading}>
            <Copy size={14} strokeWidth={1.5} />
          </button>
          <button className="mini-icon-btn" title="Insert Blank Page" onClick={onInsertBlank} disabled={!canEdit || isLoading}>
            <FilePlus size={14} strokeWidth={1.5} />
          </button>
          <button className="mini-icon-btn danger" title="Delete Page" onClick={onDelete} disabled={!canEdit || isLoading}>
            <Trash2 size={14} strokeWidth={1.5} />
          </button>
        </div>
        <div className="prop-note">Page {activePage}</div>
      </section>

      <section className="prop-section">
        <header className="prop-title">TEXT PROPERTIES</header>
        <div className="prop-row">
          <span className="prop-label">Font</span>
          <span className="prop-value">{fontFamily}</span>
        </div>
        <div className="prop-row">
          <span className="prop-label">Weight</span>
          <span className="prop-value">{fontWeight}</span>
        </div>
        <div className="prop-row">
          <span className="prop-label">Size</span>
          <span className="prop-value">{fontSize}px</span>
        </div>
        {activeTool === 'text' && selectedBlock && (
          <div className="text-editor">
            <textarea
              className="prop-textarea"
              value={textVal}
              onChange={(e) => setTextVal(e.target.value)}
              disabled={!canEdit || isLoading}
            />
            <div className="text-editor-row">
              <input
                className="prop-input"
                type="number"
                min={4}
                max={144}
                value={fontSize}
                onChange={(e) => setFontSize(Math.max(4, Number(e.target.value) || 12))}
                disabled={!canEdit || isLoading}
              />
              <select
                className="prop-input"
                value={align}
                onChange={(e) => setAlign(Number(e.target.value))}
                disabled={!canEdit || isLoading}
              >
                <option value={0}>Left</option>
                <option value={1}>Center</option>
                <option value={2}>Right</option>
                <option value={3}>Justify</option>
              </select>
            </div>
            <button
              className="block-save-btn"
              onClick={() => onSaveBlockEdits(textVal, fontSize, fontFamily, colorHex, align)}
              disabled={!canEdit || isLoading}
            >
              {isLoading ? 'Saving...' : 'Apply Text'}
            </button>
          </div>
        )}
      </section>

      <section className="prop-section">
        <header className="prop-title">COLOR</header>
        <div className="color-row">
          <span className="color-swatch" style={{ background: colorHex }} />
          <span className="prop-value">{colorHex.toUpperCase()}</span>
          <input
            className="hidden-color"
            type="color"
            value={colorHex}
            onChange={(e) => setColorHex(e.target.value)}
            disabled={!canEdit || isLoading}
            title="Text Color"
          />
        </div>
        {activeTool === 'draw' && (
          <div className="draw-controls">
            <div className="draw-control">
              <span className="prop-label">Stroke</span>
              <input type="color" value={strokeColor} onChange={(e) => onChangeStrokeColor(e.target.value)} />
            </div>
            <div className="draw-control">
              <span className="prop-label">Fill</span>
              <input type="color" value={fillColor} onChange={(e) => onChangeFillColor(e.target.value)} />
            </div>
            <div className="draw-control">
              <span className="prop-label">Width</span>
              <input
                className="prop-input compact"
                type="number"
                min={1}
                max={20}
                value={lineWidth}
                onChange={(e) => onChangeLineWidth(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <button className={`block-save-btn secondary${isDrawing ? ' active' : ''}`} onClick={onToggleDraw} disabled={!canEdit || isLoading}>
              {isDrawing ? 'Drawing On' : 'Draw Shape'}
            </button>
          </div>
        )}
        {activeTool === 'image' && (
          <button className="block-save-btn secondary" onClick={onInsertImage} disabled={!canEdit || isLoading}>
            <ImageIcon size={14} strokeWidth={1.5} />
            <span>Insert Image</span>
          </button>
        )}
      </section>

      <section className="prop-section">
        <header className="prop-title">EXPORT</header>
        <button className="download-btn" onClick={onExport} disabled={!canEdit}>
          Download PDF
        </button>
      </section>
    </aside>
  );
};
