import React, { useState } from 'react';
import { Terminal, ArrowRight } from 'lucide-react';

interface CommandConsoleProps {
  onExecuteCommand: (commandStr: string) => void;
  isLoading: boolean;
}

export const CommandConsole: React.FC<CommandConsoleProps> = ({ onExecuteCommand, isLoading }) => {
  const [commandInput, setCommandInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim() || isLoading) return;
    onExecuteCommand(commandInput.trim());
    setCommandInput('');
  };

  const hasInput = commandInput.trim().length > 0;

  return (
    <form onSubmit={handleSubmit} className="command-console">
      <Terminal size={15} style={{ color: 'rgba(255,255,255,0.7)', flexShrink: 0 }} />
      <input
        type="text"
        placeholder='replace "Draft" with "Final" on page 1'
        value={commandInput}
        onChange={(e) => setCommandInput(e.target.value)}
        disabled={isLoading}
        aria-label="Command input"
      />
      <button
        type="submit"
        disabled={isLoading || !hasInput}
        style={{
          background: hasInput ? 'rgba(255,255,255,0.22)' : 'transparent',
          border: 'none',
          borderRadius: 'var(--r-pill)',
          color: hasInput ? 'white' : 'rgba(255,255,255,0.35)',
          cursor: hasInput ? 'pointer' : 'default',
          display: 'flex',
          alignItems: 'center',
          padding: '5px 9px',
          transition: 'background 0.15s, color 0.15s',
          flexShrink: 0,
        }}
        title="Run command (Enter)"
      >
        <ArrowRight size={15} />
      </button>
    </form>
  );
};
