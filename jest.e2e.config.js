/** @type {import('jest').Config} */
module.exports = {
  // E2E Test Configuration
  displayName: 'E2E Tests',
  testEnvironment: 'node',
  
  // TypeScript configuration
  preset: 'ts-jest',
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json'
    }],
  },
  
  // Test file patterns
  testMatch: [
    '**/tests/e2e/**/*.test.ts'
  ],
  
  // Module resolution
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@cli/(.*)$': '<rootDir>/src/cli/$1',
  },
  
  // Setup and teardown
  setupFilesAfterEnv: [
    '<rootDir>/tests/e2e/setup.ts'
  ],
  
  // Test environment
  testTimeout: 60000, // 60 seconds for E2E tests
  maxWorkers: 1, // Run E2E tests sequentially to avoid conflicts
  
  // Coverage (optional for E2E)
  collectCoverage: false,
  
  // Reporters
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'coverage/e2e',
        outputName: 'e2e-results.xml',
        suiteName: 'E2E CLI Tests',
      },
    ],
  ],
  
  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
  
  // Verbose output for debugging
  verbose: true,
  
  // Exit immediately on first test failure (useful for CI)
  bail: 1,
  
  // Global variables
  globals: {
    'ts-jest': {
      useESM: false,
    },
  },
  
  // Watch mode ignore patterns
  watchPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    '<rootDir>/coverage/',
    '<rootDir>/logs/',
  ],
};