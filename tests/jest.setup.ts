/**
 * Jest setup file for test configuration
 */

import 'dotenv/config';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.LOG_LEVEL = 'error';
process.env.API_KEY_SECRET = 'test-secret-key-minimum-16-chars';
process.env.API_KEYS = 'dev-key-1,test-key-1';

// Global test configuration
const originalConsole = console;

// Mock console methods in tests to reduce noise
global.console = {
  ...originalConsole,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: originalConsole.error, // Keep error for debugging
};

// Increase timeout for database operations
jest.setTimeout(10000);

// Global test setup
beforeAll(async () => {
  // TODO: Initialize test database if needed
});

// Global test cleanup
afterAll(async () => {
  // TODO: Cleanup test resources
});

// Reset mocks between tests
beforeEach(() => {
  jest.clearAllMocks();
});

// Global test utilities
declare global {
  namespace NodeJS {
    interface Global {
      testUtils: {
        createTestTask: () => any;
        createTestBoard: () => any;
        cleanupTestData: () => Promise<void>;
      };
    }
  }
}

// TODO: Add more test utilities as needed
global.testUtils = {
  createTestTask: () => ({
    id: 'test-task-1',
    title: 'Test Task',
    description: 'Test Description',
    status: 'todo',
    boardId: 'test-board-1',
    createdAt: new Date().toISOString(),
  }),

  createTestBoard: () => ({
    id: 'test-board-1',
    name: 'Test Board',
    columns: ['todo', 'in-progress', 'done'],
    createdAt: new Date().toISOString(),
  }),

  cleanupTestData: async () => {
    // TODO: Implement test data cleanup
  },
};

export {};
