import type { ListrTask } from 'listr2';
import { Listr } from 'listr2';
import chalk from 'chalk';

export interface TaskItem {
  id: string;
  title: string;
  action: () => Promise<any>;
  skip?: () => boolean | string;
  enabled?: boolean;
  concurrent?: boolean;
}

export interface TaskGroup {
  title: string;
  tasks: TaskItem[];
  concurrent?: boolean;
}

/**
 * Manages concurrent task execution with visual feedback using Listr
 */
export class TaskRunner {
  private readonly renderer: 'default' | 'simple' | 'verbose';

  constructor(options?: { renderer?: 'default' | 'simple' | 'verbose' }) {
    this.renderer = options?.renderer || 'default';
  }

  /**
   * Run a single group of tasks
   */
  async runTasks(
    _title: string,
    tasks: TaskItem[],
    options?: {
      concurrent?: boolean;
      exitOnError?: boolean;
    }
  ): Promise<void> {
    const listrTasks: ListrTask[] = tasks.map(task => ({
      title: task.title,
      task: task.action,
      ...(task.skip && { skip: task.skip }),
      enabled: task.enabled ?? true,
    }));

    const listr = new Listr(listrTasks, {
      concurrent: options?.concurrent ?? false,
      exitOnError: options?.exitOnError ?? true,
      renderer: this.renderer,
      rendererOptions: {
        showSubtasks: true,
        showTimer: true,
      } as any,
    });

    try {
      await listr.run();
    } catch (error) {
      console.error(chalk.red('Task execution failed:'), error);
      throw error;
    }
  }

  /**
   * Run multiple groups of tasks
   */
  async runTaskGroups(
    groups: TaskGroup[],
    options?: {
      exitOnError?: boolean;
    }
  ): Promise<void> {
    const mainTasks: ListrTask[] = groups.map(group => ({
      title: group.title,
      task: (_ctx, task) => {
        const subtasks: ListrTask[] = group.tasks.map(item => ({
          title: item.title,
          task: item.action,
          ...(item.skip && { skip: item.skip }),
          enabled: item.enabled ?? true,
        }));

        return task.newListr(subtasks, {
          concurrent: group.concurrent ?? false,
          exitOnError: options?.exitOnError ?? true,
        });
      },
    }));

    const listr = new Listr(mainTasks, {
      concurrent: false,
      exitOnError: options?.exitOnError ?? true,
      renderer: this.renderer,
      rendererOptions: {
        showSubtasks: true,
        showTimer: true,
      } as any,
    });

    try {
      await listr.run();
    } catch (error) {
      console.error(chalk.red('Task group execution failed:'), error);
      throw error;
    }
  }

  /**
   * Run tasks with progress tracking
   */
  async runWithProgress<T>(
    title: string,
    items: T[],
    processor: (item: T, task: any) => Promise<void>,
    options?: {
      concurrent?: boolean;
      concurrency?: number;
    }
  ): Promise<void> {
    let completed = 0;
    const total = items.length;

    const listr = new Listr(
      [
        {
          title: `${title} (0/${total})`,
          task: async (_ctx, task) => {
            const updateProgress = () => {
              completed++;
              task.title = `${title} (${completed}/${total})`;
            };

            if (options?.concurrent) {
              const concurrency = options.concurrency || 5;
              const chunks: T[][] = [];

              for (let i = 0; i < items.length; i += concurrency) {
                chunks.push(items.slice(i, i + concurrency));
              }

              for (const chunk of chunks) {
                await Promise.all(
                  chunk.map(async item => {
                    await processor(item, task);
                    updateProgress();
                  })
                );
              }
            } else {
              for (const item of items) {
                await processor(item, task);
                updateProgress();
              }
            }
          },
        },
      ],
      {
        renderer: this.renderer,
        rendererOptions: {
          showSubtasks: true,
          showTimer: true,
        } as any,
      }
    );

    await listr.run();
  }

  /**
   * Create a task with retry logic
   */
  createRetryTask(
    title: string,
    action: () => Promise<any>,
    options?: {
      retries?: number;
      retryDelay?: number;
    }
  ): TaskItem {
    const maxRetries = options?.retries ?? 3;
    const retryDelay = options?.retryDelay ?? 1000;

    return {
      id: `retry-${Date.now()}`,
      title,
      action: async () => {
        let lastError: any;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            return await action();
          } catch (error) {
            lastError = error;
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
          }
        }

        throw new Error(
          `Failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
        );
      },
    };
  }

  /**
   * Run tasks with dependency resolution
   */
  async runWithDependencies(tasks: Array<TaskItem & { dependencies?: string[] }>): Promise<void> {
    const completed = new Set<string>();
    const running = new Set<string>();

    const canRun = (task: (typeof tasks)[0]): boolean => {
      if (!task.dependencies || task.dependencies.length === 0) {
        return true;
      }
      return task.dependencies.every(dep => completed.has(dep));
    };

    const runTask = async (task: (typeof tasks)[0]): Promise<void> => {
      running.add(task.id);
      try {
        await task.action();
        completed.add(task.id);
      } finally {
        running.delete(task.id);
      }
    };

    // Group tasks by whether they can run
    const groups: TaskGroup[] = [];
    const remaining = [...tasks];

    while (remaining.length > 0) {
      const ready = remaining.filter(t => canRun(t) && !completed.has(t.id));

      if (ready.length === 0 && remaining.length > 0) {
        throw new Error('Circular dependency detected or unresolvable dependencies');
      }

      if (ready.length > 0) {
        groups.push({
          title: `Running ${ready.length} task(s)`,
          tasks: ready.map(t => ({
            ...t,
            action: () => runTask(t),
          })),
          concurrent: true,
        });

        // Remove ready tasks from remaining
        remaining.splice(0, remaining.length, ...remaining.filter(t => !ready.includes(t)));
      }
    }

    await this.runTaskGroups(groups);
  }
}

// Export singleton instance
export const taskRunner = new TaskRunner();
