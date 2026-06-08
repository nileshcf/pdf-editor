import React from 'react';
import { Square, Circle, Minus, MoveUpRight, X } from 'lucide-react';

export type ShapeType = 'rect' | 'circle' | 'line' | 'arrow';

interface ShapeToolbarProps {
  activeShape: ShapeType | null;
  onSelectShape: (shape: ShapeType | null) => void;
  strokeColor: string;
  onChangeStrokeColor: (color: string) => void;
  fillColor: string;
  onChangeFillColor: (color: string) => void;
  lineWidth: number;
  onChangeLineWidth: (width: number) => void;
}

export const ShapeToolbar: React.FC<ShapeToolbarProps> = ({
  activeShape, onSelectShape, strokeColor, onChangeStrokeColor,
  fillColor, onChangeFillColor, lineWidth, onChangeLineWidth
}) => {
  const shapeBtn = (type: ShapeType, icon: React.ReactNode, title: string) => (
    <button 
      title={title}
      onClick={() => onSelectShape(activeShape === type ? null : type)}
      style={{
        background: activeShape === type ? 'var(--teal)' : 'var(--white)',
        color: activeShape === type ? 'white' : 'var(--dark)',
        border: '2.5px solid var(--border)',
        borderRadius: 'var(--r-sm)',
        padding: '6px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer'
      }}
    >
      {icon}
    </button>
  );

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px', 
      background: 'var(--white)', border: '2.5px solid var(--border)',
      borderRadius: 'var(--r-pill)', padding: '6px 14px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
      zIndex: 40
    }}>
      <span style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--medium)', marginRight: '4px' }}>
        DRAW
      </span>
      {shapeBtn('rect', <Square size={16} />, 'Rectangle')}
      {shapeBtn('circle', <Circle size={16} />, 'Circle / Ellipse')}
      {shapeBtn('line', <Minus size={16} />, 'Line')}
      {shapeBtn('arrow', <MoveUpRight size={16} />, 'Arrow')}
      
      <div style={{ width: '2px', height: '24px', background: 'var(--border)', margin: '0 4px' }} />
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <input type="color" value={strokeColor} onChange={(e) => onChangeStrokeColor(e.target.value)}
          title="Stroke Color"
          style={{ width: '26px', height: '26px', border: '2px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', padding: 0 }} />
        <input type="color" value={fillColor || '#ffffff'} onChange={(e) => onChangeFillColor(e.target.value)}
          title="Fill Color"
          style={{ width: '26px', height: '26px', border: '2px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', padding: 0 }} />
        
        <input type="number" value={lineWidth} onChange={(e) => onChangeLineWidth(Math.max(1, Number(e.target.value)))}
          title="Line Width" min={1} max={20}
          style={{ width: '48px', padding: '4px 6px', border: '2px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: '0.8rem', fontWeight: 800 }} />
      </div>

      {activeShape && (
        <>
          <div style={{ width: '2px', height: '24px', background: 'var(--border)', margin: '0 4px' }} />
          <button onClick={() => onSelectShape(null)} 
            style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', display: 'flex' }}
            title="Cancel drawing">
            <X size={18} />
          </button>
        </>
      )}
    </div>
  );
};
