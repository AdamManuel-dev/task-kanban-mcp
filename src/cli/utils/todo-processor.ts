import { readFile, writeFile } from 'fs/promises';
import { Listr } from 'listr2';
import chalk from 'chalk';
import type { TaskGroup } from './task-runner';
import { TaskRunner } from './task-runner';

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
   * Parse TODO.md file and extract tasks
   */
  async parseTodoFile(filePath: string): Promise<Map<string, TodoItem>> {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const todos = new Map<string, TodoItem>();
    let currentPhase = '';

    for (const line of lines) {
      // Detect phase headers
      if (line.startsWith('## Phase')) {
        const phaseMatch = line.match(/## Phase \d+: (.+?) \(/);
        if (phaseMatch) {
          currentPhase = phaseMatch[1] || '';
        }
        continue;
      }

      // Parse TODO items
      const todoMatch = line.match(
        /- \[([ x])\] \*\*TASK-(\d+)\*\*: (.+?) \[([SML]|XL), (P[1-5]), Value: ([SML])\]/
      );
      if (todoMatch) {
        const [, completed, taskId, description, size, priority, value] = todoMatch;
        const id = `TASK-${taskId}`;

        // Look for dependencies in subsequent lines
        const dependencies: string[] = [];
        const lineIndex = lines.indexOf(line);
        if (lineIndex < lines.length - 1) {
          const nextLines = lines.slice(lineIndex + 1, lineIndex + 5);
          for (const nextLine of nextLines) {
            if (nextLine.includes('Dependencies:')) {
              const depMatch = nextLine.match(/Dependencies: (.+)/);
              if (depMatch && depMatch[1] !== 'None') {
                dependencies.push(...depMatch[1].split(', ').map(d => d.trim()));
              }
              break;
            }
          }
        }

        todos.set(id, {
          id,
          text: description,
          completed: completed === 'x',
          priority: priority as TodoItem['priority'],
          size: size as TodoItem['size'],
          value: value as TodoItem['value'],
          dependencies,
          phase: currentPhase || undefined,
        });
      }
    }

    return todos;
  }

  /**
   * Group todos by phase
   */
  private groupByPhase(todos: Map<string, TodoItem>): Map<string, TodoItem[]> {
    const phases = new Map<string, TodoItem[]>();

    for (const todo of todos.values()) {
      const phase = todo.phase || 'Uncategorized';
      if (!phases.has(phase)) {
        phases.set(phase, []);
      }
      const phaseArray = phases.get(phase);
      if (phaseArray) {
        phaseArray.push(todo);
      }
    }

    return phases;
  }

  /**
   * Check if a todo can be executed based on dependencies
   */
  private canExecuteTodo(todo: TodoItem, completedTodos: Set<string>): boolean {
    if (todo.completed) return false;
    if (!todo.dependencies || todo.dependencies.length === 0) return true;
    return todo.dependencies.every(dep => completedTodos.has(dep));
  }

  /**
   * Create execution groups based on dependencies
   */
  private createExecutionGroups(todos: Map<string, TodoItem>): TodoItem[][] {
    const groups: TodoItem[][] = [];
    const completed = new Set<string>(
      Array.from(todos.values())
        .filter(t => t.completed)
        .map(t => t.id)
    );
    const remaining = Array.from(todos.values()).filter(t => !t.completed);

    while (remaining.length > 0) {
      const executable = remaining.filter(t => this.canExecuteTodo(t, completed));

      if (executable.length === 0) {
        console.warn(chalk.yellow('Warning: Some tasks have unresolvable dependencies'));
        break;
      }

      groups.push(executable);
      executable.forEach(t => {
        completed.add(t.id);
        remaining.splice(remaining.indexOf(t), 1);
      });
    }

    return groups;
  }

  /**
   * Process todos with visual feedback
   */
  async processTodos(todoFile: string, options: TodoProcessorOptions = {}): Promise<void> {
    const todos = await this.parseTodoFile(todoFile);

    if (options.groupByPhase) {
      await this.processGroupedByPhase(todos, options);
    } else {
      await this.processWithDependencies(todos, options);
    }

    if (options.generateReport) {
      await this.generateReport(todos, todoFile);
    }
  }

  /**
   * Process todos grouped by phase
   */
  private async processGroupedByPhase(
    todos: Map<string, TodoItem>,
    options: TodoProcessorOptions
  ): Promise<void> {
    const phases = this.groupByPhase(todos);
    const taskGroups: TaskGroup[] = [];

    for (const [phaseName, phaseTodos] of phases) {
      if (!phaseTodos) continue;
      const completedCount = phaseTodos.filter(t => t.completed).length;
      const totalCount = phaseTodos.length;

      taskGroups.push({
        title: `${phaseName} [${completedCount}/${totalCount}]`,
        tasks: phaseTodos
          .filter(t => !t.completed)
          .map(todo => ({
            id: todo.id,
            title: `${todo.id}: ${todo.text}`,
            action: async () => {
              if (!options.dryRun) {
                // Simulate task implementation
                await new Promise(resolve => setTimeout(resolve, 100));
                todo.completed = true;
              }
            },
            skip: () => {
              if (todo.dependencies.length > 0) {
                const unmet = todo.dependencies.filter(dep => !todos.get(dep)?.completed);
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
    const groups = this.createExecutionGroups(todos);

    const listr = new Listr(
      groups.map((group, index) => ({
        title: `Execution Group ${index + 1} (${group.length} tasks)`,
        task: async (_ctx, task) => {
          const subtasks = group.map(todo => ({
            title: `${todo.id}: ${todo.text}`,
            task: async () => {
              if (!options.dryRun) {
                await new Promise(resolve => setTimeout(resolve, 100));
                todo.completed = true;
              }
            },
          }));

          return task.newListr(subtasks, {
            concurrent: options.concurrent ?? true,
            rendererOptions: {
              showSubtasks: true,
            } as any,
          });
        },
      })),
      {
        concurrent: false,
        rendererOptions: {
          showSubtasks: true,
          showTimer: true,
        } as any,
      }
    );

    await listr.run();
  }

  /**
   * Generate implementation report
   */
  private async generateReport(todos: Map<string, TodoItem>, todoFile: string): Promise<void> {
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
- Completed: ${this.calculateTimeEstimate(completed)} minutes
- Remaining: ${this.calculateTimeEstimate(pending)} minutes
`;

    await writeFile(reportPath, report);
    console.log(chalk.green(`\n✅ Report generated: ${reportPath}`));
  }

  /**
   * Calculate time estimate based on task sizes
   */
  private calculateTimeEstimate(todos: TodoItem[]): number {
    const sizeMultipliers = { S: 1, M: 1.4, L: 4, XL: 8 };
    return todos.reduce((total, todo) => total + sizeMultipliers[todo.size], 0);
  }
}

// Export singleton instance
export const todoProcessor = new TodoProcessor();
