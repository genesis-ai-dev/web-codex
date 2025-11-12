import React from 'react';
import { Terminal } from './Terminal';

interface TerminalModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  workspaceName: string;
}

export const TerminalModal: React.FC<TerminalModalProps> = ({
  isOpen,
  onClose,
  workspaceId,
  workspaceName,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={(e) => {
        // Close modal if clicking on backdrop
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        style={{
          backgroundColor: '#1e1e1e',
          borderRadius: '8px',
          width: '90vw',
          height: '80vh',
          maxWidth: '1400px',
          maxHeight: '900px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            backgroundColor: '#2d2d30',
            borderBottom: '1px solid #3e3e42',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#cccccc' }}>
              Terminal - {workspaceName}
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#888888' }}>
              Workspace ID: {workspaceId}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#cccccc',
              cursor: 'pointer',
              fontSize: '24px',
              padding: '4px 12px',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#cccccc')}
          >
            ×
          </button>
        </div>

        {/* Terminal */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <Terminal workspaceId={workspaceId} />
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 24px',
            backgroundColor: '#2d2d30',
            borderTop: '1px solid #3e3e42',
            fontSize: '12px',
            color: '#888888',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>Use Ctrl+C, Ctrl+D, or type 'exit' to end session</span>
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px',
              backgroundColor: '#3e3e42',
              color: '#cccccc',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#4e4e52')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#3e3e42')}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
