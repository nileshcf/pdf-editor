import React from 'react';

interface AeroLogoProps {
  compact?: boolean;
}

export const AeroLogo: React.FC<AeroLogoProps> = ({ compact = false }) => (
  <div className={`aero-logo${compact ? ' compact' : ''}`} aria-label="AeroPDF">
    <span className="aero-logo-mark">
      <svg viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="miter">
        <path d="M7 4.75h10.5L22 9.25V23.25H7V4.75Z" />
        <path d="M17.5 4.75V9.25H22" />
        <path d="M10 13.25H18" />
        <path d="M10 16.75H18" />
        <path d="M10 20.25H15.75" />
        <path d="M18.5 15.5L20.75 17.75" stroke="#18A0FB" />
      </svg>
    </span>
    {!compact && <span className="aero-logo-wordmark">AeroPDF</span>}
  </div>
);
