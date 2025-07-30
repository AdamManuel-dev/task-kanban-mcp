/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Minimal configuration to bypass transform issues
  roots: ['<rootDir>/tests/unit/utils'],
  testMatch: ['**/validation.test.ts'],
  
  // Use only ts-jest transform
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  
  // Basic module resolution
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  
  // Minimal setup
  testTimeout: 5000,
  verbose: true,
  cache: false,
};