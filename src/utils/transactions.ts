/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, class-methods-use-this, no-await-in-loop, no-restricted-syntax, no-plusplus, @typescript-eslint/require-await */
import { logger } from '@/utils/logger';
import type { DatabaseConnection } from '@/database/connection';
import { BaseServiceError, DatabaseError } from '@/utils/errors';
import { isError, getErrorMessage } from './typeGuards';

export interface TransactionContext {
  id: string;
  startTime: Date;
  operations: TransactionOperation[];
  rollbackActions: (() => Promise<void>)[];
  metadata?: Record<string, unknown>;
}

export interface TransactionOperation {
  service: string;
  method: string;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed';
  error?: Error;
}

export interface TransactionOptions {
  isolationLevel?: 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';
  timeout?: number;
  retryAttempts?: number;
  autoRollback?: boolean;
}

/**
 * Type-safe transaction callback
 */
type TransactionCallback<T> = (context: TransactionContext) => Promise<T>;

/**
 * Type-safe rollback action
 */
type RollbackAction = () => Promise<void>;

export class TransactionManager {
  private readonly activeTransactions = new Map<string, TransactionContext>();

  private static transactionCounter = 0;

  constructor(private readonly db: DatabaseConnection) {}

  /**
   * Execute a transaction with type-safe operations
   */
  async executeTransaction<T>(
    operations: TransactionCallback<T>,
    options: TransactionOptions = {}
  ): Promise<T> {
    const transactionId = TransactionManager.generateTransactionId();
    const context: TransactionContext = {
      id: transactionId,
      startTime: new Date(),
      operations: [],
      rollbackActions: [],
      metadata: options as Record<string, unknown>,
    };

    this.activeTransactions.set(transactionId, context);

    try {
      logger.info('Starting transaction', { transactionId, options });

      const result = await this.db.transaction(async db => {
        // Set isolation level if specified
        if (options.isolationLevel) {
          await this.setIsolationLevel(db, options.isolationLevel);
        }

        // Set timeout if specified
        if (options.timeout) {
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new BaseServiceError('TRANSACTION_TIMEOUT', 'Transaction timeout'));
            }, options.timeout);
          });

          return Promise.race([operations(context), timeoutPromise]);
        }

        return operations(context);
      });

      // Mark operations as completed
      context.operations.forEach(operation => {
        if (operation.status === 'pending') {
          operation.status = 'completed';
        }
      });

      logger.info('Transaction completed successfully', {
        transactionId,
        duration: Date.now() - context.startTime.getTime(),
        operationsCount: context.operations.length,
      });

      return result;
    } catch (error) {
      const errorMessage = getErrorMessage(error);

      logger.error('Transaction failed', {
        transactionId,
        error: errorMessage,
        operations: context.operations,
      });

      // Mark failed operations
      context.operations.forEach(operation => {
        if (operation.status === 'pending') {
          operation.status = 'failed';
          operation.error = isError(error) ? error : new Error(errorMessage);
        }
      });

      // Execute rollback actions if autoRollback is enabled
      if (options.autoRollback && context.rollbackActions.length > 0) {
        await this.executeRollback(context);
      }

      throw error;
    } finally {
      this.activeTransactions.delete(transactionId);
    }
  }

  /**
   * Execute a transaction with retry logic
   */
  async executeTransactionWithRetry<T>(
    operations: TransactionCallback<T>,
    options: TransactionOptions = {}
  ): Promise<T> {
    const maxAttempts = options.retryAttempts ?? 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const restOptions = { ...options };
        delete restOptions.retryAttempts;
        return await this.executeTransaction(operations, restOptions);
      } catch (error) {
        lastError = error;

        if (!TransactionManager.isRetryableError(error) || attempt === maxAttempts) {
          throw error;
        }

        const delay = Math.min(100 * 2 ** (attempt - 1), 5000);
        logger.info('Retrying transaction', {
          attempt,
          maxAttempts,
          delay,
          error: getErrorMessage(error),
        });

        await new Promise<void>(resolve => {
          setTimeout(resolve, delay);
        });
      }
    }

    throw lastError;
  }

  /**
   * Add an operation to the current transaction context
   */
  addOperation(context: TransactionContext, service: string, method: string): void {
    context.operations.push({
      service,
      method,
      timestamp: new Date(),
      status: 'pending',
    });
  }

  /**
   * Add a rollback action to the current transaction context
   */
  addRollbackAction(context: TransactionContext, action: RollbackAction): void {
    context.rollbackActions.push(action);
  }

  /**
   * Decorator for making methods transactional
   */
  static transactional(options: TransactionOptions = {}) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
      const originalMethod = descriptor.value;

      descriptor.value = async function (...args: any[]) {
        const transactionManager = new TransactionManager(this.db);
        return transactionManager.executeTransaction(
          async _context => originalMethod.apply(this, args),
          options
        );
      };

      return descriptor;
    };
  }

  /**
   * Execute rollback actions in reverse order
   */
  private async executeRollback(context: TransactionContext): Promise<void> {
    logger.info('Executing rollback actions', {
      transactionId: context.id,
      rollbackActionsCount: context.rollbackActions.length,
    });

    for (let i = context.rollbackActions.length - 1; i >= 0; i -= 1) {
      try {
        await context.rollbackActions[i]();
      } catch (error) {
        logger.error('Rollback action failed', {
          transactionId: context.id,
          actionIndex: i,
          error: getErrorMessage(error),
        });
      }
    }
  }

  /**
   * Set the isolation level for the transaction
   */
  private async setIsolationLevel(
    db: any,
    level: TransactionOptions['isolationLevel']
  ): Promise<void> {
    if (!level) return;

    const isolationLevelMap: Record<string, string> = {
      READ_UNCOMMITTED: 'READ UNCOMMITTED',
      READ_COMMITTED: 'READ COMMITTED',
      REPEATABLE_READ: 'REPEATABLE READ',
      SERIALIZABLE: 'SERIALIZABLE',
    };

    const sqlLevel = isolationLevelMap[level];
    if (sqlLevel) {
      await db.exec(`SET TRANSACTION ISOLATION LEVEL ${sqlLevel}`);
    }
  }

  /**
   * Generate a unique transaction ID
   */
  private static generateTransactionId(): string {
    TransactionManager.transactionCounter += 1;
    return `tx_${Date.now()}_${TransactionManager.transactionCounter}`;
  }

  /**
   * Check if an error is retryable
   */
  private static isRetryableError(error: unknown): boolean {
    if (error instanceof DatabaseError) {
      return error.isRetryable();
    }
    return false;
  }

  /**
   * Get the number of active transactions
   */
  getActiveTransactionCount(): number {
    return this.activeTransactions.size;
  }

  /**
   * Get a specific transaction by ID
   */
  getTransaction(transactionId: string): TransactionContext | undefined {
    return this.activeTransactions.get(transactionId);
  }
}

/**
 * Execute a function within a transaction context
 */
export function withTransaction<TService extends { db: DatabaseConnection }, TResult>(
  service: TService,
  operation: (service: TService, context: TransactionContext) => Promise<TResult>,
  options: TransactionOptions = {}
): Promise<TResult> {
  const transactionManager = new TransactionManager(service.db);
  return transactionManager.executeTransaction(
    async context => operation(service, context),
    options
  );
}

/**
 * Execute batch operations within a transaction
 */
export async function batchInTransaction<T, R>(
  db: DatabaseConnection,
  items: T[],
  operation: (item: T, index: number) => Promise<R>,
  options: TransactionOptions & { batchSize?: number } = {}
): Promise<R[]> {
  const { batchSize = 100, ...transactionOptions } = options;
  const transactionManager = new TransactionManager(db);
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await transactionManager.executeTransaction(async () => {
      const batchPromises = batch.map((item, index) => operation(item, i + index));
      return Promise.all(batchPromises);
    }, transactionOptions);
    results.push(...batchResults);
  }

  return results;
}
