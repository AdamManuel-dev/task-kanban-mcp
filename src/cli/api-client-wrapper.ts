import chalk from 'chalk';

import type { ConfigManager } from './config';
import { ApiClient } from './client';
import { spinner } from './utils/spinner';
import { logger } from '../utils/logger';
import type {
  HealthResponse,
  CreateTaskRequest,
  UpdateTaskRequest,
  CreateBoardRequest,
  UpdateBoardRequest,
  CreateNoteRequest,
  UpdateNoteRequest,
  CreateTagRequest,
  UpdateTagRequest,
  TaskResponse,
  BoardResponse,
  NoteResponse,
  TagResponse,
  AnyApiResponse,
} from './types';

// Helper function to check if response is successful and has data
export function isSuccessResponse<T>(response: AnyApiResponse): response is T & { data: unknown } {
  return 'data' in response && response.data !== undefined;
}

// Helper function to safely extract data from API responses
export function extractApiData<T>(response: AnyApiResponse): T | null {
  if (isSuccessResponse(response)) {
    return response.data as T;
  }
  return null;
}

// Helper function to handle API response with error handling
export function handleApiResponse<T>(response: AnyApiResponse, errorMessage: string): T {
  if (isSuccessResponse(response)) {
    return response.data as T;
  }

  if ('error' in response) {
    const errorDetails =
      typeof response.error === 'string' ? response.error : JSON.stringify(response.error);
    throw new Error(`${String(errorMessage)}: ${String(errorDetails)}`);
  }

  throw new Error(`${String(errorMessage)}: Unknown error`);
}

interface RequestMetadata {
  operationName: string;
  retries?: number;
  timeout?: number;
  showSpinner?: boolean;
  spinnerText?: string;
  successText?: string;
  errorText?: string;
}

interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  retryableErrors?: string[];
}

interface OfflineOptions {
  enabled: boolean;
  fallbackResponse?: unknown;
  queueOperations?: boolean;
}

export interface ApiWrapperOptions {
  spinner?: {
    defaultTimeout: number;
    showByDefault: boolean;
  };
  retry?: RetryOptions;
  timeout?: {
    default: number;
    slow: number;
    fast: number;
  };
  offline?: OfflineOptions;
}

/**
 * Enhanced API client wrapper with spinner integration, retry logic, and enhanced error handling
 */
export class ApiClientWrapper {
  private readonly apiClient: ApiClient;

  private readonly options: ApiWrapperOptions;

  private isOnline: boolean = true;

  private operationQueue: Array<{
    operation: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  }> = [];

  constructor(config: ConfigManager, options: Partial<ApiWrapperOptions> = {}) {
    this.apiClient = new ApiClient(config);

    this.options = {
      spinner: {
        defaultTimeout: 30000,
        showByDefault: true,
        ...options.spinner,
      },
      retry: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffFactor: 2,
        retryableErrors: ['timeout', 'network', 'ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET'],
        ...options.retry,
      },
      timeout: {
        default: 10000,
        slow: 30000,
        fast: 5000,
        ...options.timeout,
      },
      offline: {
        enabled: true,
        queueOperations: true,
        ...options.offline,
      },
    };

    // Monitor online status
    this.setupOfflineDetection();
  }

  /**
   * Enhanced request wrapper with spinner, retry, and timeout handling
   */
  private async executeWithEnhancements<T>(
    operation: () => Promise<T>,
    metadata: RequestMetadata
  ): Promise<T> {
    const {
      operationName,
      retries = this.options.retry!.maxRetries,
      timeout = this.options.timeout!.default,
      showSpinner = this.options.spinner!.showByDefault,
      spinnerText = `Executing ${String(operationName)}...`,
      successText,
      errorText,
    } = metadata;

    // Check offline mode
    if (!this.isOnline && this.options.offline!.enabled) {
      return this.handleOfflineOperation(operationName, metadata);
    }

    if (showSpinner) {
      return spinner.withSpinner(
        spinnerText,
        this.executeWithRetry(operation, retries, operationName),
        {
          successText: successText ?? `${String(operationName)} completed successfully`,
          failText: errorText ?? `Failed to ${String(String(operationName.toLowerCase()))}`,
          timeout,
        }
      );
    }

    return this.executeWithRetry(operation, retries, operationName);
  }

  /**
   * Execute operation with retry logic and exponential backoff
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number,
    operationName: string
  ): Promise<T> {
    let lastError: Error | null = null;
    const { baseDelay, maxDelay, backoffFactor, retryableErrors } = this.options.retry!;

    const attemptOperation = async (attempt: number): Promise<T> => {
      try {
        return await operation();
      } catch (error) {
        const currentError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on final attempt
        if (attempt === maxRetries) {
          throw currentError;
        }

        // Check if error is retryable
        if (!ApiClientWrapper.isRetryableError(currentError, retryableErrors!)) {
          throw currentError;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(baseDelay * backoffFactor ** attempt, maxDelay);

        // Log retry attempt
        logger.warn(
          chalk.yellow(
            `⚠️  ${String(operationName)} failed (attempt ${String(attempt + 1)}/${String(maxRetries + 1)}), retrying in ${String(delay)}ms...`
          )
        );
        logger.debug(chalk.gray(`   Error: ${String(String(currentError.message))}`));

        await ApiClientWrapper.sleep(delay);

        // Recursive call for next attempt
        return attemptOperation(attempt + 1);
      }
    };

    try {
      return await attemptOperation(0);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    // Update online status if we consistently fail
    if (ApiClientWrapper.isNetworkError(lastError)) {
      this.isOnline = false;
    }

    throw lastError;
  }

  /**
   * Check if an error is retryable
   */
  private static isRetryableError(error: Error, retryableErrors: string[]): boolean {
    const errorMessage = error.message.toLowerCase();
    return retryableErrors.some(retryableError =>
      errorMessage.includes(retryableError.toLowerCase())
    );
  }

  /**
   * Check if an error is network-related
   */
  private static isNetworkError(error: Error): boolean {
    const networkErrors = ['network', 'econnrefused', 'enotfound', 'econnreset', 'timeout'];
    return networkErrors.some(networkError => error.message.toLowerCase().includes(networkError));
  }

  /**
   * Handle offline operations
   */
  private async handleOfflineOperation<T>(
    operationName: string,
    _metadata: RequestMetadata
  ): Promise<T> {
    if (
      this.options.offline!.queueOperations &&
      ApiClientWrapper.isModifyingOperation(operationName)
    ) {
      // Queue the operation for when we're back online
      return new Promise<T>((resolve, reject) => {
        this.operationQueue.push({
          operation: () => this.apiClient.request(''),
          resolve: resolve as (value: unknown) => void,
          reject,
        });
        logger.info(
          chalk.yellow(`📱 ${String(operationName)} queued for when connection is restored`)
        );
      });
    }

    if (this.options.offline!.fallbackResponse) {
      logger.info(chalk.yellow(`📱 Using cached data for ${String(operationName)}`));
      return this.options.offline!.fallbackResponse as T;
    }

    throw new Error(`Operation ${String(operationName)} not available offline`);
  }

  /**
   * Check if operation modifies data
   */
  private static isModifyingOperation(operationName: string): boolean {
    const modifyingOperations = ['create', 'update', 'delete', 'move', 'merge'];
    return modifyingOperations.some(op => operationName.toLowerCase().includes(op));
  }

  /**
   * Set up offline detection
   */
  private setupOfflineDetection(): void {
    // Check connection periodically
    setInterval(() => {
      (async (): Promise<void> => {
        try {
          const wasOnline = this.isOnline;
          this.isOnline = await this.apiClient.testConnection();

          if (!wasOnline && this.isOnline) {
            logger.info(chalk.green('🌐 Connection restored!'));
            await this.processQueuedOperations();
          } else if (wasOnline && !this.isOnline) {
            logger.warn(chalk.yellow('📱 Connection lost - entering offline mode'));
          }
        } catch {
          this.isOnline = false;
        }
      })().catch(error => {
        logger.error('Error in offline detection:', error);
      });
    }, 30000); // Check every 30 seconds
  }

  /**
   * Process queued operations when connection is restored
   */
  private async processQueuedOperations(): Promise<void> {
    if (this.operationQueue.length === 0) return;

    logger.info(
      chalk.cyan(`🔄 Processing ${String(String(this.operationQueue.length))} queued operations...`)
    );

    await Promise.allSettled(
      this.operationQueue.map(async ({ operation, resolve, reject }) => {
        try {
          const result = await operation();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      })
    );

    this.operationQueue = [];
    logger.info(chalk.green('✅ All queued operations processed'));
  }

  /**
   * Sleep utility for retry delays
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise<void>(resolve => {
      setTimeout(resolve, ms);
    });
  }

  // Enhanced API methods with spinner integration

  async testConnection(): Promise<boolean> {
    return this.executeWithEnhancements(() => this.apiClient.testConnection(), {
      operationName: 'Test Connection',
      showSpinner: true,
      spinnerText: 'Testing server connection...',
      successText: 'Connection test successful',
      errorText: 'Connection test failed',
      timeout: this.options.timeout!.fast,
    });
  }

  async getHealth(): Promise<HealthResponse> {
    return this.executeWithEnhancements(() => this.apiClient.getHealth(), {
      operationName: 'Get Health Status',
      showSpinner: true,
      spinnerText: 'Checking server health...',
      timeout: this.options.timeout!.fast,
    });
  }

  // Task API methods with enhancements
  async getTasks(params?: Record<string, string>): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.getTasks(params), {
      operationName: 'Fetch Tasks',
      showSpinner: true,
      spinnerText: 'Loading tasks...',
      successText: 'Tasks loaded',
    });
  }

  async getTask(id: string): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.getTask(id), {
      operationName: 'Fetch Task',
      showSpinner: true,
      spinnerText: `Loading task ${String(id)}...`,
      timeout: this.options.timeout!.fast,
    });
  }

  async createTask(task: CreateTaskRequest): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.createTask(task), {
      operationName: 'Create Task',
      showSpinner: true,
      spinnerText: `Creating task: ${String(String(task.title))}`,
      successText: 'Task created successfully',
      errorText: 'Failed to create task',
    });
  }

  async updateTask(id: string, updates: UpdateTaskRequest): Promise<TaskResponse> {
    return this.executeWithEnhancements(() => this.apiClient.updateTask(id, updates), {
      operationName: 'Update Task',
      showSpinner: true,
      spinnerText: `Updating task ${String(id)}...`,
      successText: 'Task updated successfully',
      errorText: 'Failed to update task',
    });
  }

  async deleteTask(id: string): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.deleteTask(id), {
      operationName: 'Delete Task',
      showSpinner: true,
      spinnerText: `Deleting task ${String(id)}...`,
      successText: 'Task deleted successfully',
      errorText: 'Failed to delete task',
    });
  }

  async moveTask(id: string, columnId: string, position?: number): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.moveTask(id, columnId, position), {
      operationName: 'Move Task',
      showSpinner: true,
      spinnerText: `Moving task ${String(id)}...`,
      successText: 'Task moved successfully',
      errorText: 'Failed to move task',
    });
  }

  // Board API methods with enhancements
  async getBoards(): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.getBoards(), {
      operationName: 'Fetch Boards',
      showSpinner: true,
      spinnerText: 'Loading boards...',
      successText: 'Boards loaded',
    });
  }

  async getBoard(id: string): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.getBoard(id), {
      operationName: 'Fetch Board',
      showSpinner: true,
      spinnerText: `Loading board ${String(id)}...`,
    });
  }

  async createBoard(board: CreateBoardRequest): Promise<BoardResponse> {
    return this.executeWithEnhancements(() => this.apiClient.createBoard(board), {
      operationName: 'Create Board',
      showSpinner: true,
      spinnerText: `Creating board: ${String(String(board.name))}`,
      successText: 'Board created successfully',
      errorText: 'Failed to create board',
    });
  }

  async updateBoard(id: string, updates: UpdateBoardRequest): Promise<BoardResponse> {
    return this.executeWithEnhancements(() => this.apiClient.updateBoard(id, updates), {
      operationName: 'Update Board',
      showSpinner: true,
      spinnerText: `Updating board ${String(id)}...`,
      successText: 'Board updated successfully',
      errorText: 'Failed to update board',
    });
  }

  async deleteBoard(id: string): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.deleteBoard(id), {
      operationName: 'Delete Board',
      showSpinner: true,
      spinnerText: `Deleting board ${String(id)}...`,
      successText: 'Board deleted successfully',
      errorText: 'Failed to delete board',
    });
  }

  async getBoardStats(id: string): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.getBoardStats(id), {
      operationName: 'Fetch Board Stats',
      showSpinner: true,
      spinnerText: `Loading board statistics...`,
      timeout: this.options.timeout!.slow,
    });
  }

  // Note API methods with enhancements
  async getNotes(params?: Record<string, string>): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.getNotes(params), {
      operationName: 'Fetch Notes',
      showSpinner: true,
      spinnerText: 'Loading notes...',
    });
  }

  async getNote(id: string): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.getNote(id), {
      operationName: 'Fetch Note',
      showSpinner: true,
      spinnerText: `Loading note ${String(id)}...`,
      timeout: this.options.timeout!.fast,
    });
  }

  async createNote(note: CreateNoteRequest): Promise<NoteResponse> {
    return this.executeWithEnhancements(() => this.apiClient.createNote(note), {
      operationName: 'Create Note',
      showSpinner: true,
      spinnerText: `Creating note: ${String(String(note.content.substring(0, 50)))}${String(String(note.content.length > 50 ? '...' : ''))}`,
      successText: 'Note created successfully',
      errorText: 'Failed to create note',
    });
  }

  async updateNote(id: string, updates: UpdateNoteRequest): Promise<NoteResponse> {
    return this.executeWithEnhancements(() => this.apiClient.updateNote(id, updates), {
      operationName: 'Update Note',
      showSpinner: true,
      spinnerText: `Updating note ${String(id)}...`,
      successText: 'Note updated successfully',
      errorText: 'Failed to update note',
    });
  }

  async deleteNote(id: string): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.deleteNote(id), {
      operationName: 'Delete Note',
      showSpinner: true,
      spinnerText: `Deleting note ${String(id)}...`,
      successText: 'Note deleted successfully',
      errorText: 'Failed to delete note',
    });
  }

  async searchNotes(query: string): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.searchNotes(query), {
      operationName: 'Search Notes',
      showSpinner: true,
      spinnerText: `Searching notes for: ${String(query)}`,
      timeout: this.options.timeout!.slow,
    });
  }

  // Tag API methods with enhancements
  async getTags(): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.getTags(), {
      operationName: 'Fetch Tags',
      showSpinner: true,
      spinnerText: 'Loading tags...',
    });
  }

  async getTag(id: string): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.getTag(id), {
      operationName: 'Fetch Tag',
      showSpinner: true,
      spinnerText: `Loading tag ${String(id)}...`,
      timeout: this.options.timeout!.fast,
    });
  }

  async createTag(tag: CreateTagRequest): Promise<TagResponse> {
    return this.executeWithEnhancements(() => this.apiClient.createTag(tag), {
      operationName: 'Create Tag',
      showSpinner: true,
      spinnerText: `Creating tag: ${String(String(tag.name))}`,
      successText: 'Tag created successfully',
      errorText: 'Failed to create tag',
    });
  }

  async addTagsToTask(taskId: string, tags: string[]): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.addTagsToTask(taskId, tags), {
      operationName: 'Add Tags to Task',
      showSpinner: true,
      spinnerText: `Adding tags to task ${String(taskId)}...`,
      successText: 'Tags added successfully',
      errorText: 'Failed to add tags',
    });
  }

  async removeTagFromTask(taskId: string, tag: string): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.removeTagFromTask(taskId, tag), {
      operationName: 'Remove Tag from Task',
      showSpinner: true,
      spinnerText: `Removing tag from task ${String(taskId)}...`,
      successText: 'Tag removed successfully',
      errorText: 'Failed to remove tag',
    });
  }

  async updateTag(id: string, updates: UpdateTagRequest): Promise<TagResponse> {
    return this.executeWithEnhancements(() => this.apiClient.updateTag(id, updates), {
      operationName: 'Update Tag',
      showSpinner: true,
      spinnerText: `Updating tag ${String(id)}...`,
      successText: 'Tag updated successfully',
      errorText: 'Failed to update tag',
    });
  }

  async deleteTag(id: string): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.deleteTag(id), {
      operationName: 'Delete Tag',
      showSpinner: true,
      spinnerText: `Deleting tag ${String(id)}...`,
      successText: 'Tag deleted successfully',
      errorText: 'Failed to delete tag',
    });
  }

  async searchTags(query: string): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.searchTags(query), {
      operationName: 'Search Tags',
      showSpinner: true,
      spinnerText: `Searching tags for: ${String(query)}`,
    });
  }

  async mergeTags(fromId: string, toId: string): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.mergeTags(fromId, toId), {
      operationName: 'Merge Tags',
      showSpinner: true,
      spinnerText: `Merging tags ${String(fromId)} → ${String(toId)}...`,
      successText: 'Tags merged successfully',
      errorText: 'Failed to merge tags',
      timeout: this.options.timeout!.slow,
    });
  }

  // Priority API methods
  async getPriorities(): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.getPriorities(), {
      operationName: 'Fetch Priorities',
      showSpinner: true,
      spinnerText: 'Loading priorities...',
    });
  }

  async getNextTask(): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.getNextTask(), {
      operationName: 'Get Next Task',
      showSpinner: true,
      spinnerText: 'Finding next task...',
      timeout: this.options.timeout!.fast,
    });
  }

  async recalculatePriorities(): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.recalculatePriorities(), {
      operationName: 'Recalculate Priorities',
      showSpinner: true,
      spinnerText: 'Recalculating task priorities...',
      successText: 'Priorities recalculated successfully',
      errorText: 'Failed to recalculate priorities',
      timeout: this.options.timeout!.slow,
    });
  }

  async updateTaskPriority(id: string, priority: number): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.updateTaskPriority(id, priority), {
      operationName: 'Update Task Priority',
      showSpinner: true,
      spinnerText: `Updating priority for task ${String(id)}...`,
      successText: 'Task priority updated successfully',
      errorText: 'Failed to update task priority',
    });
  }

  // Context API methods
  async getContext(): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.getContext(), {
      operationName: 'Fetch Context',
      showSpinner: true,
      spinnerText: 'Loading context information...',
      timeout: this.options.timeout!.slow,
    });
  }

  async getTaskContext(id: string): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.getTaskContext(id), {
      operationName: 'Fetch Task Context',
      showSpinner: true,
      spinnerText: `Loading context for task ${String(id)}...`,
      timeout: this.options.timeout!.slow,
    });
  }

  async getProjectSummary(): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.getProjectSummary(), {
      operationName: 'Fetch Project Summary',
      showSpinner: true,
      spinnerText: 'Generating project summary...',
      timeout: this.options.timeout!.slow,
    });
  }

  // Search API methods
  async searchTasks(query: string, params?: Record<string, string>): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.searchTasks(query, params), {
      operationName: 'Search Tasks',
      showSpinner: true,
      spinnerText: `Searching tasks for: ${String(query)}`,
      timeout: this.options.timeout!.slow,
    });
  }

  // Backup API methods
  async createBackup(options: {
    name: string;
    compress?: boolean;
    verify?: boolean;
    encrypt?: boolean;
    encryptionKey?: string;
    description?: string;
  }): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.createBackup(options), {
      operationName: 'Create Backup',
      showSpinner: true,
      spinnerText: `Creating backup: ${options.name}`,
      successText: 'Backup created successfully',
      errorText: 'Failed to create backup',
      timeout: this.options.timeout!.slow,
    });
  }

  async getBackups(params?: {
    sort?: string;
    order?: string;
    limit?: string;
  }): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.getBackups(params), {
      operationName: 'Get Backups',
      showSpinner: true,
      spinnerText: 'Loading backups...',
    });
  }

  async getBackup(id: string): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.getBackup(id), {
      operationName: 'Get Backup',
      showSpinner: true,
      spinnerText: `Loading backup ${id}...`,
    });
  }

  async deleteBackup(id: string): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.deleteBackup(id), {
      operationName: 'Delete Backup',
      showSpinner: true,
      spinnerText: `Deleting backup ${id}...`,
      successText: 'Backup deleted successfully',
      errorText: 'Failed to delete backup',
    });
  }

  async restoreBackup(
    id: string,
    options?: {
      verify?: boolean;
      decryptionKey?: string;
    }
  ): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.restoreBackup(id, options), {
      operationName: 'Restore Backup',
      showSpinner: true,
      spinnerText: `Restoring backup ${id}...`,
      successText: 'Backup restored successfully',
      errorText: 'Failed to restore backup',
      timeout: this.options.timeout!.slow,
    });
  }

  async exportBackup(id: string, format?: string): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.exportBackup(id, format), {
      operationName: 'Export Backup',
      showSpinner: true,
      spinnerText: `Exporting backup ${id}...`,
      successText: 'Backup exported successfully',
      errorText: 'Failed to export backup',
    });
  }

  async getBackupSchedules(params?: Record<string, string>): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.getBackupSchedules(params), {
      operationName: 'Get Backup Schedules',
      showSpinner: true,
      spinnerText: 'Loading backup schedules...',
    });
  }

  async createBackupSchedule(schedule: {
    name: string;
    cron: string;
    enabled?: boolean;
    options?: Record<string, unknown>;
  }): Promise<AnyApiResponse> {
    return this.executeWithEnhancements(() => this.apiClient.createBackupSchedule(schedule), {
      operationName: 'Create Backup Schedule',
      showSpinner: true,
      spinnerText: `Creating backup schedule: ${schedule.name}`,
      successText: 'Backup schedule created successfully',
      errorText: 'Failed to create backup schedule',
    });
  }

  /**
   * Get online status
   */
  getOnlineStatus(): boolean {
    return this.isOnline;
  }

  /**
   * Get queued operations count
   */
  getQueuedOperationsCount(): number {
    return this.operationQueue.length;
  }

  /**
   * Update configuration
   */
  updateConfig(): void {
    this.apiClient.updateConfig();
  }

  /**
   * Execute custom operation with all enhancements
   */
  async executeCustomOperation<T>(
    operation: () => Promise<T>,
    metadata: RequestMetadata
  ): Promise<T> {
    return this.executeWithEnhancements(operation, metadata);
  }

  /**
   * Generic request method for custom API endpoints
   */
  async request<T>(
    method: string,
    path: string,
    data?: unknown,
    params?: Record<string, string>
  ): Promise<T> {
    const operation = async (): Promise<T> => {
      const response = await this.apiClient.request(path, {
        method: method as 'GET' | 'POST' | 'PATCH' | 'DELETE',
        body: data,
        params,
      });
      return response as T;
    };

    return this.executeWithEnhancements(operation, {
      operationName: `${method.toUpperCase()} ${path}`,
      showSpinner: true,
      spinnerText: `Making ${method.toUpperCase()} request to ${path}...`,
      successText: `${method.toUpperCase()} request to ${path} completed`,
      errorText: `Failed to make ${method.toUpperCase()} request to ${path}`,
    });
  }

  public getApiClient(): ApiClient {
    return this.apiClient;
  }
}
