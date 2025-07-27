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

  private transactionCounter = 0;

  constructor(private readonly db: DatabaseConnection) {}

  /**
   * Execute a transaction with type-safe operations
   */
  async executeTransaction<T>(
    operations: TransactionCallback<T>,
    options: TransactionOptions = {}
  ): Promise<T> {
    const transactionId = this.generateTransactionId();
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
      context.operations.forEach(op => {
        if (op.status === 'pending') {
          op.status = 'completed';
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
      context.operations.forEach(op => {
        if (op.status === 'pending') {
          op.status = 'failed';
          op.error = isError(error) ? error : new Error(errorMessage);
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

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const { retryAttempts, ...restOptions } = options;
        return await this.executeTransaction(operations, restOptions);
      } catch (error) {
        lastError = error;

        if (!this.isRetryableError(error) || attempt === maxAttempts) {
          throw error;
        }

        const delay = Math.min(100 * 2 ** (attempt - 1), 5000);
        logger.info('Retrying transaction', {
          attempt,
          maxAttempts,
          delay,
          error: getErrorMessage(error),
        });

        await new Promise(resolve => setTimeout(resolve, delay));
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
   * Add a rollback action to the current transaction
   */
  addRollbackAction(context: TransactionContext, action: RollbackAction): void {
    context.rollbackActions.push(action);
  }

  /**
   * Create a transaction decorator for service methods
   */
  static transactional(options: TransactionOptions = {}) {
    return function <T extends { db: DatabaseConnection }>(
      target: T,
      propertyKey: string,
      descriptor: PropertyDescriptor
    ): PropertyDescriptor {
      const originalMethod = descriptor.value;

      descriptor.value = async function (this: T, ...args: unknown[]): Promise<unknown> {
        const transactionManager = new TransactionManager(this.db);

        return transactionManager.executeTransactionWithRetry(async context => {
          transactionManager.addOperation(context, target.constructor.name, propertyKey);
          return originalMethod.apply(this, args);
        }, options);
      };

      return descriptor;
    };
  }

  /**
   * Execute all rollback actions
   */
  private async executeRollback(context: TransactionContext): Promise<void> {
    logger.info('Executing rollback actions', {
      transactionId: context.id,
      actionsCount: context.rollbackActions.length,
    });

    const errors: Error[] = [];

    // Execute rollback actions in reverse order
    for (const action of context.rollbackActions.reverse()) {
      try {
        await action();
      } catch (error) {
        const rollbackError = isError(error) ? error : new Error(getErrorMessage(error));
        errors.push(rollbackError);

        logger.error('Rollback action failed', {
          transactionId: context.id,
          error: rollbackError.message,
        });
      }
    }

    if (errors.length > 0) {
      throw new DatabaseError(`Rollback failed with ${errors.length} errors`, {
        errors: errors.map(e => e.message),
      });
    }
  }

  /**
   * Set transaction isolation level
   */
  private async setIsolationLevel(
    db: any,
    level: TransactionOptions['isolationLevel']
  ): Promise<void> {
    const levelMap = {
      READ_UNCOMMITTED: 'READ UNCOMMITTED',
      READ_COMMITTED: 'READ COMMITTED',
      REPEATABLE_READ: 'REPEATABLE READ',
      SERIALIZABLE: 'SERIALIZABLE',
    };

    const sqlLevel = levelMap[level!];
    await db.exec(`PRAGMA read_uncommitted = ${sqlLevel === 'READ UNCOMMITTED' ? 'ON' : 'OFF'}`);
  }

  /**
   * Generate unique transaction ID
   */
  private generateTransactionId(): string {
    return `txn_${Date.now()}_${++this.transactionCounter}`;
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (!isError(error)) return false;

    const retryableMessages = [
      'database is locked',
      'SQLITE_BUSY',
      'deadlock',
      'transaction timeout',
    ];

    const errorMessage = error.message.toLowerCase();
    return retryableMessages.some(msg => errorMessage.includes(msg.toLowerCase()));
  }

  /**
   * Get active transaction count
   */
  getActiveTransactionCount(): number {
    return this.activeTransactions.size;
  }

  /**
   * Get transaction by ID
   */
  getTransaction(transactionId: string): TransactionContext | undefined {
    return this.activeTransactions.get(transactionId);
  }
}

/**
 * Utility function to create a transactional wrapper
 */
export function withTransaction<TService extends { db: DatabaseConnection }, TResult>(
  service: TService,
  operation: (service: TService, context: TransactionContext) => Promise<TResult>,
  options: TransactionOptions = {}
): Promise<TResult> {
  const manager = new TransactionManager(service.db);
  return manager.executeTransaction(context => operation(service, context), options);
}

/**
 * Batch operations within a transaction
 */
export async function batchInTransaction<T, R>(
  db: DatabaseConnection,
  items: T[],
  operation: (item: T, index: number) => Promise<R>,
  options: TransactionOptions & { batchSize?: number } = {}
): Promise<R[]> {
  const { batchSize = 100, ...transactionOptions } = options;
  const manager = new TransactionManager(db);
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    const batchResults = await manager.executeTransaction(async context => {
      const promises = batch.map((item, index) => {
        manager.addOperation(context, 'batch', `item_${i + index}`);
        return operation(item, i + index);
      });

      return Promise.all(promises);
    }, transactionOptions);

    results.push(...batchResults);
  }

  return results;
}

/**
 * Create a savepoint within a transaction
 */
export class Savepoint {
  constructor(
    private readonly name: string,
    private readonly db: any
  ) {}

  async create(): Promise<void> {
    await this.db.exec(`SAVEPOINT ${this.name}`);
  }

  async release(): Promise<void> {
    await this.db.exec(`RELEASE SAVEPOINT ${this.name}`);
  }

  async rollback(): Promise<void> {
    await this.db.exec(`ROLLBACK TO SAVEPOINT ${this.name}`);
  }
}

/**
 * Transaction statistics
 */
export interface TransactionStats {
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  averageDuration: number;
  activeTransactions: number;
}

export class TransactionMonitor {
  private stats: TransactionStats = {
    totalTransactions: 0,
    successfulTransactions: 0,
    failedTransactions: 0,
    averageDuration: 0,
    activeTransactions: 0,
  };

  recordTransaction(success: boolean, duration: number): void {
    this.stats.totalTransactions++;

    if (success) {
      this.stats.successfulTransactions++;
    } else {
      this.stats.failedTransactions++;
    }

    // Update average duration
    const totalDuration =
      this.stats.averageDuration * (this.stats.totalTransactions - 1) + duration;
    this.stats.averageDuration = totalDuration / this.stats.totalTransactions;
  }

  updateActiveCount(count: number): void {
    this.stats.activeTransactions = count;
  }

  getStats(): TransactionStats {
    return { ...this.stats };
  }

  reset(): void {
    this.stats = {
      totalTransactions: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
      averageDuration: 0,
      activeTransactions: 0,
    };
  }
}
