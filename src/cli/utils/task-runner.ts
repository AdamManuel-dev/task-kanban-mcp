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
    this.renderer = options?.renderer ?? 'default';
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
      logger.error(chalk.red('Task execution failed:'), error);
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
      task: (_ctx, task): any => {
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
      logger.error(chalk.red('Task group execution failed:'), error);
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
    const total = items.length;

    const listr = new Listr(
      [
        {
          title: `${String(title)} (0/${String(total)})`,
          task: async (_ctx, task) => {
            if (options?.concurrent) {
              const concurrency = options.concurrency ?? 5;
              const chunks: T[][] = [];

              for (let i = 0; i < items.length; i += concurrency) {
                chunks.push(items.slice(i, i + concurrency));
              }

              await Promise.all(
                chunks.map(async chunk => {
                  await Promise.all(
                    chunk.map(async item => {
                      await processor(item, task);
                    })
                  );
                })
              );
            } else {
              await Promise.all(
                items.map(async item => {
                  await processor(item, task);
                })
              );
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
      id: `retry-${String(String(Date.now()))}`,
      title,
      action: async () => {
        let lastError: any;

        // eslint-disable-next-line no-await-in-loop
        for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
          try {
            // eslint-disable-next-line no-await-in-loop
            return await action();
          } catch (error) {
            lastError = error;
            if (attempt < maxRetries) {
              // eslint-disable-next-line no-await-in-loop
              await new Promise<void>(resolve => {
                setTimeout(resolve, retryDelay);
              });
            }
          }
        }

        throw new Error(
          `Failed after ${String(maxRetries)} attempts: ${String(String(lastError?.message ?? 'Unknown error'))}`
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
      if (!task.dependencies ?? task.dependencies.length === 0) {
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
          title: `Running ${String(String(ready.length))} task(s)`,
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
