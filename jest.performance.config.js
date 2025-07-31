module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Test files
  testMatch: ['<rootDir>/tests/performance/**/*.test.ts'],

  // Module resolution
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts'],

  // Performance test specific settings
  testTimeout: 60000, // 60 seconds for performance tests
  maxWorkers: 1, // Run performance tests sequentially to avoid interference

  // Coverage (disabled for performance tests to avoid overhead)
  collectCoverage: false,

  // Reporters
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: './coverage',
        outputName: 'performance-test-results.xml',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        ancestorSeparator: ' › ',
        usePathForSuiteName: true,
      },
    ],
  ],

  // Transform settings
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.test.json',
      },
    ],
  },

  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  // Ignore patterns
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/dist/', '<rootDir>/coverage/'],

  // Environment variables for performance testing
  setupFiles: ['<rootDir>/tests/performance/jest.env.ts'],

  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,

  // Verbose output for performance analysis
  verbose: true,

  // Force exit to prevent hanging after performance tests
  forceExit: true,

  // Detect open handles (useful for finding resource leaks)
  detectOpenHandles: true,
};
