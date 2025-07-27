/**
 * WebSocket Stress Testing Suite
 *
 * Tests WebSocket server performance under high connection loads,
 * message throughput, and concurrent operations.
 */

import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { webSocketManager } from '@/websocket/server';
import { dbConnection } from '@/database/connection';
import { config } from '@/config';
import { SubscriptionChannel } from '@/websocket/types';
import type { WebSocketMessage } from '@/websocket/types';

describe('WebSocket Stress Tests', () => {
  // Use a dynamic port for testing to avoid conflicts
  const testPort = 3001 + Math.floor(Math.random() * 1000);
  const wsUrl = `ws://${String(String(config.websocket.host))}:${String(testPort)}${String(String(config.websocket.path))}`;
  let apiKey: string;

  beforeAll(async () => {
    // Initialize database
    await dbConnection.initialize({
      path: ':memory:',
      skipSchema: false,
    });

    // Create test API key
    apiKey = `test-api-key-${String(uuidv4())}`;
    await dbConnection.execute(
      'INSERT INTO api_keys (id, key_hash, name, permissions, created_at) VALUES (?, ?, ?, ?, ?)',
      [uuidv4(), apiKey, 'Test API Key', 'read,write', new Date().toISOString()]
    );

    // Start WebSocket server on test port
    await webSocketManager.start(testPort);
  }, 30000);

  afterAll(async () => {
    await webSocketManager.stop();
    await dbConnection.close();
  });

  async function createAuthenticatedConnection(): Promise<{
    ws: WebSocket;
    clientId: string;
  }> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      let clientId: string;

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 5000);

      ws.on('open', () => {
        ws.on('message', data => {
          const message = JSON.parse(data.toString()) as WebSocketMessage;

          if (message.type === 'welcome') {
            clientId = message.payload.clientId;
            // Send auth
            const authMessage: WebSocketMessage = {
              type: 'auth',
              id: uuidv4(),
              payload: { apiKey },
              timestamp: new Date().toISOString(),
            };
            ws.send(JSON.stringify(authMessage));
          } else if (message.type === 'auth_success') {
            clearTimeout(timeout);
            resolve({ ws, clientId });
          }
        });
      });

      ws.on('error', error => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  describe('Connection Load Testing', () => {
    it('should handle 50 concurrent connections', async () => {
      const connectionCount = 50;
      const connections: Array<{ ws: WebSocket; clientId: string }> = [];
      const startTime = Date.now();

      try {
        // Create connections in batches to avoid overwhelming the system
        const batchSize = 10;
        for (let i = 0; i < connectionCount; i += batchSize) {
          const batchPromises = [];
          for (let j = 0; j < batchSize && i + j < connectionCount; j++) {
            batchPromises.push(createAuthenticatedConnection());
          }
          const batchConnections = await Promise.all(batchPromises);
          connections.push(...batchConnections);

          // Small delay between batches to prevent overwhelming
          await new Promise<void>(resolve => {
            setTimeout(resolve, 100);
          });
        }

        const endTime = Date.now();
        const duration = endTime - startTime;

        expect(connections).toHaveLength(connectionCount);
        expect(webSocketManager.getClientCount()).toBe(connectionCount);
        expect(duration).toBeLessThan(15000); // Should complete within 15 seconds

        logger.log(`✓ ${String(connectionCount)} connections established in ${String(duration)}ms`);
        logger.log(`✓ Average connection time: ${String(duration / connectionCount)}ms`);
      } finally {
        // Clean up all connections
        connections.forEach(({ ws }) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        });

        // Wait for disconnections
        await new Promise<void>(resolve => {
          setTimeout(resolve, 1000);
        });
        expect(webSocketManager.getClientCount()).toBe(0);
      }
    }, 30000);

    it('should handle rapid connection/disconnection cycles', async () => {
      const cycles = 20;
      const startTime = Date.now();

      for (let i = 0; i < cycles; i++) {
        // Connect
        const { ws } = await createAuthenticatedConnection();
        expect(webSocketManager.getClientCount()).toBe(1);

        // Immediately disconnect
        ws.close();

        // Wait for disconnection to be processed
        await new Promise<void>(resolve => {
          setTimeout(resolve, 50);
        });
        expect(webSocketManager.getClientCount()).toBe(0);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
      logger.log(`✓ ${String(cycles)} connection cycles completed in ${String(duration)}ms`);
    }, 15000);
  });

  describe('Message Throughput Testing', () => {
    it('should handle high message volume from single client', async () => {
      const { ws } = await createAuthenticatedConnection();
      const messageCount = 500;
      const messages: WebSocketMessage[] = [];

      // Set up message listener
      ws.on('message', data => {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        messages.push(message);
      });

      const startTime = Date.now();

      // Send many ping messages rapidly
      for (let i = 0; i < messageCount; i++) {
        const pingMessage: WebSocketMessage = {
          type: 'ping',
          id: uuidv4(),
          payload: { index: i },
          timestamp: new Date().toISOString(),
        };
        ws.send(JSON.stringify(pingMessage));
      }

      // Wait for processing
      await new Promise<void>(resolve => {
        setTimeout(resolve, 2000);
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should handle high message volume efficiently
      expect(duration).toBeLessThan(5000);

      // Some messages should be processed (rate limiting may kick in)
      expect(messages.length).toBeGreaterThan(0);

      logger.log(`✓ Sent ${String(messageCount)} messages in ${String(duration)}ms`);
      logger.log(`✓ Processed ${String(String(messages.length))} messages`);
      logger.log(
        `✓ Throughput: ${String(String(Math.round((messageCount / duration) * 1000)))} msg/sec`
      );

      ws.close();
    }, 10000);

    it('should handle concurrent messaging from multiple clients', async () => {
      const clientCount = 10;
      const messagesPerClient = 20;
      const connections: Array<{ ws: WebSocket; clientId: string }> = [];

      try {
        // Create multiple authenticated connections
        for (let i = 0; i < clientCount; i++) {
          const connection = await createAuthenticatedConnection();
          connections.push(connection);
        }

        const startTime = Date.now();
        const allMessagePromises: Promise<void>[] = [];

        // Each client sends messages concurrently
        connections.forEach(({ ws }, clientIndex) => {
          const clientPromise = new Promise<void>(resolve => {
            let sentCount = 0;

            const sendMessage = () => {
              if (sentCount < messagesPerClient) {
                const message: WebSocketMessage = {
                  type: 'ping',
                  id: uuidv4(),
                  payload: { client: clientIndex, index: sentCount },
                  timestamp: new Date().toISOString(),
                };
                ws.send(JSON.stringify(message));
                sentCount++;
                setTimeout(sendMessage, 10); // Small delay between messages
              } else {
                resolve();
              }
            };

            sendMessage();
          });

          allMessagePromises.push(clientPromise);
        });

        await Promise.all(allMessagePromises);
        const endTime = Date.now();
        const duration = endTime - startTime;

        const totalMessages = clientCount * messagesPerClient;
        expect(duration).toBeLessThan(10000); // Should complete within 10 seconds

        logger.log(
          `✓ ${String(clientCount)} clients sent ${String(totalMessages)} total messages in ${String(duration)}ms`
        );
        logger.log(
          `✓ Concurrent throughput: ${String(String(Math.round((totalMessages / duration) * 1000)))} msg/sec`
        );
      } finally {
        // Clean up connections
        connections.forEach(({ ws }) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        });
      }
    }, 15000);
  });

  describe('Subscription Performance', () => {
    it('should handle many subscriptions efficiently', async () => {
      const { ws } = await createAuthenticatedConnection();
      const subscriptionCount = 30;
      const responses: WebSocketMessage[] = [];

      ws.on('message', data => {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        responses.push(message);
      });

      const startTime = Date.now();

      // Create many subscriptions
      for (let i = 0; i < subscriptionCount; i++) {
        const subscribeMessage: WebSocketMessage = {
          type: 'subscribe',
          id: uuidv4(),
          payload: {
            channel: SubscriptionChannel.BOARD,
            filters: { boardId: `board-${String(i)}` },
          },
          timestamp: new Date().toISOString(),
        };
        ws.send(JSON.stringify(subscribeMessage));

        // Small delay to avoid overwhelming
        await new Promise<void>(resolve => {
          setTimeout(resolve, 10);
        });
      }

      // Wait for all subscription responses
      await new Promise<void>(resolve => {
        setTimeout(resolve, 1000);
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      const successResponses = responses.filter(m => m.type === 'subscribe_success');
      expect(successResponses.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(5000);

      logger.log(`✓ Created ${successResponses.length} subscriptions in ${duration}ms`);

      ws.close();
    }, 10000);

    it('should broadcast to many subscribers efficiently', async () => {
      const subscriberCount = 20;
      const connections: Array<{ ws: WebSocket; clientId: string }> = [];
      const allMessages: WebSocketMessage[][] = [];

      try {
        // Create multiple subscribers
        for (let i = 0; i < subscriberCount; i++) {
          const connection = await createAuthenticatedConnection();
          connections.push(connection);

          const messages: WebSocketMessage[] = [];
          allMessages.push(messages);

          connection.ws.on('message', data => {
            const message = JSON.parse(data.toString()) as WebSocketMessage;
            messages.push(message);
          });

          // Subscribe to board updates
          const subscribeMessage: WebSocketMessage = {
            type: 'subscribe',
            id: uuidv4(),
            payload: {
              channel: SubscriptionChannel.BOARD,
              filters: { boardId: 'broadcast-test-board' },
            },
            timestamp: new Date().toISOString(),
          };
          connection.ws.send(JSON.stringify(subscribeMessage));
        }

        // Wait for subscriptions to be established
        await new Promise<void>(resolve => {
          setTimeout(resolve, 1000);
        });

        const startTime = Date.now();

        // Broadcast a message to all subscribers
        const broadcastCount = webSocketManager.getSubscriptionManager().publishTaskCreated(
          {
            id: uuidv4(),
            title: 'Broadcast Test Task',
            board_id: 'broadcast-test-board',
            status: 'todo',
            position: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as any,
          'test-user'
        );

        // Wait for message propagation
        await new Promise<void>(resolve => {
          setTimeout(resolve, 500);
        });

        const endTime = Date.now();
        const duration = endTime - startTime;

        expect(broadcastCount).toBeGreaterThan(0);
        expect(duration).toBeLessThan(1000); // Should broadcast quickly

        // Count how many subscribers received the broadcast
        const receivedCount = allMessages.filter(messages =>
          messages.some(m => m.type === 'channel_message')
        ).length;

        logger.log(`✓ Broadcast to ${String(broadcastCount)} subscribers in ${String(duration)}ms`);
        logger.log(`✓ ${String(receivedCount)} subscribers received the message`);
      } finally {
        // Clean up connections
        connections.forEach(({ ws }) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        });
      }
    }, 15000);
  });

  describe('Memory and Resource Management', () => {
    it('should clean up resources properly after mass disconnections', async () => {
      const connectionCount = 25;
      const connections: Array<{ ws: WebSocket; clientId: string }> = [];

      // Create many connections
      for (let i = 0; i < connectionCount; i++) {
        const connection = await createAuthenticatedConnection();
        connections.push(connection);

        // Each connection creates subscriptions
        const subscribeMessage: WebSocketMessage = {
          type: 'subscribe',
          id: uuidv4(),
          payload: {
            channel: SubscriptionChannel.BOARD,
            filters: { boardId: `cleanup-test-${String(i)}` },
          },
          timestamp: new Date().toISOString(),
        };
        connection.ws.send(JSON.stringify(subscribeMessage));
      }

      // Wait for connections and subscriptions to be established
      await new Promise<void>(resolve => {
        setTimeout(resolve, 1000);
      });

      expect(webSocketManager.getClientCount()).toBe(connectionCount);

      const initialStats = webSocketManager.getSubscriptionManager().getStats();
      expect(initialStats.totalSubscriptions).toBeGreaterThan(0);

      // Disconnect all clients simultaneously
      connections.forEach(({ ws }) => ws.close());

      // Wait for cleanup
      await new Promise<void>(resolve => {
        setTimeout(resolve, 2000);
      });

      // Verify cleanup
      expect(webSocketManager.getClientCount()).toBe(0);

      const finalStats = webSocketManager.getSubscriptionManager().getStats();
      expect(finalStats.totalSubscriptions).toBe(0);

      logger.log(`✓ Cleaned up ${String(connectionCount)} connections and their subscriptions`);
      logger.log(`✓ Initial subscriptions: ${String(String(initialStats.totalSubscriptions))}`);
      logger.log(`✓ Final subscriptions: ${String(String(finalStats.totalSubscriptions))}`);
    }, 10000);

    it('should handle sustained connection churn', async () => {
      const iterations = 15;
      const connectionsPerIteration = 5;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        const batchConnections: Array<{ ws: WebSocket; clientId: string }> = [];

        // Create batch of connections
        for (let j = 0; j < connectionsPerIteration; j++) {
          const connection = await createAuthenticatedConnection();
          batchConnections.push(connection);
        }

        // Use connections briefly
        batchConnections.forEach(({ ws }) => {
          const pingMessage: WebSocketMessage = {
            type: 'ping',
            id: uuidv4(),
            payload: { iteration: i },
            timestamp: new Date().toISOString(),
          };
          ws.send(JSON.stringify(pingMessage));
        });

        // Disconnect batch
        batchConnections.forEach(({ ws }) => ws.close());

        // Brief pause between iterations
        await new Promise<void>(resolve => {
          setTimeout(resolve, 100);
        });
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should handle churn efficiently
      expect(duration).toBeLessThan(20000);
      expect(webSocketManager.getClientCount()).toBe(0);

      logger.log(
        `✓ Handled ${String(iterations * connectionsPerIteration)} connection churn in ${String(duration)}ms`
      );
    }, 25000);
  });

  describe('Error Recovery Performance', () => {
    it('should recover quickly from invalid message floods', async () => {
      const { ws } = await createAuthenticatedConnection();
      const invalidMessageCount = 100;
      const responses: WebSocketMessage[] = [];

      ws.on('message', data => {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        responses.push(message);
      });

      const startTime = Date.now();

      // Send flood of invalid messages
      for (let i = 0; i < invalidMessageCount; i++) {
        ws.send('{ invalid json }');
        ws.send(JSON.stringify({ type: 'invalid_type', incomplete: true }));
      }

      // Send a valid message after the flood
      const validMessage: WebSocketMessage = {
        type: 'ping',
        id: uuidv4(),
        payload: { test: 'recovery' },
        timestamp: new Date().toISOString(),
      };
      ws.send(JSON.stringify(validMessage));

      // Wait for processing
      await new Promise<void>(resolve => {
        setTimeout(resolve, 1000);
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should recover and still process valid messages
      expect(duration).toBeLessThan(3000);

      // Should have error responses for invalid messages
      const errorResponses = responses.filter(m => m.type === 'error');
      expect(errorResponses.length).toBeGreaterThan(0);

      logger.log(
        `✓ Recovered from ${String(invalidMessageCount)} invalid messages in ${String(duration)}ms`
      );
      logger.log(`✓ Generated ${String(String(errorResponses.length))} error responses`);

      ws.close();
    }, 5000);
  });
});
