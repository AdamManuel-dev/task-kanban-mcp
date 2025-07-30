/**
 * CLI Testing Setup
 * Configuration and utilities for testing CLI components
 */

// import { render } from 'ink-testing-library';
import type { ReactElement } from 'react';

// Mock blessed for testing
jest.mock('blessed', () => ({
  screen: jest.fn(() => ({
    key: jest.fn(),
    append: jest.fn(),
    remove: jest.fn(),
    render: jest.fn(),
    destroy: jest.fn(),
  })),
  box: jest.fn(() => ({
    setContent: jest.fn(),
    focus: jest.fn(),
    key: jest.fn(),
  })),
}));

// Mock blessed-contrib for testing
jest.mock('blessed-contrib', () => ({
  grid: jest.fn(() => ({
    set: jest.fn(() => ({
      setData: jest.fn(),
      log: jest.fn(),
      setPercent: jest.fn(),
      focus: jest.fn(),
      destroy: jest.fn(),
    })),
  })),
  donut: jest.fn(),
  bar: jest.fn(),
  line: jest.fn(),
  table: jest.fn(),
  log: jest.fn(),
  gauge: jest.fn(),
  sparkline: jest.fn(),
}));

// Mock chalk for testing
jest.mock('chalk', () => ({
  cyan: jest.fn(str => str),
  green: jest.fn(str => str),
  yellow: jest.fn(str => str),
  red: jest.fn(str => str),
  blue: jest.fn(str => str),
  magenta: jest.fn(str => str),
  gray: jest.fn(str => str),
  bold: {
    blue: jest.fn(str => str),
    green: jest.fn(str => str),
    magenta: jest.fn(str => str),
  },
}));

// Mock ora for testing
jest.mock('ora', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    succeed: jest.fn(),
    fail: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    text: '',
    color: 'cyan',
    isSpinning: false,
  })),
}));

// Mock enquirer for testing
jest.mock('enquirer', () => ({
  prompt: jest.fn(),
  Select: jest.fn(),
  Input: jest.fn(),
  Confirm: jest.fn(),
  MultiSelect: jest.fn(),
}));

// Mock prompts for testing
jest.mock('prompts', () => jest.fn());

// Mock listr2 for testing
jest.mock('listr2', () => ({
  Listr: jest.fn(() => ({
    run: jest.fn(),
    add: jest.fn(),
  })),
}));

// CLI Testing utilities
export const cliTestUtils = {
  /**
   * Render a React component for CLI testing (placeholder)
   */
  renderComponent: (_component: ReactElement): any =>
    // TODO: Implement when ink-testing-library is properly configured
    ({
      lastFrame: (): string => '',
      frames: [],
      rerender: jest.fn(),
      unmount: jest.fn(),
    }),
  /**
   * Mock process.argv for command testing
   */
  mockArgv: (args: string[]): (() => void) => {
    const originalArgv = process.argv;
    process.argv = ['node', 'test', ...args];
    return (): void => {
      process.argv = originalArgv;
    };
  },

  /**
   * Mock process.stdout.write for output testing
   */
  mockStdout: (): { getWrites: () => string[]; restore: () => void } => {
    const originalWrite = process.stdout.write;
    const writes: string[] = [];

    process.stdout.write = jest.fn((chunk: any) => {
      writes.push(chunk.toString());
      return true;
    }) as any;

    return {
      getWrites: (): string[] => writes,
      restore: (): void => {
        process.stdout.write = originalWrite;
      },
    };
  },

  /**
   * Mock process.stderr.write for error testing
   */
  mockStderr: (): { getWrites: () => string[]; restore: () => void } => {
    const originalWrite = process.stderr.write;
    const writes: string[] = [];

    process.stderr.write = jest.fn((chunk: any) => {
      writes.push(chunk.toString());
      return true;
    }) as any;

    return {
      getWrites: (): string[] => writes,
      restore: (): void => {
        process.stderr.write = originalWrite;
      },
    };
  },

  /**
   * Create mock API client for testing
   */
  createMockApiClient: (): any => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
  }),

  /**
   * Create mock config manager for testing
   */
  createMockConfig: (): any => ({
    get: jest.fn(),
    set: jest.fn(),
    exists: jest.fn((): boolean => true),
    load: jest.fn(),
    save: jest.fn(),
  }),

  /**
   * Create mock formatter for testing
   */
  createMockFormatter: (): any => ({
    setFormat: jest.fn(),
    setVerbose: jest.fn(),
    setQuiet: jest.fn(),
    setColor: jest.fn(),
    formatTable: jest.fn(),
    formatList: jest.fn(),
    formatJson: jest.fn(),
  }),

  /**
   * Wait for async operations
   */
  waitFor: async (ms = 100): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, ms)),

  /**
   * Create test task data
   */
  createTestTask: (overrides = {}): any => ({
    id: 'test-task-1',
    title: 'Test Task',
    description: 'Test task description',
    status: 'todo',
    priority: 'P2',
    boardId: 'test-board-1',
    assigneeId: null,
    dueDate: null,
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }),

  /**
   * Create test board data
   */
  createTestBoard: (overrides = {}): any => ({
    id: 'test-board-1',
    name: 'Test Board',
    description: 'Test board description',
    columns: [
      { id: 'col-1', name: 'Todo', position: 0 },
      { id: 'col-2', name: 'In Progress', position: 1 },
      { id: 'col-3', name: 'Done', position: 2 },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }),

  /**
   * Create dashboard test data
   */
  createTestDashboardData: (): any => ({
    tasks: {
      total: 20,
      byStatus: { todo: 8, in_progress: 6, done: 6 },
      byPriority: { P1: 3, P2: 8, P3: 7, P4: 2 },
      completed: 6,
      overdue: 2,
    },
    velocity: [
      { period: 'W1', completed: 5 },
      { period: 'W2', completed: 7 },
      { period: 'W3', completed: 6 },
      { period: 'W4', completed: 8 },
    ],
    teamMembers: [
      { name: 'Alice', taskCount: 5, load: 80 },
      { name: 'Bob', taskCount: 3, load: 60 },
    ],
    burndown: [
      { day: 'Day 1', remaining: 20, ideal: 20 },
      { day: 'Day 2', remaining: 18, ideal: 17 },
      { day: 'Day 3', remaining: 15, ideal: 14 },
    ],
    activity: [
      { timestamp: '10:30', event: 'Task completed', user: 'Alice' },
      { timestamp: '09:15', event: 'Task created', user: 'Bob' },
    ],
  }),
};

// Global test utilities for CLI
declare global {
  interface Global {
    cliTestUtils: typeof cliTestUtils;
  }
}

global.cliTestUtils = cliTestUtils;

export default cliTestUtils;
