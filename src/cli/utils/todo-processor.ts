import { readFile, writeFile } from 'fs/promises';
import { Listr } from 'listr2';
// Removed unused import: chalk
import type { TaskGroup } from './task-runner';
import { TaskRunner } from './task-runner';
import { logger } from '../../utils/logger';

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  priority: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  size: 'S' | 'M' | 'L' | 'XL';
  value: 'S' | 'M' | 'L';
  dependencies: string[];
  owner?: string;
  notes?: string;
  phase?: string;
}

export interface TodoProcessorOptions {
  concurrent?: boolean;
  maxConcurrent?: number;
  groupByPhase?: boolean;
  showDependencies?: boolean;
  generateReport?: boolean;
  dryRun?: boolean;
}

/**
 * Processes TODO items from markdown files with visual feedback
 */
export class TodoProcessor {
  private readonly taskRunner: TaskRunner;

  constructor() {
    this.taskRunner = new TaskRunner({ renderer: 'default' });
  }

  /**
   * Process TODO.md file with the given options
   */
  async process(filePath: string, options: TodoProcessorOptions): Promise<void> {
    const todos = await TodoProcessor.parseTodoFile(filePath);

    if (options.groupByPhase) {
      await this.processGroupedByPhase(todos, options);
    } else {
      await this.processWithDependencies(todos, options);
    }

    if (options.generateReport) {
      await TodoProcessor.generateReport(todos, filePath);
    }
  }

  /**
   * Parse TODO.md file and extract tasks
   */
  static async parseTodoFile(filePath: string): Promise<Map<string, TodoItem>> {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const todos = new Map<string, TodoItem>();
    const currentPhase = '';

    for (const line of lines) {
      const todo = TodoProcessor.parseTodoLine(line, currentPhase);
      if (todo) {
        todos.set(todo.id, todo);
      }
    }

    return todos;
  }

  /**
   * Parse a single TODO line
   */
  private static parseTodoLine(line: string, currentPhase: string): TodoItem | null {
    // Simple TODO line parser - can be enhanced
    const todoMatch = line.match(/^- \[([ x])\] (.+)$/);
    if (!todoMatch) return null;

    const [, completed, text] = todoMatch;
    const id = `todo_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    return {
      id,
      text: text.trim(),
      completed: completed === 'x',
      priority: 'P3',
      size: 'M',
      value: 'M',
      dependencies: [],
      phase: currentPhase,
    };
  }

  /**
   * Group todos by phase
   */
  private static groupByPhase(todos: Map<string, TodoItem>): Map<string, TodoItem[]> {
    const phases = new Map<string, TodoItem[]>();

    for (const todo of todos.values()) {
      const phase = todo.phase ?? 'Unknown';
      if (!phases.has(phase)) {
        phases.set(phase, []);
      }
      phases.get(phase)!.push(todo);
    }

    return phases;
  }

  /**
   * Create execution groups based on dependencies
   */
  private static createExecutionGroups(todos: Map<string, TodoItem>): TodoItem[][] {
    const groups: TodoItem[][] = [];
    const visited = new Set<string>();
    const inProgress = new Set<string>();

    const visit = (todo: TodoItem): void => {
      if (visited.has(todo.id)) return;
      if (inProgress.has(todo.id)) return; // Circular dependency

      inProgress.add(todo.id);

      // Visit dependencies first
      for (const depId of todo.dependencies) {
        const dep = todos.get(depId);
        if (dep) visit(dep);
      }

      inProgress.delete(todo.id);
      visited.add(todo.id);

      // Add to appropriate group
      if (groups.length === 0) groups.push([]);
      groups[groups.length - 1].push(todo);
    };

    for (const todo of todos.values()) {
      if (!visited.has(todo.id)) {
        visit(todo);
      }
    }

    return groups;
  }

  /**
   * Process todos grouped by phase
   */
  private async processGroupedByPhase(
    todos: Map<string, TodoItem>,
    options: TodoProcessorOptions
  ): Promise<void> {
    const phases = TodoProcessor.groupByPhase(todos);
    const taskGroups: TaskGroup[] = [];

    for (const [phaseName, phaseTodos] of phases) {
      if (!phaseTodos) continue;
      const completedCount = phaseTodos.filter((t: TodoItem) => t.completed).length;
      const totalCount = phaseTodos.length;

      taskGroups.push({
        title: `${phaseName} [${completedCount}/${totalCount}]`,
        tasks: phaseTodos
          .filter((t: TodoItem) => !t.completed)
          .map((todo: TodoItem) => ({
            id: todo.id,
            title: `${todo.id}: ${todo.text}`,
            action: async () => {
              if (!options.dryRun) {
                // Simulate task implementation
                await new Promise(resolve => setTimeout(resolve, 100));
                const updatedTodo = { ...todo, completed: true };
                todos.set(todo.id, updatedTodo);
              }
            },
            skip: () => {
              if (todo.dependencies.length > 0) {
                const unmet = todo.dependencies.filter((dep: string) => !todos.get(dep)?.completed);
                if (unmet.length > 0) {
                  return `Waiting for: ${unmet.join(', ')}`;
                }
              }
              return false;
            },
          })),
        concurrent: options.concurrent ?? false,
      });
    }

    await this.taskRunner.runTaskGroups(taskGroups, {
      exitOnError: false,
    });
  }

  /**
   * Process todos with dependency resolution
   */
  private async processWithDependencies(
    todos: Map<string, TodoItem>,
    options: TodoProcessorOptions
  ): Promise<void> {
    const groups = TodoProcessor.createExecutionGroups(todos);

    const listr = new Listr(
      groups.map((group: TodoItem[], index: number) => ({
        title: `Execution Group ${index + 1} (${group.length} tasks)`,
        task: (_ctx: unknown, _task: unknown) => {
          const subtasks = group.map((todo: TodoItem) => ({
            title: `${todo.id}: ${todo.text}`,
            task: async () => {
              if (!options.dryRun) {
                await new Promise(resolve => setTimeout(resolve, 100));
                const updatedTodo = { ...todo, completed: true };
                todos.set(todo.id, updatedTodo);
              }
            },
          }));

          return new Listr(subtasks, {
            concurrent: options.concurrent ?? true,
            rendererOptions: {
              showSubtasks: true,
            },
          });
        },
      })),
      {
        concurrent: false,
        rendererOptions: {
          showSubtasks: true,
        } as unknown,
      }
    );

    await listr.run();
  }

  /**
   * Generate implementation report
   */
  private static async generateReport(
    todos: Map<string, TodoItem>,
    todoFile: string
  ): Promise<void> {
    const reportPath = todoFile.replace('.md', '-report.md');
    const completed = Array.from(todos.values()).filter(t => t.completed);
    const pending = Array.from(todos.values()).filter(t => !t.completed);

    const report = `# TODO Implementation Report

Generated: ${new Date().toISOString()}

## Summary
- Total Tasks: ${todos.size}
- Completed: ${completed.length}
- Pending: ${pending.length}
- Completion Rate: ${((completed.length / todos.size) * 100).toFixed(1)}%

## Completed Tasks
${completed.map(t => `- [x] ${t.id}: ${t.text}`).join('\n')}

## Pending Tasks
${pending.map(t => `- [ ] ${t.id}: ${t.text}`).join('\n')}

## Time Estimates
- Completed: ${TodoProcessor.calculateTimeEstimate(completed)} minutes
- Remaining: ${TodoProcessor.calculateTimeEstimate(pending)} minutes
`;

    await writeFile(reportPath, report);
    logger.info(`Report generated: ${reportPath}`);
  }

  /**
   * Calculate time estimate based on task sizes
   */
  private static calculateTimeEstimate(todos: TodoItem[]): number {
    const sizeMultipliers = { S: 1, M: 1.4, L: 4, XL: 8 };
    return todos.reduce((total, todo) => total + sizeMultipliers[todo.size], 0);
  }
}

// Export singleton instance
export const todoProcessor = new TodoProcessor();
