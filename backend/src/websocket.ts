import { Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { parse as parseUrl } from 'url';
import { logger } from './config/logger';
import { verifyToken } from './middleware/auth';
import { dynamodbService } from './services/dynamodbService';
import { kubernetesService } from './services/kubernetesService';

export function setupWebSocketServer(server: HTTPServer): void {
  const wss = new WebSocketServer({ noServer: true });

  // Handle HTTP upgrade requests
  server.on('upgrade', async (request, socket, head) => {
    try {
      const { pathname, query } = parseUrl(request.url || '', true);

      // Only handle admin workspace exec requests
      const execMatch = pathname?.match(/^\/api\/admin\/workspaces\/([^/]+)\/exec$/);

      if (!execMatch) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      const workspaceId = execMatch[1];

      // Authenticate the request - check both Authorization header and query parameter
      let token: string | undefined;

      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      } else if (query.token && typeof query.token === 'string') {
        token = query.token;
      }

      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\nNo authentication token provided\r\n');
        socket.destroy();
        return;
      }

      let user;

      try {
        user = await verifyToken(token);
      } catch (error) {
        logger.error('WebSocket authentication failed:', error);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      // Check if user is admin
      if (!user.isAdmin) {
        logger.warn('Non-admin user attempted to exec into workspace:', {
          userId: user.id,
          workspaceId,
        });
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      // Validate workspace exists and get pod info
      let workspace;
      let group;
      let podName;

      try {
        workspace = await dynamodbService.getWorkspace(workspaceId);
        if (!workspace) {
          socket.write('HTTP/1.1 404 Not Found\r\n\r\nWorkspace not found\r\n');
          socket.destroy();
          return;
        }

        group = await dynamodbService.getGroup(workspace.groupId);
        if (!group) {
          socket.write('HTTP/1.1 404 Not Found\r\n\r\nGroup not found\r\n');
          socket.destroy();
          return;
        }

        // Get the pod for this workspace
        const k8sName = `workspace-${workspaceId.substring(3)}`.toLowerCase();
        const pods = await kubernetesService.listPods(group.namespace, `app=${k8sName}`);

        if (!pods || pods.length === 0) {
          socket.write('HTTP/1.1 404 Not Found\r\n\r\nNo running pod found for workspace\r\n');
          socket.destroy();
          return;
        }

        podName = pods[0].name;
      } catch (error) {
        logger.error('Error validating workspace for exec:', error);
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
        return;
      }

      // Handle the WebSocket upgrade
      wss.handleUpgrade(request, socket, head, (ws) => {
        handleExecConnection(ws, {
          user,
          workspaceId,
          workspace,
          namespace: group.namespace,
          podName,
        });
      });
    } catch (error) {
      logger.error('Error in WebSocket upgrade handler:', error);
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  });
}

interface ExecConnectionContext {
  user: {
    id: string;
    email: string;
    isAdmin: boolean;
  };
  workspaceId: string;
  workspace: any;
  namespace: string;
  podName: string;
}

async function handleExecConnection(
  ws: WebSocket,
  context: ExecConnectionContext
): Promise<void> {
  const { user, workspaceId, workspace, namespace, podName } = context;

  logger.info('Admin exec session starting:', {
    userId: user.id,
    workspaceId,
    podName,
    namespace,
  });

  const sessionStartTime = new Date();
  let execStream: any = null;

  try {
    // Create audit log for exec session start
    await dynamodbService.createAuditLog({
      userId: user.id,
      username: user.email,
      action: 'workspace_exec_start',
      resource: `workspace:${workspaceId}`,
      details: {
        podName,
        namespace,
      },
      success: true,
    });

    // Start exec session with proper TTY settings
    // Configure TTY for web terminal - use sane defaults then adjust:
    // - Start with 'sane' to get reasonable defaults
    // - opost: enable output post-processing
    // - onlcr: map NL to CRNL on output (proper line endings)
    execStream = await kubernetesService.execIntoPod(
      namespace,
      podName,
      ['/bin/bash', '-c', 'stty sane; stty icrnl ocrnl opost onlcr; export TERM=xterm-256color; exec bash -i']
    );

    // Forward data from browser to pod
    ws.on('message', (data: Buffer) => {
      // Check if it's a resize message (JSON format)
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'resize' && message.cols && message.rows) {
          // Resize the terminal using the K8s WebSocket resize method
          if (execStream && execStream.ws && typeof execStream.ws.resize === 'function') {
            logger.info('Resizing terminal:', { cols: message.cols, rows: message.rows });
            execStream.ws.resize({ height: message.rows, width: message.cols });
          }
          return;
        }
      } catch (e) {
        // Not JSON, treat as regular terminal input
      }

      // Forward regular input to pod
      if (execStream && execStream.stdin) {
        execStream.stdin.write(data);
      }
    });

    // Forward data from pod to browser
    if (execStream.stdout) {
      execStream.stdout.on('data', (data: Buffer) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });
    }

    if (execStream.stderr) {
      execStream.stderr.on('data', (data: Buffer) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });
    }

    // Handle exec stream errors
    if (execStream.on) {
      execStream.on('error', (error: Error) => {
        logger.error('Exec stream error:', {
          workspaceId,
          podName,
          error: error.message,
        });

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(`\r\nExec error: ${error.message}\r\n`);
          ws.close();
        }
      });

      execStream.on('close', (code?: number, reason?: string) => {
        logger.info('Exec stream closed:', {
          workspaceId,
          podName,
          code,
          reason,
          wsReadyState: ws.readyState,
        });
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      });
    }

    // Handle WebSocket close
    ws.on('close', async (code: number, reason: Buffer) => {
      const sessionDuration = Date.now() - sessionStartTime.getTime();

      logger.info('Admin exec session ended:', {
        userId: user.id,
        workspaceId,
        podName,
        durationMs: sessionDuration,
        closeCode: code,
        closeReason: reason.toString(),
      });

      // Close exec stream
      if (execStream && execStream.stdin) {
        execStream.stdin.end();
      }

      // Create audit log for exec session end
      await dynamodbService.createAuditLog({
        userId: user.id,
        username: user.email,
        action: 'workspace_exec_end',
        resource: `workspace:${workspaceId}`,
        details: {
          podName,
          namespace,
          durationMs: sessionDuration,
        },
        success: true,
      });
    });

    // Handle WebSocket errors
    ws.on('error', (error: Error) => {
      logger.error('WebSocket error:', {
        workspaceId,
        error: error.message,
      });
    });

    // Send initial connection message
    ws.send(`\r\nConnected to workspace: ${workspace.name}\r\n`);
    ws.send(`Pod: ${podName}\r\n`);
    ws.send(`Namespace: ${namespace}\r\n\r\n`);

  } catch (error) {
    logger.error('Error setting up exec session:', error);

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(`\r\nFailed to start exec session: ${error instanceof Error ? error.message : 'Unknown error'}\r\n`);
      ws.close();
    }

    // Create audit log for failed exec
    await dynamodbService.createAuditLog({
      userId: user.id,
      username: user.email,
      action: 'workspace_exec_failed',
      resource: `workspace:${workspaceId}`,
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
        podName,
        namespace,
      },
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
