/** @type {import('jest').Config} */
module.exports = {
  // Basic configuration
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // TypeScript configuration - use ts-jest only for consistency
  // transform: defined by preset
  
  // Module resolution
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // extensionsToTreatAsEsm: ['.ts'], // Disabled to avoid conflicts with ts-jest
  transformIgnorePatterns: [
    'node_modules/(?!(ink-testing-library|@testing-library)/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@repositories/(.*)$': '<rootDir>/src/repositories/$1',
    '^@controllers/(.*)$': '<rootDir>/src/controllers/$1',
    '^@middleware/(.*)$': '<rootDir>/src/middleware/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@types/(.*)$': '<rootDir>/src/types/$1',
    '^@mcp/(.*)$': '<rootDir>/src/mcp/$1',
    '^@cli/(.*)$': '<rootDir>/src/cli/$1',
  },
  
  // Setup files - temporarily disabled to diagnose cache issue
  // setupFilesAfterEnv: [
  //   '<rootDir>/tests/jest.setup.ts',
  //   '<rootDir>/tests/cli-setup.ts'
  // ],
  
  // Coverage configuration
  collectCoverage: false,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/index.ts',
    '!**/node_modules/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  
  // Test environment
  testTimeout: 10000,
  maxWorkers: '50%',
  
  // Reporters
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'coverage',
        outputName: 'junit.xml',
      },
    ],
  ],
  
  // Mock configuration
  clearMocks: true,
  restoreMocks: true,
  resetMocks: false,
  
  // Error handling
  errorOnDeprecated: true,
  verbose: true,
  
  // Transform configuration (modern ts-jest approach)
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: false,
    }],
  },
  
  // Watch mode
  watchPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    '<rootDir>/coverage/',
    '<rootDir>/logs/',
    '<rootDir>/data/',
  ],
};