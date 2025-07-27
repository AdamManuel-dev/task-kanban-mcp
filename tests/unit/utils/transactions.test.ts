/**
 * Unit tests for Transaction Utilities
 *
 * @description Tests for transaction management and utilities
 */

import type { TransactionContext, TransactionOptions } from '../../../src/utils/transactions';
import {
  TransactionManager,
  withTransaction,
  batchInTransaction,
} from '../../../src/utils/transactions';

// Mock the logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock database connection
const mockDbConnection = {
  transaction: jest.fn(),
  exec: jest.fn(),
};

describe('Transaction Utilities', () => {
  let transactionManager: TransactionManager;

  beforeEach(() => {
    jest.clearAllMocks();
    transactionManager = new TransactionManager(mockDbConnection as unknown as TransactionContext);
  });

  describe('TransactionManager', () => {
    describe('executeTransaction', () => {
      it('should execute a successful transaction', async () => {
        const mockResult = { success: true };
        const mockOperations = jest.fn().mockResolvedValue(mockResult);

        mockDbConnection.transaction.mockImplementation(async callback => {
          await Promise.resolve();
          return callback(mockDbConnection) as unknown;
        });

        const result = await transactionManager.executeTransaction(mockOperations);

        expect(result).toEqual(mockResult);
        expect(mockDbConnection.transaction).toHaveBeenCalledTimes(1);
        expect(mockOperations).toHaveBeenCalledWith(
          expect.objectContaining({
            id: expect.any(String),
            startTime: expect.any(Date),
            operations: [],
            rollbackActions: [],
            metadata: {},
          })
        );
      });

      it('should handle transaction failure', async () => {
        const error = new Error('Transaction failed');
        const mockOperations = jest.fn().mockRejectedValue(error);

        mockDbConnection.transaction.mockImplementation(async callback => {
          await Promise.resolve();
          return callback(mockDbConnection) as unknown;
        });

        await expect(transactionManager.executeTransaction(mockOperations)).rejects.toThrow(
          'Transaction failed'
        );

        expect(mockDbConnection.transaction).toHaveBeenCalledTimes(1);
      });

      it('should handle transaction timeout', async () => {
        const mockOperations = jest.fn().mockImplementation(
          () =>
            new Promise<void>(resolve => {
              setTimeout(resolve, 1000);
            })
        );

        mockDbConnection.transaction.mockImplementation(async callback => {
          await Promise.resolve();
          return callback(mockDbConnection) as unknown;
        });

        const options: TransactionOptions = { timeout: 100 };

        await expect(
          transactionManager.executeTransaction(mockOperations, options)
        ).rejects.toThrow('Transaction timeout');
      });
    });

    describe('executeTransactionWithRetry', () => {
      it('should retry on retryable errors', async () => {
        const mockResult = { success: true };
        const retryableError = new Error('SQLITE_BUSY: database is locked');
        const mockOperations = jest
          .fn()
          .mockRejectedValueOnce(retryableError)
          .mockRejectedValueOnce(retryableError)
          .mockResolvedValue(mockResult);

        mockDbConnection.transaction.mockImplementation(async callback => {
          await Promise.resolve();
          return callback(mockDbConnection) as unknown;
        });

        const options: TransactionOptions = { retryAttempts: 3 };
        const result = await transactionManager.executeTransactionWithRetry(
          mockOperations,
          options
        );

        expect(result).toEqual(mockResult);
        expect(mockOperations).toHaveBeenCalledTimes(3);
      });

      it('should not retry on non-retryable errors', async () => {
        const nonRetryableError = new Error('Invalid input');
        const mockOperations = jest.fn().mockRejectedValue(nonRetryableError);

        mockDbConnection.transaction.mockImplementation(async callback => {
          await Promise.resolve();
          return callback(mockDbConnection) as unknown;
        });

        const options: TransactionOptions = { retryAttempts: 3 };

        await expect(
          transactionManager.executeTransactionWithRetry(mockOperations, options)
        ).rejects.toThrow('Invalid input');

        expect(mockOperations).toHaveBeenCalledTimes(1);
      });
    });

    describe('addOperation', () => {
      it('should add operation to context', () => {
        const context: TransactionContext = {
          id: 'test-id',
          startTime: new Date(),
          operations: [],
          rollbackActions: [],
        };

        transactionManager.addOperation(context, 'TestService', 'testMethod');

        expect(context.operations).toHaveLength(1);
        expect(context.operations[0]).toMatchObject({
          service: 'TestService',
          method: 'testMethod',
          status: 'pending',
          timestamp: expect.any(Date),
        });
      });
    });

    describe('addRollbackAction', () => {
      it('should add rollback action to context', () => {
        const context: TransactionContext = {
          id: 'test-id',
          startTime: new Date(),
          operations: [],
          rollbackActions: [],
        };

        const rollbackAction = jest.fn();
        transactionManager.addRollbackAction(context, rollbackAction);

        expect(context.rollbackActions).toHaveLength(1);
        expect(context.rollbackActions[0]).toBe(rollbackAction);
      });
    });

    describe('getActiveTransactionCount', () => {
      it('should return 0 when no active transactions', () => {
        expect(transactionManager.getActiveTransactionCount()).toBe(0);
      });
    });

    describe('getTransaction', () => {
      it('should return undefined for non-existent transaction', () => {
        expect(transactionManager.getTransaction('non-existent')).toBeUndefined();
      });
    });
  });

  describe('withTransaction utility', () => {
    it('should execute operation within transaction', async () => {
      const mockService = { db: mockDbConnection };
      const mockResult = { success: true };
      const mockOperation = jest.fn().mockResolvedValue(mockResult);

      mockDbConnection.transaction.mockImplementation(async callback => {
        await Promise.resolve();
        return callback(mockDbConnection) as unknown;
      });

      const result = await withTransaction(mockService, mockOperation);

      expect(result).toEqual(mockResult);
      expect(mockOperation).toHaveBeenCalledWith(
        mockService,
        expect.objectContaining({
          id: expect.any(String),
          startTime: expect.any(Date),
          operations: [],
          rollbackActions: [],
        })
      );
    });
  });

  describe('batchInTransaction utility', () => {
    it('should process items in batches', async () => {
      const items = [1, 2, 3, 4, 5];
      const mockOperation = jest.fn().mockImplementation(item => Promise.resolve(item * 2));

      mockDbConnection.transaction.mockImplementation(async callback => {
        await Promise.resolve();
        return callback(mockDbConnection) as unknown;
      });

      const result = await batchInTransaction(mockDbConnection, items, mockOperation, {
        batchSize: 2,
      });

      expect(result).toEqual([2, 4, 6, 8, 10]);
      expect(mockOperation).toHaveBeenCalledTimes(5);
    });
  });

  describe('transactional decorator', () => {
    it('should create transactional method', () => {
      const decorator = TransactionManager.transactional();
      expect(typeof decorator).toBe('function');
    });
  });
});
