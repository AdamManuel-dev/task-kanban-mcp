import { logger } from '@/utils/logger';
import type { DatabaseConnection } from '@/database/connection';
import { BaseServiceError, DatabaseError } from '@/utils/errors';

export interface TransactionContext {
  id: string;
  startTime: Date;
  operations: TransactionOperation[];
  rollbackActions: (() => Promise<void>)[];
  metadata?: Record<string, any>;
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

export class TransactionManager {
  private readonly activeTransactions = new Map<string, TransactionContext>();

  private transactionCounter = 0;

  constructor(private readonly db: DatabaseConnection) {}

  async executeTransaction<T>(
    operations: (context: TransactionContext) => Promise<T>,
    options: TransactionOptions = {}
  ): Promise<T> {
    const transactionId = this.generateTransactionId();
    const context: TransactionContext = {
      id: transactionId,
      startTime: new Date(),
      operations: [],
      rollbackActions: [],
      metadata: options,
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
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
              reject(new BaseServiceError('TRANSACTION_TIMEOUT', 'Transaction timeout'));
            }, options.timeout);
          });

          return Promise.race([operations(context), timeoutPromise]) as Promise<T>;
        }

        return operations(context);
      });

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
      logger.error('Transaction failed', {
        transactionId,
        error: (error as Error).message,
        operations: context.operations,
      });

      // Mark failed operations
      context.operations.forEach(op => {
        if (op.status === 'pending') {
          op.status = 'failed';
          op.error = error as Error;
        }
      });

      if (options.autoRollback !== false) {
        await this.executeRollbackActions(context);
      }

      throw new DatabaseError(`Transaction ${transactionId} failed: ${(error as Error).message}`, {
        originalError: String(error),
      });
    } finally {
      this.activeTransactions.delete(transactionId);
    }
  }

  addOperation(transactionId: string, service: string, method: string): void {
    const context = this.activeTransactions.get(transactionId);
    if (!context) {
      throw new BaseServiceError('INVALID_TRANSACTION', 'Transaction context not found');
    }

    context.operations.push({
      service,
      method,
      timestamp: new Date(),
      status: 'pending',
    });
  }

  addRollbackAction(transactionId: string, action: () => Promise<void>): void {
    const context = this.activeTransactions.get(transactionId);
    if (!context) {
      throw new BaseServiceError('INVALID_TRANSACTION', 'Transaction context not found');
    }

    context.rollbackActions.push(action);
  }

  async executeRollbackActions(context: TransactionContext): Promise<void> {
    logger.warn('Executing rollback actions', {
      transactionId: context.id,
      actionsCount: context.rollbackActions.length,
    });

    // Execute rollback actions in reverse order
    for (let i = context.rollbackActions.length - 1; i >= 0; i--) {
      const action = context.rollbackActions[i];
      if (!action) continue;
      try {
        await action();
      } catch (error) {
        logger.error('Rollback action failed', {
          transactionId: context.id,
          actionIndex: i,
          error: (error as Error).message,
        });
      }
    }
  }

  getActiveTransactions(): TransactionContext[] {
    return Array.from(this.activeTransactions.values());
  }

  getTransactionContext(transactionId: string): TransactionContext | undefined {
    return this.activeTransactions.get(transactionId);
  }

  private generateTransactionId(): string {
    return `tx_${Date.now()}_${++this.transactionCounter}`;
  }

  private async setIsolationLevel(
    db: any,
    level: NonNullable<TransactionOptions['isolationLevel']>
  ): Promise<void> {
    const sqliteLevel = this.mapIsolationLevel(level);
    if (sqliteLevel) {
      await db.exec(`PRAGMA read_uncommitted = ${sqliteLevel}`);
    }
  }

  private mapIsolationLevel(level: string): string | null {
    switch (level) {
      case 'READ_UNCOMMITTED':
        return '1';
      case 'READ_COMMITTED':
        return '0';
      default:
        // SQLite doesn't support other isolation levels
        return null;
    }
  }
}

export class ServiceTransactionCoordinator {
  private readonly transactionManager: TransactionManager;

  constructor(db: DatabaseConnection) {
    this.transactionManager = new TransactionManager(db);
  }

  async coordinateMultiServiceOperation<T>(
    operations: ServiceOperation[],
    options?: TransactionOptions
  ): Promise<T[]> {
    return this.transactionManager.executeTransaction(async context => {
      const results: T[] = [];

      for (const operation of operations) {
        this.transactionManager.addOperation(
          context.id,
          operation.serviceName,
          operation.methodName
        );

        try {
          const result = await operation.execute();
          results.push(result);

          if (operation.rollbackAction) {
            this.transactionManager.addRollbackAction(context.id, operation.rollbackAction);
          }
        } catch (error) {
          logger.error('Service operation failed in coordinated transaction', {
            transactionId: context.id,
            service: operation.serviceName,
            method: operation.methodName,
            error: (error as Error).message,
          });
          throw error;
        }
      }

      return results;
    }, options);
  }

  async createBoard(
    boardData: any,
    initialTasks: any[] = [],
    initialTags: any[] = []
  ): Promise<{ board: any; tasks: any[]; tags: any[] }> {
    return this.transactionManager.executeTransaction(async _context => {
      const operations: ServiceOperation[] = [];

      // Create board
      operations.push({
        serviceName: 'BoardService',
        methodName: 'createBoard',
        execute: async () =>
          // This would call the actual BoardService method
          ({ id: 'board-1', ...boardData }),
      });

      // Create initial tasks
      for (const taskData of initialTasks) {
        operations.push({
          serviceName: 'TaskService',
          methodName: 'createTask',
          execute: async () => ({ id: `task-${Math.random()}`, ...taskData }),
        });
      }

      // Create initial tags
      for (const tagData of initialTags) {
        operations.push({
          serviceName: 'TagService',
          methodName: 'createTag',
          execute: async () => ({ id: `tag-${Math.random()}`, ...tagData }),
        });
      }

      const results = await this.coordinateMultiServiceOperation(operations);

      return {
        board: results[0],
        tasks: results.slice(1, 1 + initialTasks.length),
        tags: results.slice(1 + initialTasks.length),
      };
    });
  }

  async moveTaskWithDependencies(
    taskId: string,
    newColumnId: string,
    newPosition: number
  ): Promise<{ movedTask: any; updatedDependencies: any[] }> {
    return this.transactionManager.executeTransaction(async _context => {
      const operations: ServiceOperation[] = [];

      // Get task dependencies
      operations.push({
        serviceName: 'TaskService',
        methodName: 'getTaskWithDependencies',
        execute: async () => ({ dependencies: [], dependents: [] }), // Mock
      });

      // Move the task
      operations.push({
        serviceName: 'TaskService',
        methodName: 'updateTask',
        execute: async () => ({ id: taskId, column_id: newColumnId, position: newPosition }),
      });

      // Update dependent tasks if needed
      operations.push({
        serviceName: 'TaskService',
        methodName: 'updateDependentTasks',
        execute: async () => [], // Mock updated dependencies
      });

      const results = await this.coordinateMultiServiceOperation(operations);

      return {
        movedTask: results[1],
        updatedDependencies: results[2] as any[],
      };
    });
  }

  async deleteTaskCascade(taskId: string): Promise<{
    deletedTask: any;
    orphanedSubtasks: any[];
    removedDependencies: any[];
    deletedNotes: any[];
  }> {
    return this.transactionManager.executeTransaction(async _context => {
      const operations: ServiceOperation[] = [];

      // Get task with all relations
      operations.push({
        serviceName: 'TaskService',
        methodName: 'getTaskWithSubtasks',
        execute: async () => ({ id: taskId, subtasks: [] }), // Mock
      });

      // Get task dependencies
      operations.push({
        serviceName: 'TaskService',
        methodName: 'getTaskWithDependencies',
        execute: async () => ({ dependencies: [], dependents: [] }), // Mock
      });

      // Get task notes
      operations.push({
        serviceName: 'NoteService',
        methodName: 'getTaskNotes',
        execute: async () => [], // Mock
      });

      // Delete notes
      operations.push({
        serviceName: 'NoteService',
        methodName: 'deleteTaskNotes',
        execute: async () => [], // Mock deleted notes
      });

      // Remove dependencies
      operations.push({
        serviceName: 'TaskService',
        methodName: 'removeDependencies',
        execute: async () => [], // Mock removed dependencies
      });

      // Handle subtasks (orphan or delete)
      operations.push({
        serviceName: 'TaskService',
        methodName: 'handleOrphanedSubtasks',
        execute: async () => [], // Mock orphaned subtasks
      });

      // Delete the task
      operations.push({
        serviceName: 'TaskService',
        methodName: 'deleteTask',
        execute: async () => ({ id: taskId }), // Mock deleted task
      });

      const results = await this.coordinateMultiServiceOperation(operations);

      return {
        deletedTask: results[6],
        orphanedSubtasks: results[5] as any[],
        removedDependencies: results[4] as any[],
        deletedNotes: results[3] as any[],
      };
    });
  }

  async bulkCreateTasks(
    tasksData: any[],
    options?: { assignTags?: string[]; createDependencies?: boolean }
  ): Promise<{ tasks: any[]; assignedTags: any[]; createdDependencies: any[] }> {
    return this.transactionManager.executeTransaction(async _context => {
      const operations: ServiceOperation[] = [];
      const createdTasks: any[] = [];

      // Create all tasks
      for (const taskData of tasksData) {
        operations.push({
          serviceName: 'TaskService',
          methodName: 'createTask',
          execute: async () => {
            const task = { id: `task-${Math.random()}`, ...taskData };
            createdTasks.push(task);
            return task;
          },
        });
      }

      // Assign tags if specified
      if (options?.assignTags) {
        for (const tagId of options.assignTags) {
          for (const task of createdTasks) {
            operations.push({
              serviceName: 'TagService',
              methodName: 'addTagToTask',
              execute: async () => ({ task_id: task.id, tag_id: tagId }),
            });
          }
        }
      }

      // Create dependencies if specified
      if (options?.createDependencies) {
        // Create sequential dependencies between tasks
        for (let i = 1; i < createdTasks.length; i++) {
          operations.push({
            serviceName: 'TaskService',
            methodName: 'addDependency',
            execute: async () => ({
              task_id: createdTasks[i].id,
              depends_on_task_id: createdTasks[i - 1].id,
            }),
          });
        }
      }

      const results = await this.coordinateMultiServiceOperation(operations);

      const taskResults = results.slice(0, tasksData.length);
      const tagResults = results.slice(tasksData.length, -createdTasks.length + 1);
      const dependencyResults = results.slice(-createdTasks.length + 1);

      return {
        tasks: taskResults,
        assignedTags: tagResults,
        createdDependencies: dependencyResults,
      };
    });
  }

  getTransactionMetrics(): {
    activeTransactions: number;
    totalOperations: number;
    avgOperationsPerTransaction: number;
  } {
    const activeTransactions = this.transactionManager.getActiveTransactions();
    const totalOperations = activeTransactions.reduce((sum, tx) => sum + tx.operations.length, 0);

    return {
      activeTransactions: activeTransactions.length,
      totalOperations,
      avgOperationsPerTransaction:
        activeTransactions.length > 0 ? totalOperations / activeTransactions.length : 0,
    };
  }
}

export interface ServiceOperation {
  serviceName: string;
  methodName: string;
  execute: () => Promise<any>;
  rollbackAction?: () => Promise<void>;
}

export function createTransactionDecorator(coordinator: ServiceTransactionCoordinator) {
  return function transactional(
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const isAlreadyInTransaction = args.some(
        arg => arg && typeof arg === 'object' && arg.transactionId
      );

      if (isAlreadyInTransaction) {
        // Already in a transaction, just execute
        return originalMethod.apply(this, args);
      }

      // Wrap in transaction
      return (coordinator as any).transactionManager.executeTransaction(
        async (context: TransactionContext) => {
          // Add transaction context to args
          const argsWithContext = [...args, { transactionId: context.id }];
          return originalMethod.apply(this, argsWithContext);
        }
      );
    };

    return descriptor;
  };
}

export function createSagaCoordinator(db: DatabaseConnection) {
  return new ServiceTransactionCoordinator(db);
}
