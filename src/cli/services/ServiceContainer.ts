/**
 * @fileoverview Enhanced CLI Service Container with lifecycle management and error boundaries
 * @lastmodified 2025-01-28T12:00:00Z
 *
 * Features: Centralized service management, dependency injection, lifecycle management, error boundaries
 * Main APIs: initialize(), getServices(), getService(), shutdown(), reset()
 * Constraints: Singleton pattern, requires database connection, proper error handling
 * Patterns: All services initialized lazily, proper cleanup on shutdown, error boundaries for all operations
 */

import { BoardService } from '@/services/BoardService';
import { TaskService } from '@/services/TaskService';
import { NoteService } from '@/services/NoteService';
import { TagService } from '@/services/TagService';
import { ContextService } from '@/services/ContextService';
import { TaskTemplateService } from '@/services/TaskTemplateService';
import { DependencyVisualizationService } from '@/services/DependencyVisualizationService';
import { dbConnection } from '@/database/connection';
import { logger } from '@/utils/logger';
import type { DatabaseConnection } from '@/database/connection';

/**
 * Service lifecycle state
 */
export enum ServiceLifecycleState {
  UNINITIALIZED = 'uninitialized',
  INITIALIZING = 'initializing',
  READY = 'ready',
  SHUTTING_DOWN = 'shutting_down',
  SHUTDOWN = 'shutdown',
  ERROR = 'error',
}

/**
 * Service health status
 */
export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastChecked: Date;
  errors?: string[];
}

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
 * Enhanced Service Container for CLI commands
 * Manages service lifecycle, provides dependency injection, and implements error boundaries
 */
export class CLIServiceContainer {
  private static instance: CLIServiceContainer | undefined;

  private services: CLIServices | null = null;

  private state: ServiceLifecycleState = ServiceLifecycleState.UNINITIALIZED;

  private readonly db: DatabaseConnection;

  private readonly serviceHealth: Map<string, ServiceHealth> = new Map();

  private shutdownCallbacks: Array<() => Promise<void>> = [];

  private constructor() {
    this.db = dbConnection;
    this.setupErrorBoundaries();
  }

  /**
   * Setup error boundaries for uncaught errors
   */
  private setupErrorBoundaries(): void {
    process.on('uncaughtException', error => {
      logger.error('Uncaught exception in service container', { error });
      this.state = ServiceLifecycleState.ERROR;
    });

    process.on('unhandledRejection', reason => {
      logger.error('Unhandled rejection in service container', { reason });
      this.state = ServiceLifecycleState.ERROR;
    });
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
   * Get current lifecycle state
   */
  public getState(): ServiceLifecycleState {
    return this.state;
  }

  /**
   * Check if services are ready
   */
  public isReady(): boolean {
    return this.state === ServiceLifecycleState.READY && this.services !== null;
  }

  /**
   * Create service with error boundary protection
   */
  private createServiceWithErrorBoundary<T>(serviceName: string, factory: () => T): T {
    try {
      const service = factory();
      this.updateServiceHealth(serviceName, 'healthy');
      return service;
    } catch (error) {
      this.updateServiceHealth(serviceName, 'unhealthy', [`Service creation failed: ${error}`]);
      logger.error(`Failed to create service: ${serviceName}`, { error });
      throw error;
    }
  }

  /**
   * Update service health status
   */
  private updateServiceHealth(
    serviceName: string,
    status: 'healthy' | 'degraded' | 'unhealthy',
    errors?: string[]
  ): void {
    this.serviceHealth.set(serviceName, {
      name: serviceName,
      status,
      lastChecked: new Date(),
      errors,
    });
  }

  /**
   * Initialize all services with proper dependency injection and error handling
   */
  public async initialize(): Promise<void> {
    if (this.state === ServiceLifecycleState.READY && this.services) {
      return; // Already initialized
    }

    if (this.state === ServiceLifecycleState.INITIALIZING) {
      throw new Error('Services are already being initialized');
    }

    if (this.state === ServiceLifecycleState.ERROR) {
      throw new Error('Service container is in error state');
    }

    try {
      this.state = ServiceLifecycleState.INITIALIZING;
      logger.info('Initializing CLI service container...');

      // Ensure database is connected with error boundary
      try {
        await this.db.initialize({ skipSchema: false });
        this.updateServiceHealth('database', 'healthy');
      } catch (error) {
        this.updateServiceHealth('database', 'unhealthy', [
          `Database initialization failed: ${error}`,
        ]);
        throw error;
      }

      // Create core services with error boundaries
      const boardService = this.createServiceWithErrorBoundary(
        'boardService',
        () => new BoardService(this.db)
      );
      const taskService = this.createServiceWithErrorBoundary(
        'taskService',
        () => new TaskService(this.db)
      );
      const noteService = this.createServiceWithErrorBoundary(
        'noteService',
        () => new NoteService(this.db)
      );
      const tagService = this.createServiceWithErrorBoundary(
        'tagService',
        () => new TagService(this.db)
      );

      // Create services with dependencies
      const contextService = this.createServiceWithErrorBoundary(
        'contextService',
        () => new ContextService(this.db, boardService, taskService, noteService, tagService)
      );

      const taskTemplateService = this.createServiceWithErrorBoundary('taskTemplateService', () =>
        TaskTemplateService.getInstance()
      );

      const dependencyVisualizationService = this.createServiceWithErrorBoundary(
        'dependencyVisualizationService',
        () => DependencyVisualizationService.getInstance()
      );

      this.services = {
        boardService,
        taskService,
        noteService,
        tagService,
        contextService,
        taskTemplateService,
        dependencyVisualizationService,
      };

      this.state = ServiceLifecycleState.READY;
      logger.info('CLI service container initialized successfully');
    } catch (error) {
      this.state = ServiceLifecycleState.ERROR;
      logger.error('Failed to initialize CLI service container', { error });
      throw error;
    }
  }

  /**
   * Get all services (ensures initialization)
   */
  public async getServices(): Promise<CLIServices> {
    if (this.state === ServiceLifecycleState.ERROR) {
      throw new Error('Service container is in error state');
    }

    if (this.state === ServiceLifecycleState.SHUTDOWN) {
      throw new Error('Service container has been shut down');
    }

    if (!this.services) {
      await this.initialize();
    }
    return this.services!;
  }

  /**
   * Get a specific service by name with health check
   */
  public async getService<K extends keyof CLIServices>(serviceName: K): Promise<CLIServices[K]> {
    const services = await this.getServices();

    // Check service health
    const health = this.serviceHealth.get(serviceName as string);
    if (health?.status === 'unhealthy') {
      logger.warn(`Service ${serviceName as string} is unhealthy`, { health });
    }

    return services[serviceName];
  }

  /**
   * Register a shutdown callback for cleanup
   */
  public registerShutdownCallback(callback: () => Promise<void>): void {
    this.shutdownCallbacks.push(callback);
  }

  /**
   * Get database connection instance
   */
  public getDatabase(): DatabaseConnection {
    return this.db;
  }

  /**
   * Get service health status
   */
  public getServiceHealth(): Map<string, ServiceHealth> {
    return new Map(this.serviceHealth);
  }

  /**
   * Check overall container health
   */
  public getOverallHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: ServiceHealth[];
  } {
    const services = Array.from(this.serviceHealth.values());
    const unhealthyCount = services.filter(s => s.status === 'unhealthy').length;
    const degradedCount = services.filter(s => s.status === 'degraded').length;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (unhealthyCount > 0) {
      status = 'unhealthy';
    } else if (degradedCount > 0) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    return { status, services };
  }

  /**
   * Graceful shutdown of all services
   */
  public async shutdown(): Promise<void> {
    if (this.state === ServiceLifecycleState.SHUTDOWN) {
      return; // Already shut down
    }

    try {
      this.state = ServiceLifecycleState.SHUTTING_DOWN;
      logger.info('Shutting down CLI service container...');

      // Execute shutdown callbacks
      await Promise.allSettled(this.shutdownCallbacks.map(async callback => callback()));

      // Clear services
      this.services = null;
      this.serviceHealth.clear();
      this.shutdownCallbacks = [];

      this.state = ServiceLifecycleState.SHUTDOWN;
      logger.info('CLI service container shut down successfully');
    } catch (error) {
      this.state = ServiceLifecycleState.ERROR;
      logger.error('Error during service container shutdown', { error });
      throw error;
    }
  }

  /**
   * Reset the container (useful for testing)
   */
  public reset(): void {
    this.services = null;
    this.state = ServiceLifecycleState.UNINITIALIZED;
    this.serviceHealth.clear();
    this.shutdownCallbacks = [];
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

/**
 * Convenience function to check service container health
 */
export function getCLIServiceHealth(): {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: ServiceHealth[];
} {
  const container = CLIServiceContainer.getInstance();
  return container.getOverallHealth();
}

/**
 * Convenience function to gracefully shutdown services
 */
export async function shutdownCLIServices(): Promise<void> {
  const container = CLIServiceContainer.getInstance();
  await container.shutdown();
}
