/**
 * WebSocket Connection Integration Tests
 */

import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { webSocketManager } from '@/websocket/server';
import { dbConnection } from '@/database/connection';
import { config } from '@/config';
import type { WebSocketMessage } from '@/websocket/types';

describe('WebSocket Connection Integration Tests', () => {
  const wsUrl = `ws://${config.websocket.host}:${config.websocket.port}${config.websocket.path}`;
  let apiKey: string;

  beforeAll(async () => {
    // Initialize database
    await dbConnection.initialize({
      path: ':memory:',
      skipSchema: false,
    });

    // Create test API key
    apiKey = `test-api-key-${uuidv4()}`;
    await dbConnection.execute(
      'INSERT INTO api_keys (id, key_hash, name, permissions, created_at) VALUES (?, ?, ?, ?, ?)',
      [uuidv4(), apiKey, 'Test API Key', 'read,write', new Date().toISOString()]
    );

    // Start WebSocket server
    await webSocketManager.start();
  });

  afterAll(async () => {
    await webSocketManager.stop();
    await dbConnection.close();
  });

  describe('Connection Lifecycle', () => {
    it('should establish connection and receive welcome message', async () => {
      const ws = new WebSocket(wsUrl);
      const messages: WebSocketMessage[] = [];

      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          ws.on('message', data => {
            const message = JSON.parse(data.toString()) as WebSocketMessage;
            messages.push(message);

            if (message.type === 'welcome') {
              ws.close();
              resolve();
            }
          });
        });

        ws.on('error', reject);
      });

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('welcome');
      expect(messages[0].payload).toMatchObject({
        serverVersion: config.mcp.serverVersion,
        protocolVersion: '1.0',
        authRequired: config.websocket.authRequired,
      });
    });

    it('should handle multiple simultaneous connections', async () => {
      const connectionCount = 5;
      const connections: WebSocket[] = [];
      const welcomeMessages: WebSocketMessage[] = [];

      // Create multiple connections
      const promises = Array.from(
        { length: connectionCount },
        () =>
          new Promise<void>((resolve, reject) => {
            const ws = new WebSocket(wsUrl);
            connections.push(ws);

            ws.on('open', () => {
              ws.on('message', data => {
                const message = JSON.parse(data.toString()) as WebSocketMessage;
                if (message.type === 'welcome') {
                  welcomeMessages.push(message);
                  resolve();
                }
              });
            });

            ws.on('error', reject);
          })
      );

      await Promise.all(promises);

      expect(welcomeMessages).toHaveLength(connectionCount);
      expect(webSocketManager.getClientCount()).toBe(connectionCount);

      // Clean up
      connections.forEach(ws => ws.close());

      // Wait for disconnections
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(webSocketManager.getClientCount()).toBe(0);
    });

    it('should handle client disconnection gracefully', async () => {
      const ws = new WebSocket(wsUrl);

      await new Promise<void>(resolve => {
        ws.on('open', () => {
          expect(webSocketManager.getClientCount()).toBe(1);
          ws.close();
        });

        ws.on('close', () => {
          setTimeout(() => {
            expect(webSocketManager.getClientCount()).toBe(0);
            resolve();
          }, 50);
        });
      });
    });
  });

  describe('Authentication', () => {
    it('should authenticate with valid API key', async () => {
      const ws = new WebSocket(wsUrl);
      const messages: WebSocketMessage[] = [];

      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          ws.on('message', data => {
            const message = JSON.parse(data.toString()) as WebSocketMessage;
            messages.push(message);

            if (message.type === 'welcome') {
              // Send auth message
              const authMessage: WebSocketMessage = {
                type: 'auth',
                id: uuidv4(),
                payload: {
                  apiKey,
                },
                timestamp: new Date().toISOString(),
              };
              ws.send(JSON.stringify(authMessage));
            } else if (message.type === 'auth_success') {
              ws.close();
              resolve();
            } else if (message.type === 'error') {
              reject(new Error(message.payload.message));
            }
          });
        });

        ws.on('error', reject);
      });

      const authSuccess = messages.find(m => m.type === 'auth_success');
      expect(authSuccess).toBeDefined();
      expect(authSuccess?.payload.permissions).toContain('read');
      expect(authSuccess?.payload.permissions).toContain('write');
    });

    it('should reject invalid API key', async () => {
      const ws = new WebSocket(wsUrl);
      const messages: WebSocketMessage[] = [];

      await new Promise<void>(resolve => {
        ws.on('open', () => {
          ws.on('message', data => {
            const message = JSON.parse(data.toString()) as WebSocketMessage;
            messages.push(message);

            if (message.type === 'welcome') {
              // Send auth with invalid key
              const authMessage: WebSocketMessage = {
                type: 'auth',
                id: uuidv4(),
                payload: {
                  apiKey: 'invalid-key',
                },
                timestamp: new Date().toISOString(),
              };
              ws.send(JSON.stringify(authMessage));
            }
          });
        });

        ws.on('close', () => {
          resolve();
        });
      });

      const errorMessage = messages.find(m => m.type === 'error');
      expect(errorMessage).toBeDefined();
      expect(errorMessage?.payload.code).toBe('AUTH_FAILED');
    });

    it('should enforce authentication timeout', async () => {
      // Temporarily set short timeout for testing
      const originalTimeout = config.websocket.authTimeout;
      config.websocket.authTimeout = 500; // 500ms

      const ws = new WebSocket(wsUrl);
      const startTime = Date.now();

      await new Promise<void>(resolve => {
        ws.on('close', () => {
          const duration = Date.now() - startTime;
          expect(duration).toBeGreaterThan(400);
          expect(duration).toBeLessThan(1000);
          resolve();
        });
      });

      // Restore original timeout
      config.websocket.authTimeout = originalTimeout;
    });
  });

  describe('Message Handling', () => {
    let authenticatedWs: WebSocket;

    beforeEach(async () => {
      authenticatedWs = new WebSocket(wsUrl);

      await new Promise<void>((resolve, reject) => {
        authenticatedWs.on('open', () => {
          authenticatedWs.on('message', data => {
            const message = JSON.parse(data.toString()) as WebSocketMessage;

            if (message.type === 'welcome') {
              // Send auth
              const authMessage: WebSocketMessage = {
                type: 'auth',
                id: uuidv4(),
                payload: { apiKey },
                timestamp: new Date().toISOString(),
              };
              authenticatedWs.send(JSON.stringify(authMessage));
            } else if (message.type === 'auth_success') {
              resolve();
            }
          });
        });

        authenticatedWs.on('error', reject);
      });
    });

    afterEach(() => {
      authenticatedWs.close();
    });

    it('should handle malformed JSON messages', async () => {
      const messages: WebSocketMessage[] = [];

      authenticatedWs.on('message', data => {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        messages.push(message);
      });

      // Send invalid JSON
      authenticatedWs.send('{ invalid json }');

      await new Promise(resolve => setTimeout(resolve, 100));

      const errorMessage = messages.find(m => m.type === 'error');
      expect(errorMessage).toBeDefined();
      expect(errorMessage?.payload.code).toBe('INVALID_MESSAGE');
    });

    it('should validate message structure', async () => {
      const messages: WebSocketMessage[] = [];

      authenticatedWs.on('message', data => {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        messages.push(message);
      });

      // Send message without required fields
      authenticatedWs.send(JSON.stringify({ payload: {} }));

      await new Promise(resolve => setTimeout(resolve, 100));

      const errorMessage = messages.find(m => m.type === 'error');
      expect(errorMessage).toBeDefined();
      expect(errorMessage?.payload.message).toContain('Missing required fields');
    });

    it('should handle ping/pong heartbeat', async () => {
      let pongReceived = false;

      authenticatedWs.on('pong', () => {
        pongReceived = true;
      });

      authenticatedWs.ping();

      await new Promise(resolve => setTimeout(resolve, 100));
      expect(pongReceived).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce message rate limits', async () => {
      const ws = new WebSocket(wsUrl);
      const messages: WebSocketMessage[] = [];

      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          ws.on('message', data => {
            const message = JSON.parse(data.toString()) as WebSocketMessage;
            messages.push(message);

            if (message.type === 'welcome') {
              // Send many messages quickly
              for (let i = 0; i < 100; i++) {
                const msg: WebSocketMessage = {
                  type: 'ping',
                  id: uuidv4(),
                  payload: { index: i },
                  timestamp: new Date().toISOString(),
                };
                ws.send(JSON.stringify(msg));
              }

              setTimeout(() => {
                ws.close();
                resolve();
              }, 500);
            }
          });
        });

        ws.on('error', reject);
      });

      const rateLimitError = messages.find(
        m => m.type === 'error' && m.payload.code === 'RATE_LIMIT'
      );
      expect(rateLimitError).toBeDefined();
    });

    it('should enforce connection rate limits', async () => {
      const connections: WebSocket[] = [];
      let connectionRejected = false;

      // Create many connections from same IP
      for (let i = 0; i < 20; i++) {
        const ws = new WebSocket(wsUrl);
        connections.push(ws);

        ws.on('close', code => {
          if (code === 1008) {
            // Policy violation
            connectionRejected = true;
          }
        });
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(connectionRejected).toBe(true);

      // Clean up
      connections.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle server errors gracefully', async () => {
      const ws = new WebSocket(wsUrl);

      await new Promise<void>(resolve => {
        ws.on('open', () => {
          // Send message that might cause internal error
          const msg: WebSocketMessage = {
            type: 'unknown_type',
            id: uuidv4(),
            payload: null,
            timestamp: new Date().toISOString(),
          };
          ws.send(JSON.stringify(msg));
        });

        ws.on('message', data => {
          const message = JSON.parse(data.toString()) as WebSocketMessage;
          if (message.type === 'error') {
            ws.close();
            resolve();
          }
        });
      });
    });

    it('should recover from client errors', async () => {
      const ws = new WebSocket(wsUrl);
      let errorHandled = false;

      await new Promise<void>(resolve => {
        ws.on('open', () => {
          // Simulate client error
          ws.emit('error', new Error('Test client error'));
        });

        ws.on('close', () => {
          errorHandled = true;
          resolve();
        });
      });

      expect(errorHandled).toBe(true);
    });
  });
});
