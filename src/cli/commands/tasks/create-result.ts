/**
 * @fileoverview Task create command using Result pattern
 * @lastmodified 2025-07-28T16:00:00Z
 *
 * Features: Result pattern for command error handling, no exceptions
 * Main APIs: createTaskWithResult() - demonstates Result usage
 * Constraints: Uses Result<T, E> pattern throughout
 * Patterns: Railway-oriented programming in CLI commands
 */

import type { Command } from 'commander';
import type { CliComponents, CreateTaskRequest as CLICreateTaskRequest } from '../../types';
import type { CreateTaskRequest as ServiceCreateTaskRequest } from '../../../services/TaskService';
import type { CreateTaskOptions } from './types';
import type { Task } from '../../../types';
import { TaskServiceResult } from '../../../services/TaskServiceResult';
import { Ok, Err, isOk, match, andThen, map, createServiceError } from '../../../utils/result';
import type { Result, ServiceResult } from '../../../utils/result';
import { withErrorHandling, ensureBoardId } from '../../utils/command-helpers';
import { createTaskPrompt } from '../../prompts/task-prompts';
import { PRIORITY_MAPPING } from '../../../constants';
import { logger } from '../../../utils/logger';

/**
 * Register the create command with Result pattern
 */
export function registerCreateTaskResultCommand(taskCmd: Command): void {
  const getComponents = (): CliComponents => {
    if (!global.cliComponents) {
      throw new Error('CLI components not initialized. Please initialize the CLI first.');
    }
    return global.cliComponents;
  };

  taskCmd
    .command('create-safe')
    .alias('new-safe')
    .description('Create a new task using Result pattern (no exceptions)')
    .option('-t, --title <title>', 'task title')
    .option('-d, --description <desc>', 'task description')
    .option('-b, --board <id>', 'board ID')
    .option('-c, --column <id>', 'column ID')
    .option('-p, --priority <number>', 'priority (1-10)', '5')
    .option('--due <date>', 'due date (YYYY-MM-DD)')
    .option('--tags <tags>', 'tags (comma-separated)')
    .option('-i, --interactive', 'interactive mode')
    .action(
      withErrorHandling('create task safely', async (options: CreateTaskOptions) => {
        const result = await createTaskWithResult(options);

        match(result, {
          ok: task => {
            const { formatter } = getComponents();
            formatter.success(`Task created successfully: ${task.id}`);
            formatter.output(task, {
              fields: ['id', 'title', 'status', 'priority', 'dueDate'],
              headers: ['ID', 'Title', 'Status', 'Priority', 'Due Date'],
            });
          },
          err: error => {
            const { formatter } = getComponents();
            formatter.error(`Failed to create task: ${error.message}`);
            if (error.details) {
              formatter.info('Details:');
              formatter.output(error.details);
            }
            process.exit(1);
          },
        });
      })
    );
}

/**
 * Create task using Result pattern - demonstrates railway-oriented programming
 */
async function createTaskWithResult(options: CreateTaskOptions): Promise<ServiceResult<Task>> {
  if (!global.cliComponents) {
    return Err(createServiceError('CONFIG_ERROR', 'CLI components not initialized'));
  }
  const { config, services } = global.cliComponents;

  // Initialize task service with Result pattern
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const { CLIServiceContainer } = await import('@/cli/services/ServiceContainer');
  const container = CLIServiceContainer.getInstance();
  const db = container.getDatabase(); // Access the db property properly
  const taskService = new TaskServiceResult(db);

  // Step 1: Gather task data (can fail)
  const taskDataResult = await gatherTaskData(options);
  if (!isOk(taskDataResult)) {
    return taskDataResult;
  }

  // Step 2: Build create request (can fail validation)
  const createRequestResult = buildCreateRequest(taskDataResult.data, config);
  if (!isOk(createRequestResult)) {
    return createRequestResult;
  }

  // Step 3: Create task (data already in correct format)
  const createResult = await taskService.createTaskSafe(createRequestResult.data);
  if (!isOk(createResult)) {
    return createResult;
  }

  // Step 4: Log success and return
  logger.info('Task creation completed successfully', {
    taskId: createResult.data.id,
    title: createResult.data.title,
  });

  return Ok(createResult.data);
}

/**
 * Gather task data from options or interactive prompts
 */
async function gatherTaskData(
  options: CreateTaskOptions
): Promise<ServiceResult<Record<string, unknown>>> {
  try {
    let taskData: Record<string, unknown> = {};

    if (options.interactive || !options.title) {
      // Interactive mode
      const defaults = {
        title: options.title ?? '',
        description: options.description ?? '',
        dueDate: options.due ?? '',
        tags: options.tags ? options.tags.split(',').map(t => t.trim()) : [],
      };

      const promptResult = await createTaskPrompt(defaults);

      taskData = {
        title: promptResult.title,
        description: promptResult.description,
        priority: promptResult.priority,
        size: promptResult.size,
        assignee: promptResult.assignee,
        dueDate: promptResult.dueDate,
        estimatedHours: promptResult.estimatedHours,
        tags: promptResult.tags,
      };

      // Convert priority from P1-P5 to 1-10 scale
      if (promptResult.priority) {
        taskData.priority = PRIORITY_MAPPING[promptResult.priority] || 5;
      }
    } else {
      // Use command line options
      taskData = {
        title: options.title,
        description: options.description,
        priority: parseInt(options.priority ?? '5', 10),
        dueDate: options.due,
        tags: options.tags ? options.tags.split(',').map(t => t.trim()) : [],
      };
    }

    return Ok(taskData);
  } catch (error) {
    return Err(
      createServiceError(
        'TASK_DATA_GATHER_FAILED',
        'Failed to gather task data',
        undefined,
        error instanceof Error ? error : new Error(String(error))
      )
    );
  }
}

/**
 * Build CreateTaskRequest from gathered data
 */
function buildCreateRequest(
  taskData: Record<string, unknown>,
  config: unknown
): ServiceResult<ServiceCreateTaskRequest> {
  try {
    // Validate required fields
    if (!taskData.title || typeof taskData.title !== 'string') {
      return Err(createServiceError('VALIDATION_FAILED', 'Title is required and must be a string'));
    }

    // Get board ID
    const boardId = ensureBoardId(taskData.boardId as string);

    const createRequest: ServiceCreateTaskRequest = {
      title: taskData.title,
      description: (taskData.description as string) || '',
      board_id: boardId,
      column_id: (taskData.columnId as string) || 'default',
      priority: (taskData.priority as number) || 5,
      status: 'todo',
      assignee: (taskData.assignee as string) || undefined,
      due_date: (taskData.dueDate as string) ? new Date(taskData.dueDate as string) : undefined,
      // tags handled separately in service layer
    };

    // Validate priority range
    if (createRequest.priority && (createRequest.priority < 1 || createRequest.priority > 10)) {
      return Err(createServiceError('VALIDATION_FAILED', 'Priority must be between 1 and 10'));
    }

    return Ok(createRequest);
  } catch (error) {
    return Err(
      createServiceError(
        'REQUEST_BUILD_FAILED',
        'Failed to build create request',
        undefined,
        error instanceof Error ? error : new Error(String(error))
      )
    );
  }
}

/**
 * Example of chaining Result operations
 */
async function demonstrateResultChaining(taskId: string): Promise<ServiceResult<string>> {
  if (!global.cliComponents) {
    return Err(createServiceError('CONFIG_ERROR', 'CLI components not initialized'));
  }
  const { services } = global.cliComponents;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const { CLIServiceContainer } = await import('@/cli/services/ServiceContainer');
  const container = CLIServiceContainer.getInstance();
  const db = container.getDatabase(); // Access the db property properly
  const taskService = new TaskServiceResult(db);

  // Chain operations using andThen (flatMap)
  const taskResult = await taskService.getTaskSafe(taskId);
  if (!isOk(taskResult)) {
    return taskResult;
  }

  const updateResult = await taskService.updateTaskSafe(taskResult.data.id, {
    status: 'in_progress',
  });
  if (!isOk(updateResult)) {
    return updateResult;
  }

  return Ok(`Task ${(updateResult.data as Task).title} is now in progress`);
}

/**
 * Example of mapping over Result values
 */
function formatTaskForDisplay(taskResult: ServiceResult<Task>): ServiceResult<string> {
  return map(taskResult, task => `${task.title} (${task.status}) - Priority: ${task.priority}`);
}
