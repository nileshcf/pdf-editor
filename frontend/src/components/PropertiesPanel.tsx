import React, { useState, useEffect } from 'react';

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
  onSaveBlockEdits: (updatedText: string, size: number, font: string, color: string, align: number) => void;
  onSearchReplace: (
    searchTerm: string,
    replacement: string,
    pageOnly: boolean,
    opts: { caseSensitive: boolean; wholeWord: boolean }
  ) => void;
  onInsertImage: () => void;
  onToggleDraw: () => void;
  isDrawing: boolean;
  isLoading: boolean;
  activePage: number;
}

const FL: React.FC<{ t: string }> = ({ t }) => (
  <label style={{
    fontSize: '0.68rem', fontWeight: 900, textTransform: 'uppercase',
    letterSpacing: '0.9px', color: 'var(--medium)', display: 'block', marginBottom: '5px',
  }}>{t}</label>
);

const Card: React.FC<{ children: React.ReactNode; accent?: string }> = ({ children, accent }) => (
  <div style={{
    background: 'var(--bg)', border: '3px solid ' + (accent || 'var(--border)'),
    borderRadius: 'var(--r-md)', padding: '14px',
  }}>{children}</div>
);

const Check: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--dark)', cursor: 'pointer' }}>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    {label}
  </label>
);

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedBlock, onSaveBlockEdits, onSearchReplace, onInsertImage, onToggleDraw, isDrawing, isLoading, activePage,
}) => {
  const [textVal, setTextVal] = useState('');
  const [fontSize, setFontSize] = useState(12);
  const [fontFamily, setFontFamily] = useState('Helvetica');
  const [colorHex, setColorHex] = useState('#000000');
  const [align, setAlign] = useState(0);
  const [searchWord, setSearchWord] = useState('');
  const [replaceWord, setReplaceWord] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);

  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);

  const resolveFont = (base: string, b: boolean, i: boolean) => {
    if (base.includes('Helvetica')) {
      if (b && i) return 'Helvetica-BoldOblique';
      if (b) return 'Helvetica-Bold';
      if (i) return 'Helvetica-Oblique';
      return 'Helvetica';
    }
    if (base.includes('Times')) {
      if (b && i) return 'Times-BoldItalic';
      if (b) return 'Times-Bold';
      if (i) return 'Times-Italic';
      return 'Times-Roman';
    }
    if (base.includes('Courier')) {
      if (b && i) return 'Courier-BoldOblique';
      if (b) return 'Courier-Bold';
      if (i) return 'Courier-Oblique';
      return 'Courier';
    }
    return base;
  };

  useEffect(() => {
    if (selectedBlock) {
      setTextVal(selectedBlock.text);
      setFontSize(Math.round(selectedBlock.size));
      
      const f = selectedBlock.flags || 0;
      const b = !!(f & (1 << 4)) || (selectedBlock.font || '').toLowerCase().includes('bold');
      const i = !!(f & (1 << 1)) || (selectedBlock.font || '').toLowerCase().includes('italic') || (selectedBlock.font || '').toLowerCase().includes('oblique');
      setIsBold(b);
      setIsItalic(i);

      let baseFont = 'Helvetica';
      if ((f & (1 << 3)) || (selectedBlock.font || '').toLowerCase().includes('courier')) baseFont = 'Courier';
      else if ((f & (1 << 2)) || (selectedBlock.font || '').toLowerCase().includes('times')) baseFont = 'Times';
      
      setFontFamily(resolveFont(baseFont, b, i));
      setColorHex(selectedBlock.color || '#000000');
      setAlign(0);
    }
  }, [selectedBlock]);

  const toggleBold = () => {
    const next = !isBold;
    setIsBold(next);
    setFontFamily(resolveFont(fontFamily, next, isItalic));
  };

  const toggleItalic = () => {
    const next = !isItalic;
    setIsItalic(next);
    setFontFamily(resolveFont(fontFamily, isBold, next));
  };

  const onBaseFontChange = (val: string) => {
    setFontFamily(resolveFont(val, isBold, isItalic));
  };

  return (
    <aside className="properties-panel">
      {selectedBlock ? (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Card accent="var(--teal-light)">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ fontWeight: 900, fontSize: '0.9rem', color: 'var(--dark)' }}>Edit Text Block</span>
              <span style={{
                marginLeft: 'auto', background: 'var(--teal)', color: 'white',
                fontSize: '0.65rem', fontWeight: 900, padding: '2px 8px', borderRadius: 'var(--r-pill)',
              }}>p.{selectedBlock.pageNumber}</span>
            </div>
            <FL t="Content" />
            <textarea
              className="input-text"
              style={{ minHeight: '90px', resize: 'vertical', lineHeight: 1.5, marginBottom: '10px' }}
              value={textVal}
              onChange={(e) => setTextVal(e.target.value)}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <FL t="Font size (pt)" />
                <input type="number" className="input-text" min={4} max={144}
                  value={fontSize} onChange={(e) => setFontSize(Math.max(4, Number(e.target.value)))} />
              </div>
              <div>
                <FL t="Color" />
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="color" value={colorHex} onChange={(e) => setColorHex(e.target.value)}
                    style={{ width: '36px', height: '36px', border: '2.5px solid var(--border)',
                      borderRadius: 'var(--r-sm)', cursor: 'pointer', padding: '2px', background: 'var(--white)' }} />
                  <code style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--dark)', fontWeight: 700 }}>
                    {colorHex.toUpperCase()}
                  </code>
                </div>
              </div>
            </div>
            <FL t="Typeface & Style" />
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <select className="input-text" value={fontFamily.split('-')[0].replace('Times', 'Times-Roman')}
                onChange={(e) => onBaseFontChange(e.target.value)}
                style={{ background: 'var(--white)', flex: 1 }}>
                <option value="Helvetica">Helvetica</option>
                <option value="Times-Roman">Times</option>
                <option value="Courier">Courier</option>
              </select>
              <button 
                onClick={toggleBold} 
                style={{ 
                  width: '38px', height: '38px', 
                  borderRadius: 'var(--r-sm)', border: '2.5px solid var(--border)', 
                  background: isBold ? 'var(--teal-light)' : 'var(--white)', 
                  color: isBold ? 'white' : 'var(--dark)',
                  fontWeight: 900, cursor: 'pointer' 
                }}>B</button>
              <button 
                onClick={toggleItalic} 
                style={{ 
                  width: '38px', height: '38px', 
                  borderRadius: 'var(--r-sm)', border: '2.5px solid var(--border)', 
                  background: isItalic ? 'var(--teal-light)' : 'var(--white)', 
                  color: isItalic ? 'white' : 'var(--dark)',
                  fontWeight: 900, fontStyle: 'italic', cursor: 'pointer' 
                }}>I</button>
            </div>
            <FL t="Alignment" />
            <select className="input-text" value={align}
              onChange={(e) => setAlign(Number(e.target.value))}
              style={{ marginBottom: '14px', background: 'var(--white)' }}>
              <option value={0}>Left</option>
              <option value={1}>Center</option>
              <option value={2}>Right</option>
              <option value={3}>Justify</option>
            </select>
            <button className="btn btn-primary" style={{ width: '100%' }}
              onClick={() => onSaveBlockEdits(textVal, fontSize, fontFamily, colorHex, align)}
              disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Apply edits'}
            </button>
          </Card>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Card>
            <div style={{ fontWeight: 900, fontSize: '0.88rem', marginBottom: '10px', color: 'var(--dark)' }}>
              How to edit
            </div>
            {[
              'Double-click any text on the page to edit it',
              'Use the page toolbar to rotate, duplicate or delete pages',
              'Scanned pages show an orange OCR button — click it',
              'Undo / redo any change with Ctrl+Z / Ctrl+Shift+Z',
            ].map((label) => (
              <div key={label} style={{
                fontSize: '0.82rem', color: 'var(--dark)', fontWeight: 600, lineHeight: 1.4,
                paddingLeft: '8px', borderLeft: '3px solid var(--teal-light)',
                marginBottom: '6px',
              }}>{label}</div>
            ))}
          </Card>
          <hr className="divider" />
          <Card accent="var(--teal)">
            <div style={{ fontWeight: 900, fontSize: '0.88rem', marginBottom: '12px', color: 'var(--dark)' }}>
              Insert & Draw
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button className="btn btn-secondary" onClick={onInsertImage} disabled={isLoading} style={{ fontSize: '0.8rem' }}>
                Insert Image
              </button>
              <button className="btn btn-secondary" onClick={onToggleDraw} disabled={isLoading} style={{ fontSize: '0.8rem', background: isDrawing ? 'var(--teal-light)' : 'var(--white)', color: isDrawing ? 'white' : 'var(--dark)' }}>
                {isDrawing ? 'Drawing...' : 'Draw Shape'}
              </button>
            </div>
          </Card>
          <hr className="divider" />
          <Card accent="var(--yellow)">
            <div style={{ fontWeight: 900, fontSize: '0.88rem', marginBottom: '12px', color: 'var(--dark)' }}>
              Find and Replace
            </div>
            <FL t="Find" />
            <input type="text" className="input-text" placeholder="Text to find..."
              value={searchWord} onChange={(e) => setSearchWord(e.target.value)}
              style={{ marginBottom: '10px' }} />
            <FL t="Replace with" />
            <input type="text" className="input-text" placeholder="Replacement text..."
              value={replaceWord} onChange={(e) => setReplaceWord(e.target.value)}
              style={{ marginBottom: '12px' }} />
            <div style={{ display: 'flex', gap: '16px', marginBottom: '14px' }}>
              <Check label="Match case" checked={caseSensitive} onChange={setCaseSensitive} />
              <Check label="Whole word" checked={wholeWord} onChange={setWholeWord} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button className="btn btn-secondary"
                onClick={() => onSearchReplace(searchWord, replaceWord, true, { caseSensitive, wholeWord })}
                disabled={isLoading || !searchWord.trim()}
                style={{ fontSize: '0.8rem' }}
                title={'Replace on page ' + activePage + ' only'}>
                Page {activePage}
              </button>
              <button className="btn btn-primary"
                onClick={() => onSearchReplace(searchWord, replaceWord, false, { caseSensitive, wholeWord })}
                disabled={isLoading || !searchWord.trim()}
                style={{ fontSize: '0.8rem' }}>
                All pages
              </button>
            </div>
          </Card>
        </div>
      )}
    </aside>
  );
};
