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
    onExecuteCommand(commandInput);
    setCommandInput(''); // Clear input
  };

  return (
    <form onSubmit={handleSubmit} className="command-console">
      <Terminal size={16} style={{ color: 'var(--accent-light)', flexShrink: 0 }} />
      <input
        type="text"
        placeholder='Try: replace "Draft" with "Final" on page 1'
        value={commandInput}
        onChange={(e) => setCommandInput(e.target.value)}
        disabled={isLoading}
      />
      <button
        type="submit"
        disabled={isLoading || !commandInput.trim()}
        style={{
          background: 'transparent',
          border: 'none',
          color: commandInput.trim() ? 'var(--accent-light)' : 'var(--text-muted)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          padding: '4px',
          transition: 'color 0.2s'
        }}
      >
        <ArrowRight size={16} />
      </button>
    </form>
  );
};
