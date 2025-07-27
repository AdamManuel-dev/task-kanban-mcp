import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import type { WebSocketMessage, WebSocketClient, WebSocketError } from './types';
import { WebSocketAuth } from './auth';
import { MessageHandler } from './handlers';
import { SubscriptionManager } from './subscriptions';
import { RateLimiter } from './rateLimit';

export class WebSocketManager {
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

  async start(): Promise<void> {
    try {
      logger.info('Starting WebSocket server...');

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
      this.wss.on('connection', this.handleConnection.bind(this));
      this.wss.on('error', this.handleServerError.bind(this));

      // Start HTTP server
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.listen(config.websocket.port, config.websocket.host, () => {
          logger.info('WebSocket server started', {
            host: config.websocket.host,
            port: config.websocket.port,
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

  private async handleConnection(ws: WebSocket, request: any): Promise<void> {
    const clientId = uuidv4();
    const clientIP = request.socket.remoteAddress;

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
        userAgent: request.headers['user-agent'],
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
        authenticated: false,
        subscriptions: new Set(),
        user: null,
        permissions: new Set(),
      };

      // Store client
      this.clients.set(clientId, client);

      // Set up WebSocket event handlers
      ws.on('message', data => this.handleMessage(clientId, data.toString()));
      ws.on('close', (code, reason) => this.handleDisconnection(clientId, code, reason));
      ws.on('error', error => this.handleClientError(clientId, error));
      ws.on('pong', () => this.handlePong(clientId));

      // Send welcome message
      this.sendToClient(clientId, {
        type: 'welcome',
        id: `welcome-${clientId}`,
        payload: {
          clientId,
          serverVersion: config.mcp.serverVersion,
          protocolVersion: '1.0',
          timestamp: new Date().toISOString(),
          authRequired: config.websocket.authRequired,
        },
      });

      // Request authentication if required
      if (config.websocket.authRequired) {
        setTimeout(() => {
          const client = this.clients.get(clientId);
          if (client && !client.authenticated) {
            this.closeConnection(clientId, 'AUTH_TIMEOUT', 'Authentication timeout');
          }
        }, config.websocket.authTimeout);
      }
    } catch (error) {
      logger.error('Error handling WebSocket connection', { clientId, error });
      ws.close(1011, 'Internal server error');
    }
  }

  private async handleMessage(clientId: string, data: Buffer | string): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      // Parse message
      const rawMessage = data.toString();
      let message: WebSocketMessage;

      try {
        message = JSON.parse(rawMessage);
      } catch (parseError) {
        this.sendError(clientId, 'INVALID_MESSAGE', 'Invalid JSON format');
        return;
      }

      // Validate message structure
      if (!message.type || !message.id) {
        this.sendError(clientId, 'INVALID_MESSAGE', 'Missing required fields: type, id');
        return;
      }

      // Check rate limiting
      if (!this.rateLimiter.checkMessageLimit(clientId)) {
        this.sendError(clientId, 'RATE_LIMIT', 'Message rate limit exceeded');
        return;
      }

      // Update last activity
      client.lastHeartbeat = new Date();

      // Handle authentication messages
      if (message.type === 'auth') {
        await this.handleAuthMessage(clientId, message);
        return;
      }

      // Check authentication for other messages
      if (config.websocket.authRequired && !client.authenticated) {
        this.sendError(clientId, 'AUTHENTICATION_REQUIRED', 'Authentication required');
        return;
      }

      // Handle message
      await this.messageHandler.handleMessage(clientId, message);
    } catch (error) {
      logger.error('Error handling WebSocket message', { clientId, error });
      this.sendError(clientId, 'INTERNAL_ERROR', 'Internal server error');
    }
  }

  private handleDisconnection(clientId: string, code: number, reason: Buffer): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    logger.info('WebSocket client disconnected', {
      clientId,
      code,
      reason: reason.toString(),
      connectedDuration: Date.now() - client.connectedAt.getTime(),
    });

    // Clean up subscriptions
    this.subscriptionManager.unsubscribeAll(clientId);

    // Remove client
    this.clients.delete(clientId);
  }

  private handleClientError(clientId: string, error: Error): void {
    logger.error('WebSocket client error', { clientId, error });

    const client = this.clients.get(clientId);
    if (client) {
      this.closeConnection(clientId, 'CLIENT_ERROR', 'Client error occurred');
    }
  }

  private handleServerError(error: Error): void {
    logger.error('WebSocket server error', { error });
  }

  private handlePong(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastHeartbeat = new Date();
    }
  }

  private async handleAuthMessage(clientId: string, message: WebSocketMessage): Promise<void> {
    try {
      const authResult = await this.auth.authenticate(message.payload);
      const client = this.clients.get(clientId);

      if (!client) return;

      if (authResult.success) {
        client.authenticated = true;
        client.user = authResult.user || null;
        client.permissions = new Set(authResult.permissions);

        this.sendToClient(clientId, {
          type: 'auth_success',
          id: message.id,
          payload: {
            user: authResult.user,
            permissions: Array.from(client.permissions),
          },
        });

        logger.info('WebSocket client authenticated', {
          clientId,
          userId: authResult.user?.id,
          permissions: Array.from(client.permissions),
        });
      } else {
        this.sendError(
          clientId,
          'AUTH_FAILED',
          authResult.error || 'Authentication failed',
          message.id
        );

        // Close connection after failed auth
        setTimeout(() => {
          this.closeConnection(clientId, 'AUTH_FAILED', 'Authentication failed');
        }, 1000);
      }
    } catch (error) {
      logger.error('Authentication error', { clientId, error });
      this.sendError(clientId, 'AUTH_ERROR', 'Authentication error occurred', message.id);
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      const timeout = config.websocket.heartbeatInterval * 2;

      this.clients.forEach((client, clientId) => {
        const timeSinceLastHeartbeat = now.getTime() - client.lastHeartbeat.getTime();

        if (timeSinceLastHeartbeat > timeout) {
          logger.warn('Client heartbeat timeout', { clientId, timeSinceLastHeartbeat });
          this.closeConnection(clientId, 'HEARTBEAT_TIMEOUT', 'Heartbeat timeout');
        } else {
          // Send ping
          if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.ping();
          }
        }
      });
    }, config.websocket.heartbeatInterval);
  }

  // Public methods for sending messages
  sendToClient(clientId: string, message: Omit<WebSocketMessage, 'timestamp'>): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
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
      id: requestId || uuidv4(),
      payload: {
        code,
        message,
      } as WebSocketError,
    });
  }

  broadcast(
    message: Omit<WebSocketMessage, 'timestamp'>,
    filter?: (client: WebSocketClient) => boolean
  ): number {
    let sentCount = 0;

    this.clients.forEach((client, clientId) => {
      if (filter && !filter(client)) return;
      if (client.ws.readyState !== WebSocket.OPEN) return;

      if (this.sendToClient(clientId, message)) {
        sentCount++;
      }
    });

    return sentCount;
  }

  closeConnection(clientId: string, _code: string, reason: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.close(1000, reason);
      }
    } catch (error) {
      logger.error('Error closing WebSocket connection', { clientId, error });
    }

    this.handleDisconnection(clientId, 1000, Buffer.from(reason));
  }

  // Getters
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
