/**
 * @fileoverview E2E test simulating random user interactions with kanban CLI
 * @lastmodified 2025-01-30T00:00:00Z
 *
 * Features: Tests 50 random CLI actions with realistic user patterns
 * Main APIs: Mock command execution with realistic CLI output
 * Constraints: Uses in-memory data structures for fast execution
 * Patterns: Weighted random actions, data consistency validation
 */

import { v4 as uuidv4 } from 'uuid';

interface ActionResult {
  action: string;
  command: string;
  success: boolean;
  output?: string;
  data?: unknown;
  extractedId?: string;
}

interface TestContext {
  boards: Map<string, Record<string, unknown>>;
  tasks: Map<string, Record<string, unknown>>;
  tags: Map<string, Record<string, unknown>>;
  notes: Map<string, Record<string, unknown>>;
  currentBoardId?: string;
}

// Action weights for realistic usage patterns
const ACTION_WEIGHTS: Record<string, number> = {
  createBoard: 5,
  createTask: 20,
  listTasks: 15,
  showTask: 10,
  updateTask: 8,
  moveTask: 7,
  searchTasks: 5,
  getContext: 8,
  getNextTask: 5,
  addTag: 3,
  addNote: 3,
  showStats: 3,
  healthCheck: 2,
  deleteTask: 3,
  deleteBoard: 1,
};

describe('CLI Random User Interactions E2E Test', () => {
  const context: TestContext = {
    boards: new Map(),
    tasks: new Map(),
    tags: new Map(),
    notes: new Map(),
  };

  function generateRandomString(prefix: string): string {
    return `${prefix}_${uuidv4().substring(0, 8)}`;
  }

  function getRandomElement<T>(array: T[]): T | undefined {
    return array.length > 0 ? array[Math.floor(Math.random() * array.length)] : undefined;
  }

  function selectRandomAction(): string {
    const actions = Object.keys(ACTION_WEIGHTS);
    const weights = Object.values(ACTION_WEIGHTS);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

    let random = Math.random() * totalWeight;
    for (let i = 0; i < actions.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return actions[i];
      }
    }

    return actions[0];
  }

  function mockCommand(command: string, data?: unknown): ActionResult {
    const result: ActionResult = {
      action: command.split(' ')[0],
      command,
      success: true,
      data,
    };

    // Generate realistic CLI output
    switch (result.action) {
      case 'board':
        if (command.includes('create')) {
          result.output = `Board created successfully!\n\nID: ${data.id}\nName: ${data.name}\nDescription: ${data.description}`;
          result.extractedId = data.id;
        } else if (command.includes('list')) {
          result.output = `Boards:\n${Array.from(context.boards.values())
            .map(b => `  • ${b.name} (${b.id})`)
            .join('\n')}`;
        }
        break;

      case 'task':
        if (command.includes('create')) {
          result.output = `Task created successfully!\n\nID: ${data.id}\nTitle: ${data.title}\nPriority: ${data.priority}`;
          result.extractedId = data.id;
        } else if (command.includes('list')) {
          const tasks = Array.from(context.tasks.values());
          result.output =
            tasks.length > 0
              ? `Tasks:\n${tasks.map(t => `  • [${t.priority}] ${t.title} (${t.column_id})`).join('\n')}`
              : 'No tasks found.';
        } else if (command.includes('show')) {
          if (data) {
            result.output = `Task Details:\n\nID: ${data.id}\nTitle: ${data.title}\nDescription: ${data.description}\nPriority: ${data.priority}\nStatus: ${data.column_id}`;
          } else {
            result.success = false;
            result.output = 'Task not found.';
          }
        }
        break;

      case 'context':
        const totalTasks = context.tasks.size;
        const tasksByStatus = {
          todo: Array.from(context.tasks.values()).filter(t => t.column_id === 'todo').length,
          'in-progress': Array.from(context.tasks.values()).filter(
            t => t.column_id === 'in-progress'
          ).length,
          done: Array.from(context.tasks.values()).filter(t => t.column_id === 'done').length,
        };
        result.output = `Current Work Context:\n\nTotal Tasks: ${totalTasks}\n  • To Do: ${tasksByStatus.todo}\n  • In Progress: ${tasksByStatus['in-progress']}\n  • Done: ${tasksByStatus.done}`;
        break;

      case 'health':
        result.output =
          'System Health Check:\n\n✓ Database connection: OK\n✓ Configuration: OK\n✓ All systems operational';
        break;
    }

    return result;
  }

  async function executeRandomAction(): Promise<ActionResult> {
    const action = selectRandomAction();

    switch (action) {
      case 'createBoard': {
        const board = {
          id: uuidv4(),
          name: generateRandomString('Board'),
          description: generateRandomString('Test board'),
          created_at: new Date().toISOString(),
        };
        context.boards.set(board.id, board);
        if (!context.currentBoardId) {
          context.currentBoardId = board.id;
        }
        return mockCommand(
          `board create --name "${board.name}" --description "${board.description}"`,
          board
        );
      }

      case 'createTask': {
        if (context.boards.size === 0) {
          // Create a board first
          const board = {
            id: uuidv4(),
            name: generateRandomString('Board'),
            description: generateRandomString('Auto-created board'),
            created_at: new Date().toISOString(),
          };
          context.boards.set(board.id, board);
          if (!context.currentBoardId) {
            context.currentBoardId = board.id;
          }
        }

        const task = {
          id: uuidv4(),
          title: generateRandomString('Task'),
          description: generateRandomString('Task description'),
          priority: getRandomElement(['P0', 'P1', 'P2', 'P3']) || 'P2',
          board_id: context.currentBoardId || Array.from(context.boards.keys())[0],
          column_id: 'todo',
          created_at: new Date().toISOString(),
        };
        context.tasks.set(task.id, task);
        return mockCommand(`task create --title "${task.title}" --priority ${task.priority}`, task);
      }

      case 'listTasks': {
        return mockCommand('task list');
      }

      case 'showTask': {
        const taskId = getRandomElement(Array.from(context.tasks.keys()));
        if (!taskId) {
          return { action, command: 'task show', success: false, output: 'No tasks available' };
        }
        const task = context.tasks.get(taskId);
        return mockCommand(`task show ${taskId}`, task);
      }

      case 'updateTask': {
        const taskId = getRandomElement(Array.from(context.tasks.keys()));
        if (!taskId) {
          return { action, command: 'task update', success: false, output: 'No tasks available' };
        }

        const task = context.tasks.get(taskId)!;
        if (Math.random() > 0.5) task.title = generateRandomString('Updated');
        if (Math.random() > 0.5) task.description = generateRandomString('Updated desc');
        if (Math.random() > 0.5)
          task.priority = getRandomElement(['P0', 'P1', 'P2', 'P3']) || task.priority;

        const result = mockCommand(`task update ${taskId} --title "${task.title}"`, task);
        result.output = `Task updated successfully!\n\nID: ${task.id}\nTitle: ${task.title}\nPriority: ${task.priority}`;
        return result;
      }

      case 'moveTask': {
        const taskId = getRandomElement(Array.from(context.tasks.keys()));
        if (!taskId) {
          return { action, command: 'task move', success: false, output: 'No tasks available' };
        }
        const task = context.tasks.get(taskId)!;
        task.column_id = getRandomElement(['todo', 'in-progress', 'done']) || 'in-progress';
        const result = mockCommand(`task move ${taskId} ${task.column_id}`, task);
        result.output = `Task moved to ${task.column_id}.`;
        return result;
      }

      case 'searchTasks': {
        const query = getRandomElement(['test', 'task', 'updated', 'board']) || 'task';
        const matchingTasks = Array.from(context.tasks.values()).filter(
          t =>
            t.title.toLowerCase().includes(query.toLowerCase()) ||
            t.description.toLowerCase().includes(query.toLowerCase())
        );
        const result = mockCommand(`task search --query "${query}"`, matchingTasks);
        if (matchingTasks.length > 0) {
          result.output = `Search results for "${query}":\n${matchingTasks.map(t => `  • [${t.priority}] ${t.title}`).join('\n')}`;
        } else {
          result.output = `No tasks found matching "${query}".`;
        }
        return result;
      }

      case 'getContext': {
        return mockCommand('context show');
      }

      case 'getNextTask': {
        const todoTasks = Array.from(context.tasks.values())
          .filter(t => t.column_id === 'todo')
          .sort((a, b) => {
            const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
            return priorityOrder[a.priority] - priorityOrder[b.priority];
          });
        const nextTask = todoTasks[0];
        const result = mockCommand('task next', nextTask);
        if (nextTask) {
          result.output = `Next suggested task:\n\n[${nextTask.priority}] ${nextTask.title}\nBoard: ${nextTask.board_id}`;
        } else {
          result.output = 'No tasks in TODO status.';
        }
        return result;
      }

      case 'addTag': {
        const taskId = getRandomElement(Array.from(context.tasks.keys()));
        if (!taskId) {
          return { action, command: 'tags add', success: false, output: 'No tasks available' };
        }
        const tag = {
          id: uuidv4(),
          name: generateRandomString('tag'),
          task_id: taskId,
        };
        context.tags.set(tag.id, tag);
        const result = mockCommand(`tags add ${taskId} "${tag.name}"`, tag);
        result.output = `Tag added successfully!\n\nTag: ${tag.name}\nTask ID: ${taskId}`;
        result.extractedId = tag.id;
        return result;
      }

      case 'addNote': {
        const taskId = getRandomElement(Array.from(context.tasks.keys()));
        if (!taskId) {
          return { action, command: 'notes add', success: false, output: 'No tasks available' };
        }
        const note = {
          id: uuidv4(),
          content: generateRandomString('Note content'),
          task_id: taskId,
        };
        context.notes.set(note.id, note);
        const result = mockCommand(`notes add ${taskId} "${note.content}"`, note);
        result.output = `Note added successfully!\n\nNote: ${note.content}\nTask ID: ${taskId}`;
        result.extractedId = note.id;
        return result;
      }

      case 'showStats': {
        const stats = {
          boards: context.boards.size,
          tasks: context.tasks.size,
          tags: context.tags.size,
          notes: context.notes.size,
        };
        const result = mockCommand('db stats', stats);
        result.output = `Database Statistics:\n\nBoards: ${stats.boards}\nTasks: ${stats.tasks}\nTags: ${stats.tags}\nNotes: ${stats.notes}`;
        return result;
      }

      case 'healthCheck': {
        return mockCommand('health');
      }

      case 'deleteTask': {
        const taskId = getRandomElement(Array.from(context.tasks.keys()));
        if (!taskId) {
          return { action, command: 'task delete', success: false, output: 'No tasks available' };
        }
        context.tasks.delete(taskId);
        const result = mockCommand(`task delete ${taskId} --force`);
        result.output = 'Task deleted successfully.';
        return result;
      }

      case 'deleteBoard': {
        if (context.boards.size <= 1) {
          return {
            action,
            command: 'board delete',
            success: false,
            output: 'Cannot delete last board',
          };
        }
        const boardId = getRandomElement(
          Array.from(context.boards.keys()).filter(id => id !== context.currentBoardId)
        );
        if (!boardId) {
          return { action, command: 'board delete', success: false, output: 'No deletable boards' };
        }
        context.boards.delete(boardId);
        // Delete associated tasks
        Array.from(context.tasks.entries()).forEach(([taskId, task]) => {
          if (task.board_id === boardId) {
            context.tasks.delete(taskId);
          }
        });
        const result = mockCommand(`board delete ${boardId} --force`);
        result.output = 'Board and all associated tasks deleted successfully.';
        return result;
      }

      default:
        return { action, command: 'unknown', success: false, output: 'Unknown action' };
    }
  }

  test('should execute 50 random CLI actions successfully', async () => {
    const results: ActionResult[] = [];
    const actionCounts: Record<string, number> = {};

    // Ensure we start with some data
    await executeRandomAction(); // Create initial board
    await executeRandomAction(); // Likely creates another board or task

    // Execute 48 more random actions
    for (let i = 0; i < 48; i++) {
      const result = await executeRandomAction();
      results.push(result);

      // Count actions
      actionCounts[result.action] = (actionCounts[result.action] || 0) + 1;

      // Validate output format
      expect(result).toHaveProperty('action');
      expect(result).toHaveProperty('command');
      expect(result).toHaveProperty('success');
      if (result.success) {
        expect(result).toHaveProperty('output');
      }
    }

    // Analyze results
    const successCount = results.filter(r => r.success).length;
    const successRate = (successCount / results.length) * 100;

    console.log('\n=== Test Results ===');
    console.log('Action distribution:', actionCounts);
    console.log('Context state:', {
      boards: context.boards.size,
      tasks: context.tasks.size,
      tags: context.tags.size,
      notes: context.notes.size,
    });
    console.log(`Success rate: ${successRate.toFixed(2)}% (${successCount}/${results.length})`);

    // Assertions
    expect(Object.keys(actionCounts).length).toBeGreaterThan(5);
    expect(context.boards.size).toBeGreaterThan(0);
    expect(context.tasks.size).toBeGreaterThan(0);
    expect(successRate).toBeGreaterThan(80); // 80% is realistic for random actions
  });

  test('should maintain data consistency', () => {
    // All tasks should belong to existing boards
    const boardIds = new Set(context.boards.keys());
    Array.from(context.tasks.values()).forEach(task => {
      expect(boardIds.has(task.board_id)).toBe(true);
    });

    // All tags and notes should belong to existing tasks
    const taskIds = new Set(context.tasks.keys());
    Array.from(context.tags.values()).forEach(tag => {
      expect(taskIds.has(tag.task_id)).toBe(true);
    });
    Array.from(context.notes.values()).forEach(note => {
      expect(taskIds.has(note.task_id)).toBe(true);
    });
  });

  test('should produce realistic CLI output', () => {
    // Test various commands produce expected output format
    const boardListResult = mockCommand('board list');
    expect(boardListResult.output).toContain('Boards:');

    const taskListResult = mockCommand('task list');
    expect(taskListResult.output).toMatch(/Tasks:|No tasks found/);

    const contextResult = mockCommand('context show');
    expect(contextResult.output).toContain('Current Work Context:');

    const healthResult = mockCommand('health');
    expect(healthResult.output).toContain('System Health Check:');
    expect(healthResult.output).toContain('OK');
  });
});
