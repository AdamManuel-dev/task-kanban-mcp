import type { ConfigManager } from './config';
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

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  params?: Record<string, string> | undefined;
  timeout?: number;
}

export class ApiClient {
  private readonly config: ConfigManager;

  private baseUrl: string;

  private apiKey: string | undefined;

  constructor(config: ConfigManager) {
    this.config = config;
    this.baseUrl = config.getServerUrl();
    this.apiKey = config.getApiKey();
  }

  /**
   * Make authenticated API request
   */
  async request<T = AnyApiResponse>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, params, timeout = 10000 } = options;

    // Build URL with query parameters
    const url = new URL(`${String(String(this.baseUrl))}${String(endpoint)}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'mcp-kanban-cli',
    };

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    // Prepare request options
    const requestOptions: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(timeout),
    };

    if (body && ['POST', 'PATCH', 'PUT'].includes(method)) {
      requestOptions.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url.toString(), requestOptions);

      if (!response.ok) {
        await ApiClient.handleErrorResponse(response);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        // Handle both wrapped and unwrapped responses
        if (data && typeof data === 'object' && 'data' in data) {
          const wrappedData = data as { data: T };
          return wrappedData.data;
        }
        return data as T;
      }

      return (await response.text()) as T;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Request timeout');
        }
        if (error.message.includes('fetch')) {
          throw new Error(`Network error: Unable to connect to ${String(String(this.baseUrl))}`);
        }
      }
      throw error;
    }
  }

  /**
   * Handle error responses
   */
  private static async handleErrorResponse(response: Response): Promise<never> {
    const contentType = response.headers.get('content-type');
    let errorMessage = `HTTP ${String(String(response.status))}: ${String(String(response.statusText))}`;

    try {
      if (contentType && contentType.includes('application/json')) {
        const errorData = (await response.json()) as {
          error?: { message: string };
          message?: string;
        };
        if (
          errorData.error &&
          typeof errorData.error === 'object' &&
          'message' in errorData.error
        ) {
          errorMessage = errorData.error.message;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } else {
        const text = await response.text();
        if (text) {
          errorMessage = text;
        }
      }
    } catch {
      // Ignore parsing errors, use default message
    }

    if (response.status === 401) {
      throw new Error('Authentication failed. Check your API key with "kanban config show"');
    }

    if (response.status === 403) {
      throw new Error('Access denied. Check your API key permissions');
    }

    if (response.status === 404) {
      throw new Error('Resource not found');
    }

    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later');
    }

    if (response.status >= 500) {
      throw new Error(`Server error: ${String(errorMessage)}`);
    }

    throw new Error(errorMessage);
  }

  /**
   * Test connection to server
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.request('/api/health');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get server health status
   */
  async getHealth(): Promise<HealthResponse> {
    return this.request('/api/health/detailed');
  }

  // Task API methods
  async getTasks(params?: Record<string, string>): Promise<AnyApiResponse> {
    return this.request('/api/tasks', params ? { params } : {});
  }

  async getTask(id: string): Promise<AnyApiResponse> {
    return this.request(`/api/tasks/${String(id)}`);
  }

  async createTask(task: CreateTaskRequest): Promise<TaskResponse> {
    return this.request('/api/tasks', { method: 'POST', body: task });
  }

  async updateTask(id: string, updates: UpdateTaskRequest): Promise<TaskResponse> {
    return this.request(`/api/tasks/${String(id)}`, { method: 'PATCH', body: updates });
  }

  async deleteTask(id: string): Promise<AnyApiResponse> {
    return this.request(`/api/tasks/${String(id)}`, { method: 'DELETE' });
  }

  async moveTask(id: string, columnId: string, position?: number): Promise<AnyApiResponse> {
    return this.request(`/api/tasks/${String(id)}/move`, {
      method: 'PATCH',
      body: { columnId, position },
    });
  }

  // Board API methods
  async getBoards(): Promise<AnyApiResponse> {
    return this.request('/api/boards');
  }

  async getBoard(id: string): Promise<AnyApiResponse> {
    return this.request(`/api/boards/${String(id)}`);
  }

  async createBoard(board: CreateBoardRequest): Promise<BoardResponse> {
    return this.request('/api/boards', { method: 'POST', body: board });
  }

  async updateBoard(id: string, updates: UpdateBoardRequest): Promise<BoardResponse> {
    return this.request(`/api/boards/${String(id)}`, { method: 'PATCH', body: updates });
  }

  async deleteBoard(id: string): Promise<AnyApiResponse> {
    return this.request(`/api/boards/${String(id)}`, { method: 'DELETE' });
  }

  async getBoardStats(id: string): Promise<AnyApiResponse> {
    return this.request(`/api/boards/${String(id)}/stats`);
  }

  // Note API methods
  async getNotes(params?: Record<string, string>): Promise<AnyApiResponse> {
    return this.request('/api/notes', params ? { params } : {});
  }

  async getNote(id: string): Promise<AnyApiResponse> {
    return this.request(`/api/notes/${String(id)}`);
  }

  async createNote(note: CreateNoteRequest): Promise<NoteResponse> {
    return this.request('/api/notes', { method: 'POST', body: note });
  }

  async updateNote(id: string, updates: UpdateNoteRequest): Promise<NoteResponse> {
    return this.request(`/api/notes/${String(id)}`, { method: 'PATCH', body: updates });
  }

  async deleteNote(id: string): Promise<AnyApiResponse> {
    return this.request(`/api/notes/${String(id)}`, { method: 'DELETE' });
  }

  async searchNotes(query: string): Promise<AnyApiResponse> {
    return this.request('/api/notes/search', { params: { q: query } });
  }

  // Tag API methods
  async getTags(): Promise<AnyApiResponse> {
    return this.request('/api/tags');
  }

  async getTag(id: string): Promise<AnyApiResponse> {
    return this.request(`/api/tags/${String(id)}`);
  }

  async createTag(tag: CreateTagRequest): Promise<TagResponse> {
    return this.request('/api/tags', { method: 'POST', body: tag });
  }

  async addTagsToTask(taskId: string, tags: string[]): Promise<AnyApiResponse> {
    return this.request(`/api/tasks/${String(taskId)}/tags`, {
      method: 'POST',
      body: { tags },
    });
  }

  async removeTagFromTask(taskId: string, tag: string): Promise<AnyApiResponse> {
    return this.request(`/api/tasks/${String(taskId)}/tags/${String(tag)}`, {
      method: 'DELETE',
    });
  }

  async updateTag(id: string, updates: UpdateTagRequest): Promise<TagResponse> {
    return this.request(`/api/tags/${String(id)}`, { method: 'PATCH', body: updates });
  }

  async deleteTag(id: string): Promise<AnyApiResponse> {
    return this.request(`/api/tags/${String(id)}`, { method: 'DELETE' });
  }

  async searchTags(query: string): Promise<AnyApiResponse> {
    return this.request('/api/tags/search', { params: { q: query } });
  }

  async mergeTags(fromId: string, toId: string): Promise<AnyApiResponse> {
    return this.request(`/api/tags/${String(fromId)}/merge`, {
      method: 'POST',
      body: { targetTagId: toId },
    });
  }

  // Priority API methods
  async getPriorities(): Promise<AnyApiResponse> {
    return this.request('/api/priorities');
  }

  async getNextTask(): Promise<AnyApiResponse> {
    return this.request('/api/priorities/next');
  }

  async recalculatePriorities(): Promise<AnyApiResponse> {
    return this.request('/api/priorities/calculate', { method: 'POST' });
  }

  async updateTaskPriority(id: string, priority: number): Promise<AnyApiResponse> {
    return this.request(`/api/tasks/${String(id)}/priority`, {
      method: 'PATCH',
      body: { priority },
    });
  }

  // Context API methods
  async getContext(): Promise<AnyApiResponse> {
    return this.request('/api/context');
  }

  async getTaskContext(id: string): Promise<AnyApiResponse> {
    return this.request(`/api/context/task/${String(id)}`);
  }

  async getProjectSummary(): Promise<AnyApiResponse> {
    return this.request('/api/context/summary');
  }

  // Search API methods
  async searchTasks(query: string, params?: Record<string, string>): Promise<AnyApiResponse> {
    return this.request('/api/search/tasks', {
      params: { q: query, ...params },
    });
  }

  /**
   * Convenience method for GET requests
   */
  async get<T = AnyApiResponse>(
    endpoint: string,
    options?: Omit<RequestOptions, 'method'>
  ): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  /**
   * Convenience method for POST requests
   */
  async post<T = AnyApiResponse>(
    endpoint: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'POST', body });
  }

  /**
   * Update API key and base URL
   */
  updateConfig(): void {
    this.baseUrl = this.config.getServerUrl();
    this.apiKey = this.config.getApiKey() ?? undefined;
  }
}
