/**
 * CLI Service Container
 * Provides centralized service management for CLI commands with proper dependency injection
 */

import { BoardService } from '@/services/BoardService';
import { TaskService } from '@/services/TaskService';
import { NoteService } from '@/services/NoteService';
import { TagService } from '@/services/TagService';
import { ContextService } from '@/services/ContextService';
import { TaskTemplateService } from '@/services/TaskTemplateService';
import { DependencyVisualizationService } from '@/services/DependencyVisualizationService';
import { dbConnection } from '@/database/connection';
import type { DatabaseConnection } from '@/database/connection';

/**
 * Collection of all services available to CLI commands
 */
export interface CLIServices {
  boardService: BoardService;
  taskService: TaskService;
  noteService: NoteService;
  tagService: TagService;
  contextService: ContextService;
  taskTemplateService: TaskTemplateService;
  dependencyVisualizationService: DependencyVisualizationService;
}

/**
 * Service Container for CLI commands
 * Manages service lifecycle and provides dependency injection
 */
export class CLIServiceContainer {
  private static instance: CLIServiceContainer;

  private services: CLIServices | null = null;

  private readonly db: DatabaseConnection;

  private constructor() {
    this.db = dbConnection;
  }

  /**
   * Get the singleton instance of the service container
   */
  public static getInstance(): CLIServiceContainer {
    if (!CLIServiceContainer.instance) {
      CLIServiceContainer.instance = new CLIServiceContainer();
    }
    return CLIServiceContainer.instance;
  }

  /**
   * Initialize all services with proper dependency injection
   */
  public async initialize(): Promise<void> {
    if (this.services) {
      return; // Already initialized
    }

    // Ensure database is connected
    await this.db.initialize({ skipSchema: false });

    // Create core services
    const boardService = new BoardService(this.db);
    const taskService = new TaskService(this.db);
    const noteService = new NoteService(this.db);
    const tagService = new TagService(this.db);

    // Create services with dependencies
    const contextService = new ContextService(
      this.db,
      boardService,
      taskService,
      noteService,
      tagService
    );

    const taskTemplateService = TaskTemplateService.getInstance();
    const dependencyVisualizationService = DependencyVisualizationService.getInstance();

    this.services = {
      boardService,
      taskService,
      noteService,
      tagService,
      contextService,
      taskTemplateService,
      dependencyVisualizationService,
    };
  }

  /**
   * Get all services (ensures initialization)
   */
  public async getServices(): Promise<CLIServices> {
    if (!this.services) {
      await this.initialize();
    }
    return this.services!;
  }

  /**
   * Get a specific service by name
   */
  public async getService<K extends keyof CLIServices>(serviceName: K): Promise<CLIServices[K]> {
    const services = await this.getServices();
    return services[serviceName];
  }

  /**
   * Reset the container (useful for testing)
   */
  public reset(): void {
    this.services = null;
  }
}

/**
 * Convenience function to get services in CLI commands
 */
export async function getCLIServices(): Promise<CLIServices> {
  const container = CLIServiceContainer.getInstance();
  return container.getServices();
}

/**
 * Convenience function to get a specific service
 */
export async function getCLIService<K extends keyof CLIServices>(
  serviceName: K
): Promise<CLIServices[K]> {
  const container = CLIServiceContainer.getInstance();
  return container.getService(serviceName);
}
