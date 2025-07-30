/**
 * @fileoverview Tests for WebSocket server implementation
 * @lastmodified 2025-07-28T12:00:00Z
 *
 * Features: Connection handling, message routing, authentication, rate limiting
 * Test Coverage: Server lifecycle, client connections, message handling, error scenarios
 * Test Tools: Jest, ws library, mock clients, test utilities
 * Patterns: Integration tests, mock WebSocket clients, async testing, error simulation
 */

import { Server as HttpServer } from 'http';
import WebSocket from 'ws';
import { WebSocketServer } from '../../../src/websocket/server';
import { logger } from '../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock WebSocket handlers
const mockHandlers = {
  handleMessage: jest.fn(),
  handleConnection: jest.fn(),
  handleDisconnection: jest.fn(),
  handleError: jest.fn(),
};

jest.mock('../../../src/websocket/handlers', () => ({
  WebSocketHandlers: jest.fn(() => mockHandlers),
}));

// Mock authentication
const mockAuth = {
  authenticateWebSocket: jest.fn(),
  generateToken: jest.fn(),
};

jest.mock('../../../src/websocket/auth', () => ({
  WebSocketAuth: jest.fn(() => mockAuth),
}));

// Mock rate limiter
const mockRateLimit = {
  checkLimit: jest.fn(),
  increment: jest.fn(),
  reset: jest.fn(),
};

jest.mock('../../../src/websocket/rateLimit', () => ({
  WebSocketRateLimit: jest.fn(() => mockRateLimit),
}));

describe('WebSocketServer', () => {
  let httpServer: HttpServer;
  let wsServer: WebSocketServer;
  let testPort: number;

  beforeAll(() => {
    // Find an available port for testing
    testPort = 8080 + Math.floor(Math.random() * 1000);
  });

  beforeEach(() => {
    // Create HTTP server for WebSocket attachment
    httpServer = new HttpServer();

    // Reset all mocks
    jest.clearAllMocks();
    mockAuth.authenticateWebSocket.mockResolvedValue({
      user: { id: 'test-user', email: 'test@example.com' },
      isValid: true,
    });
    mockRateLimit.checkLimit.mockResolvedValue(true);
  });

  afterEach(async () => {
    if (wsServer) {
      await wsServer.stop();
    }
    if (httpServer.listening) {
      await new Promise<void>(resolve => {
        httpServer.close(() => resolve());
      });
    }
  });

  describe('Server Lifecycle', () => {
    it('should initialize WebSocket server with default options', () => {
      wsServer = new WebSocketServer(httpServer);

      expect(wsServer).toBeInstanceOf(WebSocketServer);
      expect(logger.info).toHaveBeenCalledWith(
        'WebSocketServer initialized',
        expect.objectContaining({
          port: expect.any(Number),
          path: expect.any(String),
        })
      );
    });

    it('should initialize with custom options', () => {
      const customOptions = {
        port: testPort,
        path: '/custom-ws',
        pingInterval: 60000,
        pongTimeout: 10000,
        maxConnections: 500,
      };

      wsServer = new WebSocketServer(httpServer, customOptions);

      expect(wsServer).toBeInstanceOf(WebSocketServer);
      expect(logger.info).toHaveBeenCalledWith(
        'WebSocketServer initialized',
        expect.objectContaining(customOptions)
      );
    });

    it('should start server successfully', async () => {
      wsServer = new WebSocketServer(httpServer, { port: testPort });

      await new Promise<void>(resolve => {
        httpServer.listen(testPort, () => resolve());
      });

      await wsServer.start();

      expect(logger.info).toHaveBeenCalledWith(
        'WebSocket server started',
        expect.objectContaining({
          port: testPort,
        })
      );
    });

    it('should stop server gracefully', async () => {
      wsServer = new WebSocketServer(httpServer, { port: testPort });

      await new Promise<void>(resolve => {
        httpServer.listen(testPort, () => resolve());
      });

      await wsServer.start();
      await wsServer.stop();

      expect(logger.info).toHaveBeenCalledWith('WebSocket server stopped');
    });

    it('should handle server start errors', async () => {
      wsServer = new WebSocketServer(httpServer, { port: -1 }); // Invalid port

      await expect(wsServer.start()).rejects.toThrow();
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to start WebSocket server',
        expect.objectContaining({ error: expect.any(Error) })
      );
    });
  });

  describe('Client Connections', () => {
    beforeEach(async () => {
      wsServer = new WebSocketServer(httpServer, { port: testPort });
      await new Promise<void>(resolve => {
        httpServer.listen(testPort, () => resolve());
      });
      await wsServer.start();
    });

    it('should accept valid client connections', done => {
      const client = new WebSocket(`ws://localhost:${testPort}`);

      client.on('open', () => {
        expect(mockHandlers.handleConnection).toHaveBeenCalled();
        expect(logger.info).toHaveBeenCalledWith(
          'Client connected',
          expect.objectContaining({
            clientId: expect.any(String),
          })
        );
        client.close();
        done();
      });

      client.on('error', done);
    });

    it('should reject connections when authentication fails', done => {
      mockAuth.authenticateWebSocket.mockResolvedValue({
        user: null,
        isValid: false,
        error: 'Invalid token',
      });

      const client = new WebSocket(`ws://localhost:${testPort}`);

      client.on('close', (code, reason) => {
        expect(code).toBe(1008); // Policy violation
        expect(logger.warn).toHaveBeenCalledWith(
          'Client connection rejected',
          expect.objectContaining({
            reason: 'Authentication failed',
          })
        );
        done();
      });

      client.on('open', () => {
        done(new Error('Connection should have been rejected'));
      });
    });

    it('should reject connections when rate limited', done => {
      mockRateLimit.checkLimit.mockResolvedValue(false);

      const client = new WebSocket(`ws://localhost:${testPort}`);

      client.on('close', (code, reason) => {
        expect(code).toBe(1008); // Policy violation
        expect(logger.warn).toHaveBeenCalledWith(
          'Client connection rejected',
          expect.objectContaining({
            reason: 'Rate limit exceeded',
          })
        );
        done();
      });

      client.on('open', () => {
        done(new Error('Connection should have been rejected'));
      });
    });

    it('should handle maximum connection limit', async () => {
      const maxConnections = 2;
      wsServer = new WebSocketServer(httpServer, {
        port: testPort + 1,
        maxConnections,
      });

      await new Promise<void>(resolve => {
        httpServer.listen(testPort + 1, () => resolve());
      });
      await wsServer.start();

      const clients: WebSocket[] = [];

      // Create max connections
      for (let i = 0; i < maxConnections; i++) {
        const client = new WebSocket(`ws://localhost:${testPort + 1}`);
        clients.push(client);
        await new Promise<void>(resolve => {
          client.on('open', () => resolve());
        });
      }

      // Try to create one more connection (should be rejected)
      const extraClient = new WebSocket(`ws://localhost:${testPort + 1}`);

      await new Promise<void>(resolve => {
        extraClient.on('close', code => {
          expect(code).toBe(1013); // Try again later
          resolve();
        });
      });

      // Clean up
      clients.forEach(client => client.close());
    });

    it('should handle client disconnections', done => {
      const client = new WebSocket(`ws://localhost:${testPort}`);

      client.on('open', () => {
        client.close();
      });

      // Give some time for the disconnection to be processed
      setTimeout(() => {
        expect(mockHandlers.handleDisconnection).toHaveBeenCalled();
        expect(logger.info).toHaveBeenCalledWith(
          'Client disconnected',
          expect.objectContaining({
            clientId: expect.any(String),
          })
        );
        done();
      }, 100);
    });
  });

  describe('Message Handling', () => {
    let client: WebSocket;

    beforeEach(async () => {
      wsServer = new WebSocketServer(httpServer, { port: testPort });
      await new Promise<void>(resolve => {
        httpServer.listen(testPort, () => resolve());
      });
      await wsServer.start();

      client = new WebSocket(`ws://localhost:${testPort}`);
      await new Promise<void>(resolve => {
        client.on('open', () => resolve());
      });
    });

    afterEach(() => {
      if (client.readyState === WebSocket.OPEN) {
        client.close();
      }
    });

    it('should handle valid JSON messages', done => {
      const testMessage = {
        type: 'test_message',
        data: { test: 'data' },
        requestId: 'test-request-123',
      };

      mockHandlers.handleMessage.mockResolvedValue({
        type: 'test_response',
        data: { success: true },
        requestId: 'test-request-123',
      });

      client.on('message', data => {
        const response = JSON.parse(data.toString());
        expect(response.type).toBe('test_response');
        expect(response.requestId).toBe('test-request-123');
        done();
      });

      client.send(JSON.stringify(testMessage));
    });

    it('should handle invalid JSON messages', done => {
      client.on('message', data => {
        const response = JSON.parse(data.toString());
        expect(response.type).toBe('error');
        expect(response.error).toBe('Invalid JSON format');
        done();
      });

      client.send('invalid json');
    });

    it('should handle messages without required fields', done => {
      const invalidMessage = {
        data: { test: 'data' },
        // Missing type and requestId
      };

      client.on('message', data => {
        const response = JSON.parse(data.toString());
        expect(response.type).toBe('error');
        expect(response.error).toContain('Missing required field');
        done();
      });

      client.send(JSON.stringify(invalidMessage));
    });

    it('should handle handler errors gracefully', done => {
      const testMessage = {
        type: 'error_test',
        data: {},
        requestId: 'error-test-123',
      };

      mockHandlers.handleMessage.mockRejectedValue(new Error('Handler error'));

      client.on('message', data => {
        const response = JSON.parse(data.toString());
        expect(response.type).toBe('error');
        expect(response.error).toBe('Internal server error');
        expect(response.requestId).toBe('error-test-123');
        done();
      });

      client.send(JSON.stringify(testMessage));
    });

    it('should handle binary messages', done => {
      const binaryData = Buffer.from('binary test data', 'utf-8');

      client.on('message', data => {
        const response = JSON.parse(data.toString());
        expect(response.type).toBe('error');
        expect(response.error).toBe('Binary messages not supported');
        done();
      });

      client.send(binaryData);
    });

    it('should handle large messages', done => {
      const largeMessage = {
        type: 'large_message',
        data: { payload: 'x'.repeat(10000) },
        requestId: 'large-test-123',
      };

      mockHandlers.handleMessage.mockResolvedValue({
        type: 'large_response',
        data: { received: true },
        requestId: 'large-test-123',
      });

      client.on('message', data => {
        const response = JSON.parse(data.toString());
        expect(response.type).toBe('large_response');
        expect(response.requestId).toBe('large-test-123');
        done();
      });

      client.send(JSON.stringify(largeMessage));
    });
  });

  describe('Ping/Pong Mechanism', () => {
    beforeEach(async () => {
      wsServer = new WebSocketServer(httpServer, {
        port: testPort,
        pingInterval: 1000, // 1 second for testing
        pongTimeout: 500, // 0.5 seconds for testing
      });
      await new Promise<void>(resolve => {
        httpServer.listen(testPort, () => resolve());
      });
      await wsServer.start();
    });

    it('should send ping messages at configured intervals', done => {
      const client = new WebSocket(`ws://localhost:${testPort}`);

      client.on('ping', data => {
        expect(data).toBeDefined();
        client.pong(data); // Respond to ping
        done();
      });

      client.on('open', () => {
        // Ping should be sent within the interval
      });
    });

    it('should close connection if pong timeout exceeded', done => {
      const client = new WebSocket(`ws://localhost:${testPort}`);

      client.on('ping', data => {
        // Don't respond to ping to trigger timeout
        logger.debug('Received ping, not responding to test timeout');
      });

      client.on('close', (code, reason) => {
        expect(code).toBe(1000); // Normal closure
        expect(logger.warn).toHaveBeenCalledWith(
          'Client connection closed due to ping timeout',
          expect.objectContaining({
            clientId: expect.any(String),
          })
        );
        done();
      });

      client.on('open', () => {
        // Wait for ping timeout
      });
    }, 10000);
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      wsServer = new WebSocketServer(httpServer, { port: testPort });
      await new Promise<void>(resolve => {
        httpServer.listen(testPort, () => resolve());
      });
      await wsServer.start();
    });

    it('should handle WebSocket errors', done => {
      const client = new WebSocket(`ws://localhost:${testPort}`);

      client.on('open', () => {
        // Simulate an error by sending to closed socket
        client.close();
        setTimeout(() => {
          try {
            client.send('test after close');
          } catch (error) {
            // Expected error
          }

          setTimeout(() => {
            expect(logger.error).toHaveBeenCalledWith(
              'WebSocket error',
              expect.objectContaining({
                error: expect.any(Error),
              })
            );
            done();
          }, 100);
        }, 100);
      });
    });

    it('should handle server errors gracefully', async () => {
      // Simulate server error by trying to start on occupied port
      const conflictingServer = new WebSocketServer(httpServer, { port: testPort });

      await expect(conflictingServer.start()).rejects.toThrow();
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to start WebSocket server',
        expect.objectContaining({ error: expect.any(Error) })
      );
    });

    it('should handle authentication service errors', done => {
      mockAuth.authenticateWebSocket.mockRejectedValue(new Error('Auth service down'));

      const client = new WebSocket(`ws://localhost:${testPort}`);

      client.on('close', code => {
        expect(code).toBe(1011); // Internal error
        expect(logger.error).toHaveBeenCalledWith(
          'Authentication error during connection',
          expect.objectContaining({
            error: expect.any(Error),
          })
        );
        done();
      });
    });

    it('should handle rate limiter service errors', done => {
      mockRateLimit.checkLimit.mockRejectedValue(new Error('Rate limiter service down'));

      const client = new WebSocket(`ws://localhost:${testPort}`);

      client.on('close', code => {
        expect(code).toBe(1011); // Internal error
        expect(logger.error).toHaveBeenCalledWith(
          'Rate limiting error during connection',
          expect.objectContaining({
            error: expect.any(Error),
          })
        );
        done();
      });
    });
  });

  describe('Statistics and Monitoring', () => {
    beforeEach(async () => {
      wsServer = new WebSocketServer(httpServer, { port: testPort });
      await new Promise<void>(resolve => {
        httpServer.listen(testPort, () => resolve());
      });
      await wsServer.start();
    });

    it('should track connection statistics', async () => {
      const client1 = new WebSocket(`ws://localhost:${testPort}`);
      const client2 = new WebSocket(`ws://localhost:${testPort}`);

      await Promise.all([
        new Promise<void>(resolve => client1.on('open', () => resolve())),
        new Promise<void>(resolve => client2.on('open', () => resolve())),
      ]);

      const stats = wsServer.getStats();
      expect(stats.totalConnections).toBe(2);
      expect(stats.activeConnections).toBe(2);

      client1.close();
      await new Promise<void>(resolve => setTimeout(resolve, 100));

      const updatedStats = wsServer.getStats();
      expect(updatedStats.activeConnections).toBe(1);
      expect(updatedStats.totalConnections).toBe(2); // Still tracked

      client2.close();
    });

    it('should track message statistics', async () => {
      const client = new WebSocket(`ws://localhost:${testPort}`);
      await new Promise<void>(resolve => client.on('open', () => resolve()));

      const message = {
        type: 'test_stats',
        data: {},
        requestId: 'stats-test-123',
      };

      client.send(JSON.stringify(message));
      await new Promise<void>(resolve => setTimeout(resolve, 100));

      const stats = wsServer.getStats();
      expect(stats.totalMessages).toBeGreaterThan(0);

      client.close();
    });

    it('should provide detailed connection information', async () => {
      const client = new WebSocket(`ws://localhost:${testPort}`);
      await new Promise<void>(resolve => client.on('open', () => resolve()));

      const connections = wsServer.getConnections();
      expect(connections).toHaveLength(1);
      expect(connections[0]).toHaveProperty('id');
      expect(connections[0]).toHaveProperty('connectedAt');
      expect(connections[0]).toHaveProperty('messageCount');

      client.close();
    });
  });

  describe('Integration Tests', () => {
    beforeEach(async () => {
      wsServer = new WebSocketServer(httpServer, { port: testPort });
      await new Promise<void>(resolve => {
        httpServer.listen(testPort, () => resolve());
      });
      await wsServer.start();
    });

    it('should handle realistic WebSocket workflow', async () => {
      const client = new WebSocket(`ws://localhost:${testPort}`);
      await new Promise<void>(resolve => client.on('open', () => resolve()));

      // Send authentication message
      const authMessage = {
        type: 'authenticate',
        data: { token: 'test-token' },
        requestId: 'auth-123',
      };

      mockHandlers.handleMessage.mockResolvedValue({
        type: 'authenticated',
        data: { user: { id: 'test-user' } },
        requestId: 'auth-123',
      });

      client.send(JSON.stringify(authMessage));

      // Wait for response
      const authResponse = await new Promise<any>(resolve => {
        client.on('message', data => {
          resolve(JSON.parse(data.toString()));
        });
      });

      expect(authResponse.type).toBe('authenticated');
      expect(authResponse.requestId).toBe('auth-123');

      // Send data message
      const dataMessage = {
        type: 'get_boards',
        data: {},
        requestId: 'boards-123',
      };

      mockHandlers.handleMessage.mockResolvedValue({
        type: 'boards_response',
        data: { boards: [] },
        requestId: 'boards-123',
      });

      client.send(JSON.stringify(dataMessage));

      // Wait for response
      const dataResponse = await new Promise<any>(resolve => {
        client.on('message', data => {
          resolve(JSON.parse(data.toString()));
        });
      });

      expect(dataResponse.type).toBe('boards_response');
      expect(dataResponse.requestId).toBe('boards-123');

      client.close();
    });

    it('should handle multiple concurrent clients', async () => {
      const clientCount = 5;
      const clients: WebSocket[] = [];

      // Connect multiple clients
      for (let i = 0; i < clientCount; i++) {
        const client = new WebSocket(`ws://localhost:${testPort}`);
        clients.push(client);
        await new Promise<void>(resolve => client.on('open', () => resolve()));
      }

      // Send messages from all clients
      const promises = clients.map(async (client, index) => {
        const message = {
          type: 'concurrent_test',
          data: { clientIndex: index },
          requestId: `concurrent-${index}`,
        };

        mockHandlers.handleMessage.mockResolvedValue({
          type: 'concurrent_response',
          data: { processed: true, clientIndex: index },
          requestId: `concurrent-${index}`,
        });

        client.send(JSON.stringify(message));

        return new Promise<any>(resolve => {
          client.on('message', data => {
            resolve(JSON.parse(data.toString()));
          });
        });
      });

      const responses = await Promise.all(promises);

      // Verify all responses
      responses.forEach((response, index) => {
        expect(response.type).toBe('concurrent_response');
        expect(response.data.clientIndex).toBe(index);
      });

      // Clean up clients
      clients.forEach(client => client.close());
    });
  });
});
