/**
 * Database transaction management utilities
 *
 * @module utils/transactions
 * @description Provides a comprehensive transaction management system for database operations
 * with support for ACID properties, isolation levels, timeout handling, automatic rollback,
 * and retry logic. Ensures data consistency across complex multi-step operations.
 *
 * @example
 * ```typescript
 * // Basic transaction usage
 * const manager = new TransactionManager(db);
 * const result = await manager.executeTransaction(async (context) => {
 *   manager.addOperation(context, 'UserService', 'createUser');
 *   const user = await createUser(data);
 *
 *   manager.addRollbackAction(context, async () => {
 *     await deleteUser(user.id);
 *   });
 *
 *   return user;
 * });
 *
 * // Using the decorator pattern
 * class UserService {
 *   @TransactionManager.transactional({ isolationLevel: 'READ_COMMITTED' })
 *   async transferCredits(fromId: string, toId: string, amount: number) {
 *     // Implementation
 *   }
 * }
 * ```
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, class-methods-use-this, no-await-in-loop, no-restricted-syntax, no-plusplus, @typescript-eslint/require-await */
import { logger } from '@/utils/logger';
import type { DatabaseConnection } from '@/database/connection';
import { BaseServiceError, DatabaseError } from '@/utils/errors';
import { isError, getErrorMessage } from './typeGuards';

/**
 * Transaction context containing state and metadata for a running transaction
 *
 * @interface TransactionContext
 * @property {string} id - Unique transaction identifier
 * @property {Date} startTime - When the transaction started
 * @property {TransactionOperation[]} operations - List of operations performed
 * @property {(() => Promise<void>)[]} rollbackActions - Rollback functions to execute on failure
 * @property {Record<string, unknown>} [metadata] - Optional transaction metadata
 *
 * @example
 * ```typescript
 * const context: TransactionContext = {
 *   id: 'tx_1234567890_1',
 *   startTime: new Date(),
 *   operations: [],
 *   rollbackActions: [],
 *   metadata: { userId: 'user123' }
 * };
 * ```
 */
export interface TransactionContext {
  id: string;
  startTime: Date;
  operations: TransactionOperation[];
  rollbackActions: (() => Promise<void>)[];
  metadata?: Record<string, unknown>;
}

/**
 * Represents a single operation within a transaction
 *
 * @interface TransactionOperation
 * @property {string} service - Service that performed the operation
 * @property {string} method - Method name that was executed
 * @property {Date} timestamp - When the operation was performed
 * @property {'pending' | 'completed' | 'failed'} status - Current operation status
 * @property {Error} [error] - Error if the operation failed
 *
 * @example
 * ```typescript
 * const operation: TransactionOperation = {
 *   service: 'TaskService',
 *   method: 'createTask',
 *   timestamp: new Date(),
 *   status: 'completed'
 * };
 * ```
 */
export interface TransactionOperation {
  service: string;
  method: string;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed';
  error?: Error;
}

/**
 * Configuration options for transaction execution
 *
 * @interface TransactionOptions
 * @property {'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE'} [isolationLevel] - SQL isolation level
 * @property {number} [timeout] - Transaction timeout in milliseconds
 * @property {number} [retryAttempts] - Number of retry attempts for retryable errors
 * @property {boolean} [autoRollback] - Whether to automatically execute rollback actions on failure
 *
 * @example
 * ```typescript
 * const options: TransactionOptions = {
 *   isolationLevel: 'READ_COMMITTED',
 *   timeout: 30000,
 *   retryAttempts: 3,
 *   autoRollback: true
 * };
 * ```
 */
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

/**
 * Manages database transactions with support for ACID properties, rollback, and retry logic
 *
 * @class TransactionManager
 * @description Provides a robust transaction management system that ensures data consistency
 * across complex operations. Supports isolation levels, timeouts, automatic rollback,
 * and retry mechanisms for handling transient failures.
 *
 * @example
 * ```typescript
 * const manager = new TransactionManager(db);
 *
 * // Execute a transaction with automatic rollback
 * const result = await manager.executeTransaction(async (context) => {
 *   const task = await createTask(data);
 *
 *   // Add rollback action
 *   manager.addRollbackAction(context, async () => {
 *     await deleteTask(task.id);
 *   });
 *
 *   return task;
 * }, { autoRollback: true });
 *
 * // Execute with retry logic
 * const resultWithRetry = await manager.executeTransactionWithRetry(
 *   async (context) => { // ... },
 *   { retryAttempts: 3 }
 * );
 * ```
 */
export class TransactionManager {
  /** Map of active transactions by ID */
  private readonly activeTransactions = new Map<string, TransactionContext>();

  /** Counter for generating unique transaction IDs */
  private static transactionCounter = 0;

  /**
   * Creates a new TransactionManager instance
   *
   * @param {DatabaseConnection} db - Database connection to manage transactions for
   */
  constructor(private readonly db: DatabaseConnection) {}

  /**
   * Executes a transaction with type-safe operations and automatic management
   *
   * @template T - Return type of the transaction
   * @param {TransactionCallback<T>} operations - Async function containing transaction operations
   * @param {TransactionOptions} [options={}] - Transaction configuration options
   * @returns {Promise<T>} Result of the transaction operations
   *
   * @throws {BaseServiceError} When transaction times out
   * @throws {Error} When transaction fails or is rolled back
   *
   * @description Executes database operations within a transaction boundary with support for:
   * - Configurable isolation levels
   * - Timeout handling with automatic cancellation
   * - Operation tracking and status management
   * - Automatic rollback on failure (if enabled)
   * - Comprehensive logging and monitoring
   *
   * @example
   * ```typescript
   * const user = await manager.executeTransaction(
   *   async (context) => {
   *     manager.addOperation(context, 'UserService', 'createUser');
   *     const user = await db.insert('users', userData);
   *
   *     manager.addOperation(context, 'UserService', 'createProfile');
   *     await db.insert('profiles', { user_id: user.id });
   *
   *     return user;
   *   },
   *   {
   *     isolationLevel: 'READ_COMMITTED',
   *     timeout: 10000,
   *     autoRollback: true
   *   }
   * );
   * ```
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
   * Executes a transaction with automatic retry logic for transient failures
   *
   * @template T - Return type of the transaction
   * @param {TransactionCallback<T>} operations - Async function containing transaction operations
   * @param {TransactionOptions} [options={}] - Transaction configuration with retry settings
   * @returns {Promise<T>} Result of the successful transaction
   *
   * @throws {Error} Final error after all retry attempts are exhausted
   *
   * @description Wraps executeTransaction with exponential backoff retry logic.
   * Only retries on transient/retryable errors (e.g., deadlocks, temporary unavailability).
   * Non-retryable errors fail immediately.
   *
   * @example
   * ```typescript
   * const result = await manager.executeTransactionWithRetry(
   *   async (context) => {
   *     // Operations that might fail due to deadlock
   *     await updateInventory(items);
   *     await createOrder(orderData);
   *   },
   *   {
   *     retryAttempts: 5,
   *     timeout: 30000
   *   }
   * );
   * ```
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
   * Adds an operation record to the transaction context for tracking
   *
   * @param {TransactionContext} context - Current transaction context
   * @param {string} service - Name of the service performing the operation
   * @param {string} method - Name of the method being executed
   *
   * @description Records operations within a transaction for monitoring, debugging,
   * and audit purposes. Each operation is tracked with a timestamp and initial
   * 'pending' status.
   *
   * @example
   * ```typescript
   * manager.addOperation(context, 'TaskService', 'createTask');
   * const task = await taskService.createTask(data);
   * // Operation status is automatically updated on success/failure
   * ```
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
   * Adds a rollback action to be executed if the transaction fails
   *
   * @param {TransactionContext} context - Current transaction context
   * @param {RollbackAction} action - Async function to execute during rollback
   *
   * @description Registers compensating actions that undo operations performed
   * during the transaction. Rollback actions are executed in reverse order
   * (LIFO) to properly undo nested operations.
   *
   * @example
   * ```typescript
   * // After creating a resource
   * const resource = await createResource(data);
   *
   * // Register cleanup
   * manager.addRollbackAction(context, async () => {
   *   await deleteResource(resource.id);
   * });
   * ```
   */
  addRollbackAction(context: TransactionContext, action: RollbackAction): void {
    context.rollbackActions.push(action);
  }

  /**
   * Decorator for making class methods transactional
   *
   * @static
   * @param {TransactionOptions} [options={}] - Transaction configuration
   * @returns {MethodDecorator} Decorator function
   *
   * @description Wraps a method in a transaction, automatically managing
   * transaction lifecycle. The decorated method must be part of a class
   * that has a 'db' property with a DatabaseConnection.
   *
   * @example
   * ```typescript
   * class OrderService {
   *   constructor(private db: DatabaseConnection) {}
   *
   *   @TransactionManager.transactional({
   *     isolationLevel: 'SERIALIZABLE',
   *     timeout: 30000
   *   })
   *   async processPayment(orderId: string, amount: number) {
   *     await this.debitAccount(amount);
   *     await this.updateOrderStatus(orderId, 'paid');
   *     await this.sendConfirmation(orderId);
   *   }
   * }
   * ```
   */
  static transactional(options: TransactionOptions = {}) {
    return function transactionDecorator(
      _target: any,
      _propertyKey: string,
      descriptor: PropertyDescriptor
    ) {
      const originalMethod = descriptor.value;

      descriptor.value = async function wrappedTransactionMethod(...args: any[]) {
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
   * Executes rollback actions in reverse order (LIFO)
   *
   * @private
   * @param {TransactionContext} context - Transaction context with rollback actions
   * @returns {Promise<void>}
   *
   * @description Executes all registered rollback actions in reverse order to properly
   * undo operations. Continues executing even if individual rollback actions fail,
   * logging any errors for debugging.
   *
   * @example
   * ```typescript
   * // Internally called when transaction fails
   * // Rollback actions execute in reverse order:
   * // 1. Delete profile (last action added)
   * // 2. Delete user (first action added)
   * ```
   */
  private async executeRollback(context: TransactionContext): Promise<void> {
    logger.info('Executing rollback actions', {
      transactionId: context.id,
      rollbackActionsCount: context.rollbackActions.length,
    });

    for (let i = context.rollbackActions.length - 1; i >= 0; i -= 1) {
      try {
        await context.rollbackActions[i]?.();
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
   * Sets the SQL isolation level for the current transaction
   *
   * @private
   * @param {any} db - Database connection or transaction object
   * @param {TransactionOptions['isolationLevel']} level - Desired isolation level
   * @returns {Promise<void>}
   *
   * @description Configures the transaction isolation level to control concurrent
   * access behavior. Higher isolation levels provide more consistency but may
   * reduce performance.
   *
   * Isolation levels:
   * - READ_UNCOMMITTED: Lowest isolation, allows dirty reads
   * - READ_COMMITTED: Prevents dirty reads (default for many databases)
   * - REPEATABLE_READ: Prevents dirty and non-repeatable reads
   * - SERIALIZABLE: Highest isolation, prevents all phenomena
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
   * Generates a unique transaction identifier
   *
   * @private
   * @static
   * @returns {string} Unique transaction ID in format 'tx_<timestamp>_<counter>'
   *
   * @description Creates a unique identifier for tracking transactions using
   * current timestamp and an incrementing counter to ensure uniqueness even
   * for transactions started at the same millisecond.
   *
   * @example
   * ```typescript
   * const id = TransactionManager.generateTransactionId();
   * // Returns: 'tx_1703123456789_42'
   * ```
   */
  private static generateTransactionId(): string {
    TransactionManager.transactionCounter += 1;
    return `tx_${Date.now()}_${TransactionManager.transactionCounter}`;
  }

  /**
   * Determines if an error is retryable based on its type and properties
   *
   * @private
   * @static
   * @param {unknown} error - Error to check
   * @returns {boolean} True if the error is retryable
   *
   * @description Identifies transient errors that may succeed on retry, such as:
   * - Database deadlocks
   * - Temporary connection failures
   * - Lock timeouts
   * - Transient network errors
   *
   * @example
   * ```typescript
   * if (TransactionManager.isRetryableError(error)) {
   *   // Retry the operation
   * } else {
   *   // Fail immediately
   * }
   * ```
   */
  private static isRetryableError(error: unknown): boolean {
    if (error instanceof DatabaseError) {
      return error.context?.metadata?.isRetryable as boolean;
    }
    return false;
  }

  /**
   * Gets the current number of active transactions
   *
   * @returns {number} Count of active transactions
   *
   * @description Returns the number of transactions currently being executed.
   * Useful for monitoring system load and debugging transaction leaks.
   *
   * @example
   * ```typescript
   * const activeCount = manager.getActiveTransactionCount();
   * console.log(`Active transactions: ${activeCount}`);
   * ```
   */
  getActiveTransactionCount(): number {
    return this.activeTransactions.size;
  }

  /**
   * Retrieves a specific transaction context by ID
   *
   * @param {string} transactionId - Transaction ID to look up
   * @returns {TransactionContext | undefined} Transaction context if found
   *
   * @description Gets the context of an active transaction for monitoring
   * or debugging purposes. Returns undefined if the transaction has completed
   * or doesn't exist.
   *
   * @example
   * ```typescript
   * const context = manager.getTransaction('tx_1703123456789_42');
   * if (context) {
   *   console.log(`Transaction started at: ${context.startTime}`);
   *   console.log(`Operations: ${context.operations.length}`);
   * }
   * ```
   */
  getTransaction(transactionId: string): TransactionContext | undefined {
    return this.activeTransactions.get(transactionId);
  }
}

/**
 * Executes a function within a transaction context using a service's database connection
 *
 * @template TService - Service type that contains a db property
 * @template TResult - Return type of the operation
 * @param {TService} service - Service instance with database connection
 * @param {(service: TService, context: TransactionContext) => Promise<TResult>} operation - Operation to execute
 * @param {TransactionOptions} [options={}] - Transaction configuration
 * @returns {Promise<TResult>} Result of the operation
 *
 * @description Utility function that wraps service operations in a transaction,
 * providing both the service instance and transaction context to the operation.
 *
 * @example
 * ```typescript
 * const result = await withTransaction(
 *   taskService,
 *   async (service, context) => {
 *     const task = await service.createTask(data);
 *     manager.addRollbackAction(context, async () => {
 *       await service.deleteTask(task.id);
 *     });
 *     return task;
 *   },
 *   { isolationLevel: 'READ_COMMITTED' }
 * );
 * ```
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
 * Executes batch operations within transactions with configurable batch sizes
 *
 * @template T - Type of items to process
 * @template R - Type of operation results
 * @param {DatabaseConnection} db - Database connection
 * @param {T[]} items - Array of items to process
 * @param {(item: T, index: number) => Promise<R>} operation - Operation to perform on each item
 * @param {TransactionOptions & { batchSize?: number }} [options={}] - Transaction and batch options
 * @returns {Promise<R[]>} Array of operation results
 *
 * @description Processes large datasets in batches within separate transactions to:
 * - Avoid long-running transactions that block other operations
 * - Reduce memory usage for large datasets
 * - Provide better error isolation (only current batch fails)
 * - Enable progress tracking between batches
 *
 * @example
 * ```typescript
 * // Process 1000 users in batches of 100
 * const results = await batchInTransaction(
 *   db,
 *   users,
 *   async (user, index) => {
 *     console.log(`Processing user ${index + 1}/${users.length}`);
 *     return await updateUserStatus(user.id, 'active');
 *   },
 *   {
 *     batchSize: 100,
 *     isolationLevel: 'READ_COMMITTED',
 *     timeout: 60000
 *   }
 * );
 * ```
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
