import React, { useState, useEffect } from 'react';

interface SelectedBlock {
  pageNumber: number;
  bbox: number[];
  text: string;
  font: string;
  size: number;
  color: string;
}

interface PropertiesPanelProps {
  selectedBlock: SelectedBlock | null;
  onSaveBlockEdits: (updatedText: string, size: number, font: string, color: string) => void;
  onSearchReplace: (searchTerm: string, replacement: string, pageOnly: boolean) => void;
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

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedBlock, onSaveBlockEdits, onSearchReplace, isLoading, activePage,
}) => {
  const [textVal, setTextVal] = useState('');
  const [fontSize, setFontSize] = useState(12);
  const [fontFamily, setFontFamily] = useState('Helvetica');
  const [colorHex, setColorHex] = useState('#000000');
  const [searchWord, setSearchWord] = useState('');
  const [replaceWord, setReplaceWord] = useState('');

  useEffect(() => {
    if (selectedBlock) {
      setTextVal(selectedBlock.text);
      setFontSize(Math.round(selectedBlock.size));
      setFontFamily(selectedBlock.font || 'Helvetica');
      setColorHex(selectedBlock.color || '#000000');
    }
  }, [selectedBlock]);

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
            <FL t="Typeface" />
            <select className="input-text" value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              style={{ marginBottom: '14px', background: 'var(--white)' }}>
              <option value="Helvetica">Helvetica - Sans-Serif</option>
              <option value="Times-Roman">Times Roman - Serif</option>
              <option value="Courier">Courier - Monospace</option>
            </select>
            <button className="btn btn-primary" style={{ width: '100%' }}
              onClick={() => onSaveBlockEdits(textVal, fontSize, fontFamily, colorHex)}
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
              'Hover over text to see selectable regions highlighted',
              'Scanned pages show an orange OCR button - click it',
              'Use the command bar in the header for quick replacements',
            ].map((label) => (
              <div key={label} style={{
                fontSize: '0.82rem', color: 'var(--dark)', fontWeight: 600, lineHeight: 1.4,
                paddingLeft: '8px', borderLeft: '3px solid var(--teal-light)',
                marginBottom: '6px',
              }}>{label}</div>
            ))}
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
              style={{ marginBottom: '14px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button className="btn btn-secondary"
                onClick={() => onSearchReplace(searchWord, replaceWord, true)}
                disabled={isLoading || !searchWord.trim()}
                style={{ fontSize: '0.8rem' }}
                title={'Replace on page ' + activePage + ' only'}>
                Page {activePage}
              </button>
              <button className="btn btn-primary"
                onClick={() => onSearchReplace(searchWord, replaceWord, false)}
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
