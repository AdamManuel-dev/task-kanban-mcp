import { createServer } from 'http';
import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type { Task, TaskDependency } from '@/types';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { WebSocketMessage, WebSocketClient } from './types';
import type { RequestInfo, AuthMessage } from './messageTypes';
import { WebSocketAuth } from './auth';
import { MessageHandler } from './handlers';
import { SubscriptionManager } from './subscriptions';
import { RateLimiter } from './rateLimit';

export class WebSocketManager {
  sendSuccess(_clientId: string, _dependency: TaskDependency, _id: string): void {
    throw new Error('Method not implemented.');
  }

  static broadcastToChannel(
    _channel: string,
    _message: { type: string; payload: { task: Task } }
  ): void {
    throw new Error('Method not implemented.');
  }

  private wss: WebSocketServer | null = null;

  private httpServer: ReturnType<typeof createServer> | null = null;

  private readonly clients = new Map<string, WebSocketClient>();

  private readonly auth: WebSocketAuth;

  private readonly messageHandler: MessageHandler;

  private readonly subscriptionManager: SubscriptionManager;

  private readonly rateLimiter: RateLimiter;

  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.auth = new WebSocketAuth();
    this.messageHandler = new MessageHandler(this);
    this.subscriptionManager = new SubscriptionManager(this);
    this.rateLimiter = new RateLimiter();
  }

  getAuth(): WebSocketAuth {
    return this.auth;
  }

  async start(port?: number): Promise<void> {
    try {
      const wsPort = port ?? config.websocket.port;
      logger.info('Starting WebSocket server...', { port: wsPort });

      // Create HTTP server for WebSocket upgrade
      this.httpServer = createServer();

      // Create WebSocket server
      this.wss = new WebSocketServer({
        server: this.httpServer,
        path: config.websocket.path,
        perMessageDeflate: config.websocket.compression,
        maxPayload: config.websocket.maxPayload,
        clientTracking: true,
      });

      // Set up WebSocket event handlers
      this.wss.on('connection', (ws: WebSocket, request: RequestInfo) => {
        this.handleConnection(ws, request);
      });
      this.wss.on('error', WebSocketManager.handleServerError.bind(this));

      // Start HTTP server
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.listen(wsPort, config.websocket.host, () => {
          logger.info('WebSocket server started', {
            host: config.websocket.host,
            port: wsPort,
            path: config.websocket.path,
          });
          resolve();
        });

        this.httpServer!.on('error', error => {
          logger.error('WebSocket server error', { error });
          reject(error);
        });
      });

      // Start heartbeat
      this.startHeartbeat();

      logger.info('WebSocket server initialized successfully');
    } catch (error) {
      logger.error('Failed to start WebSocket server', { error });
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      logger.info('Stopping WebSocket server...');

      // Stop heartbeat
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }

      // Close all client connections
      this.clients.forEach(client => {
        this.closeConnection(client.id, 'SERVER_SHUTDOWN', 'Server is shutting down');
      });

      // Close WebSocket server
      if (this.wss) {
        this.wss.close();
        this.wss = null;
      }

      // Close HTTP server
      if (this.httpServer) {
        await new Promise<void>(resolve => {
          this.httpServer!.close(() => {
            this.httpServer = null;
            resolve();
          });
        });
      }

      logger.info('WebSocket server stopped');
    } catch (error) {
      logger.error('Error stopping WebSocket server', { error });
      throw error;
    }
  }

  private handleConnection(ws: WebSocket, request: RequestInfo): void {
    const clientId = uuidv4();
    const clientIP = request.socket.remoteAddress ?? 'unknown';

    logger.info('New WebSocket connection', { clientId, clientIP });

    try {
      // Check rate limiting
      if (!this.rateLimiter.checkLimit(clientIP)) {
        ws.close(1008, 'Rate limit exceeded');
        return;
      }

      // Create client object
      const client: WebSocketClient = {
        id: clientId,
        ws,
        ip: clientIP,
        userAgent: request.headers['user-agent'] ?? undefined,
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
        authenticated: false,
        subscriptions: new Set(),
        user: null,
        permissions: new Set(),
      };

      // Add client to map
      this.clients.set(clientId, client);

      // Set up message handler
      ws.on('message', (data: Buffer | string) => {
        this.handleMessage(clientId, data).catch((err: Error) => {
          logger.error('WebSocket message handling failed:', err);
        });
      });

      // Set up close handler
      ws.on('close', (code: number, reason: Buffer) => {
        this.handleDisconnection(clientId, code, reason);
      });

      // Set up error handler
      ws.on('error', (error: Error) => {
        this.handleClientError(clientId, error);
      });

      // Set up pong handler
      ws.on('pong', () => {
        this.handlePong(clientId);
      });

      // Send welcome message
      this.sendToClient(clientId, {
        type: 'welcome',
        id: uuidv4(),
        payload: {
          clientId,
          serverVersion: '1.0.0',
          protocolVersion: '1.0',
          timestamp: new Date().toISOString(),
          authRequired: true,
        },
      });

      logger.info('WebSocket client connected', { clientId, clientIP });
    } catch (error) {
      logger.error('Error handling WebSocket connection', { clientId, error });
      ws.close(1011, 'Internal server error');
    }
  }

  private async handleMessage(clientId: string, data: Buffer | string): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) {
      logger.warn('Message from unknown client', { clientId });
      return;
    }

    try {
      // Parse message
      const messageText = data.toString();
      const message = JSON.parse(messageText) as WebSocketMessage;

      // Validate message structure
      if (!message.type || !message.id) {
        this.sendError(clientId, 'INVALID_MESSAGE', 'Invalid message format');
        return;
      }

      // Handle authentication
      if (message.type === 'auth') {
        await this.handleAuthMessage(clientId, message);
        return;
      }

      // Check authentication for other messages
      if (!client.authenticated) {
        this.sendError(clientId, 'UNAUTHENTICATED', 'Authentication required');
        return;
      }

      // Handle other message types
      await this.messageHandler.handleMessage(clientId, message);
    } catch (error) {
      logger.error('Error handling WebSocket message', { clientId, error });
      this.sendError(clientId, 'MESSAGE_ERROR', 'Failed to process message');
    }
  }

  private handleDisconnection(clientId: string, code: number, reason: Buffer): void {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    logger.info('WebSocket client disconnected', {
      clientId,
      code,
      reason: reason.toString(),
    });

    // Remove from subscriptions
    this.subscriptionManager.unsubscribeAll(clientId);

    // Remove from clients map
    this.clients.delete(clientId);
  }

  private handleClientError(clientId: string, error: Error): void {
    logger.error('WebSocket client error', { clientId, error });
    this.closeConnection(clientId, 'CLIENT_ERROR', 'Client error occurred');
  }

  private static handleServerError(error: Error): void {
    logger.error('WebSocket server error', { error });
  }

  private handlePong(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastHeartbeat = new Date();
    }
  }

  private async handleAuthMessage(clientId: string, message: WebSocketMessage): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    try {
      const authPayload = message.payload as AuthMessage['payload'];
      const result = await this.auth.authenticate(authPayload as { token: string });

      if (result.success && result.user && result.permissions) {
        client.authenticated = true;
        client.user = result.user;
        client.permissions = new Set(result.permissions);

        this.sendToClient(clientId, {
          type: 'auth_success',
          id: message.id,
          payload: {
            user: result.user,
            permissions: Array.from(result.permissions),
          },
        });

        logger.info('WebSocket client authenticated', {
          clientId,
          userId: result.user.id,
          role: result.user.role,
        });
      } else {
        this.sendError(
          clientId,
          'AUTH_FAILED',
          result.error ?? 'Authentication failed',
          message.id
        );
      }
    } catch (error) {
      logger.error('Error during WebSocket authentication', { clientId, error });
      this.sendError(clientId, 'AUTH_ERROR', 'Authentication error', message.id);
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      const timeoutMs = 30000; // 30 seconds

      this.clients.forEach(client => {
        const timeSinceLastHeartbeat = now.getTime() - client.lastHeartbeat.getTime();
        if (timeSinceLastHeartbeat > timeoutMs) {
          logger.warn('Client heartbeat timeout', { clientId: client.id, timeSinceLastHeartbeat });
          this.closeConnection(client.id, 'HEARTBEAT_TIMEOUT', 'Heartbeat timeout');
        } else {
          client.ws.ping();
        }
      });
    }, 15000); // Send ping every 15 seconds
  }

  sendToClient(clientId: string, message: Omit<WebSocketMessage, 'timestamp'>): boolean {
    const client = this.clients.get(clientId);
    if (!client) {
      return false;
    }

    try {
      const fullMessage: WebSocketMessage = {
        ...message,
        timestamp: new Date().toISOString(),
      };

      client.ws.send(JSON.stringify(fullMessage));
      return true;
    } catch (error) {
      logger.error('Error sending message to client', { clientId, error });
      return false;
    }
  }

  sendError(clientId: string, code: string, message: string, requestId?: string): boolean {
    return this.sendToClient(clientId, {
      type: 'error',
      id: requestId ?? uuidv4(),
      payload: { code, message },
    });
  }

  broadcast(
    message: Omit<WebSocketMessage, 'timestamp'>,
    filter?: (client: WebSocketClient) => boolean
  ): number {
    let sentCount = 0;

    this.clients.forEach(client => {
      if (!filter || filter(client)) {
        if (this.sendToClient(client.id, message)) {
          sentCount += 1;
        }
      }
    });

    return sentCount;
  }

  closeConnection(clientId: string, _code: string, reason: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      try {
        client.ws.close(1000, reason);
      } catch (error) {
        logger.error('Error closing WebSocket connection', { clientId, error });
      }
    }
  }

  getClient(clientId: string): WebSocketClient | undefined {
    return this.clients.get(clientId);
  }

  getConnectedClients(): WebSocketClient[] {
    return Array.from(this.clients.values());
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getSubscriptionManager(): SubscriptionManager {
    return this.subscriptionManager;
  }
}

// Singleton instance
export const webSocketManager = new WebSocketManager();
