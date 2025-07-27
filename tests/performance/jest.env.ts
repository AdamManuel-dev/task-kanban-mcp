/**
 * Performance Test Environment Setup
 */

// Environment variables for performance testing
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'warn'; // Reduce logging noise during performance tests
process.env.DB_PATH = ':memory:'; // Always use in-memory database for consistent performance

// Increase timeout for performance tests
jest.setTimeout(60000);

// Global performance monitoring
global.performanceStart = Date.now();

// Optionally expose garbage collection for memory tests
if (typeof global.gc === 'undefined') {
  try {
    // Try to expose gc if Node.js was started with --expose-gc
    global.gc = require('vm').runInNewContext('gc');
  } catch (e) {
    // gc not available, which is fine for most tests
    global.gc = () => {
      // No-op if gc not available
    };
  }
}
