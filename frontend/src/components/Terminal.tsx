import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useAuth } from '../contexts/AuthContext';

interface TerminalProps {
  workspaceId: string;
  onClose?: () => void;
}

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001/api';

export const Terminal: React.FC<TerminalProps> = ({ workspaceId, onClose }) => {
  const { getAccessToken } = useAuth();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm.js terminal
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#ffffff',
      },
      scrollback: 1000,
      convertEol: true,
    });

    // Add addons
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    // Open terminal in the DOM
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Connect to WebSocket - get token from AuthContext
    const token = getAccessToken();
    if (!token) {
      setConnectionStatus('error');
      setError('No authentication token found');
      term.writeln('\r\n\x1b[1;31mError: Not authenticated\x1b[0m\r\n');
      return;
    }

    // Create WebSocket URL (convert http to ws)
    const wsProtocol = API_BASE_URL.startsWith('https') ? 'wss' : 'ws';
    const wsBaseUrl = API_BASE_URL.replace(/^https?/, wsProtocol);
    // Pass token as query parameter since WebSocket doesn't support Authorization header
    const wsUrl = `${wsBaseUrl}/admin/workspaces/${workspaceId}/exec?token=${encodeURIComponent(token)}`;

    term.writeln('\r\nConnecting to workspace...\r\n');

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      term.writeln('\r\n\x1b[1;32mConnected!\x1b[0m\r\n');
    };

    ws.onmessage = async (event) => {
      let data: string;

      if (typeof event.data === 'string') {
        data = event.data;
      } else if (event.data instanceof Blob) {
        // Convert Blob to text
        data = await event.data.text();
      } else if (event.data instanceof ArrayBuffer) {
        // Convert ArrayBuffer to text
        const decoder = new TextDecoder('utf-8');
        data = decoder.decode(event.data);
      } else {
        console.warn('Unknown WebSocket data type:', typeof event.data);
        return;
      }

      term.write(data);
    };

    ws.onerror = (event) => {
      setConnectionStatus('error');
      setError('WebSocket connection error');
      term.writeln('\r\n\x1b[1;31mConnection error\x1b[0m\r\n');
    };

    ws.onclose = () => {
      if (connectionStatus !== 'error') {
        setConnectionStatus('disconnected');
        term.writeln('\r\n\x1b[1;33mConnection closed\x1b[0m\r\n');
      }
    };

    // Send terminal input to WebSocket
    const disposable = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        // The terminal already handles Enter key properly by sending \r
        ws.send(data);
      }
    });

    // Handle window resize
    const handleResize = () => {
      fitAddon.fit();
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      disposable.dispose();
      window.removeEventListener('resize', handleResize);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, getAccessToken]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: '8px 16px',
        backgroundColor: '#2d2d30',
        color: '#cccccc',
        borderBottom: '1px solid #3e3e42',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: connectionStatus === 'connected' ? '#0dbc79' :
              connectionStatus === 'connecting' ? '#e5e510' :
              connectionStatus === 'error' ? '#cd3131' : '#666666',
          }} />
          <span style={{ fontSize: '14px' }}>
            {connectionStatus === 'connected' && 'Connected'}
            {connectionStatus === 'connecting' && 'Connecting...'}
            {connectionStatus === 'disconnected' && 'Disconnected'}
            {connectionStatus === 'error' && `Error: ${error}`}
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#cccccc',
              cursor: 'pointer',
              fontSize: '18px',
              padding: '4px 8px',
            }}
          >
            ×
          </button>
        )}
      </div>
      <div
        ref={terminalRef}
        style={{
          flex: 1,
          overflow: 'hidden',
          padding: '8px',
        }}
      />
    </div>
  );
};
