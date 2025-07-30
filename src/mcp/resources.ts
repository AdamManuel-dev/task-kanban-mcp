import type { Resource } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '@/utils/logger';
import type { MCPServices } from './tools';

export interface ResourceContent {
  text: string;
  mimeType?: string;
}

interface ParsedUri {
  type: string;
  action?: string;
  id: string;
  params?: Record<string, string>;
}

export class MCPResourceRegistry {
  private readonly services: MCPServices;

  constructor(services: MCPServices) {
    this.services = services;
  }

  async listResources(): Promise<Resource[]> {
    return Promise.resolve([
      {
        uri: 'kanban://boards',
        name: 'All Boards',
        description: 'List of all kanban boards with their metadata',
        mimeType: 'application/json',
      },
      {
        uri: 'kanban://boards/{board_id}',
        name: 'Board Details',
        description: 'Detailed information about a specific board including columns and tasks',
        mimeType: 'application/json',
      },
      {
        uri: 'kanban://boards/{board_id}/tasks',
        name: 'Board Tasks',
        description: 'All tasks within a specific board',
        mimeType: 'application/json',
      },
      {
        uri: 'kanban://tasks',
        name: 'All Tasks',
        description: 'List of all tasks across all boards',
        mimeType: 'application/json',
      },
      {
        uri: 'kanban://tasks/{task_id}',
        name: 'Task Details',
        description:
          'Detailed information about a specific task including subtasks, dependencies, notes, and tags',
        mimeType: 'application/json',
      },
      {
        uri: 'kanban://tasks/blocked',
        name: 'Blocked Tasks',
        description: 'All tasks that are currently blocked',
        mimeType: 'application/json',
      },
      {
        uri: 'kanban://tasks/overdue',
        name: 'Overdue Tasks',
        description: 'All tasks that are past their due date',
        mimeType: 'application/json',
      },
      {
        uri: 'kanban://tasks/priority/{level}',
        name: 'Tasks by Priority',
        description: 'Tasks filtered by priority level (1-5)',
        mimeType: 'application/json',
      },
      {
        uri: 'kanban://notes',
        name: 'All Notes',
        description: 'All notes across all tasks',
        mimeType: 'application/json',
      },
      {
        uri: 'kanban://notes/search?q={query}',
        name: 'Search Notes',
        description: 'Full-text search results for notes',
        mimeType: 'application/json',
      },
      {
        uri: 'kanban://tags',
        name: 'All Tags',
        description: 'List of all tags with usage statistics',
        mimeType: 'application/json',
      },
      {
        uri: 'kanban://tags/hierarchy',
        name: 'Tag Hierarchy',
        description: 'Hierarchical structure of all tags',
        mimeType: 'application/json',
      },
      {
        uri: 'kanban://analytics/boards/{board_id}',
        name: 'Board Analytics',
        description: 'Performance analytics and insights for a specific board',
        mimeType: 'application/json',
      },
      {
        uri: 'kanban://context/project/{board_id}',
        name: 'Project Context',
        description: 'AI-optimized context for a project/board',
        mimeType: 'text/plain',
      },
      {
        uri: 'kanban://context/task/{task_id}',
        name: 'Task Context',
        description: 'AI-optimized context for a specific task',
        mimeType: 'text/plain',
      },
      {
        uri: 'kanban://reports/summary',
        name: 'System Summary',
        description: 'Overall system summary with key metrics and recent activity',
        mimeType: 'application/json',
      },
      {
        uri: 'kanban://reports/workload',
        name: 'Workload Report',
        description: 'Current workload distribution across users and boards',
        mimeType: 'application/json',
      },
      {
        uri: 'kanban://exports/board/{board_id}',
        name: 'Board Export',
        description: 'Complete board data export including all tasks, notes, and metadata',
        mimeType: 'application/json',
      },
    ]);
  }

  async readResource(uri: string): Promise<ResourceContent> {
    logger.info('MCP resource read', { uri });

    try {
      const parsedUri = MCPResourceRegistry.parseUri(uri);

      switch (parsedUri.type) {
        case 'boards':
          return await this.readBoards(parsedUri);
        case 'tasks':
          return await this.readTasks(parsedUri);
        case 'notes':
          return await this.readNotes(parsedUri);
        case 'tags':
          return await this.readTags(parsedUri);
        case 'analytics':
          return await this.readAnalytics(parsedUri);
        case 'context':
          return await this.readContext(parsedUri);
        case 'reports':
          return await this.readReports(parsedUri);
        case 'exports':
          return await this.readExports(parsedUri);
        default:
          throw new Error(`Unknown resource type: ${String(String(parsedUri.type))}`);
      }
    } catch (error) {
      logger.error('Resource read error', { uri, error });
      throw error;
    }
  }

  private static parseUri(uri: string): ParsedUri {
    const url = new URL(uri);
    const pathParts = url.pathname.split('/').filter(Boolean);

    const [type, action, id] = pathParts;
    const params: Record<string, string> = {};

    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    const result: { type: string; action?: string; id: string; params?: Record<string, string> } = {
      type: type ?? '',
      id: id ?? '',
      params,
    };

    if (action) {
      result.action = action;
    }

    return result;
  }

  // Resource readers
  private async readBoards(parsedUri: ParsedUri): Promise<ResourceContent> {
    if (parsedUri.id) {
      // Specific board
      const board = await this.services.boardService.getBoardWithColumns(parsedUri.id);
      if (!board) {
        throw new Error(`Board not found: ${String(String(parsedUri.id))}`);
      }

      if (parsedUri.action === 'tasks') {
        // Board tasks
        const tasks = await this.services.taskService.getTasks({
          board_id: parsedUri.id,
          limit: 1000,
        });

        return {
          text: JSON.stringify(
            {
              board_id: parsedUri.id,
              board_name: board.name,
              tasks,
              count: tasks.length,
            },
            null,
            2
          ),
          mimeType: 'application/json',
        };
      }
      // Board details
      const tasks = await this.services.taskService.getTasks({
        board_id: parsedUri.id,
        limit: 100,
      });

      return {
        text: JSON.stringify(
          {
            ...board,
            tasks: tasks.slice(0, 10), // Include only first 10 tasks for overview
            task_count: tasks.length,
          },
          null,
          2
        ),
        mimeType: 'application/json',
      };
    }
    // All boards
    const boards = await this.services.boardService.getBoards({ limit: 100 });

    return {
      text: JSON.stringify(
        {
          boards,
          count: boards.length,
        },
        null,
        2
      ),
      mimeType: 'application/json',
    };
  }

  private async readTasks(parsedUri: ParsedUri): Promise<ResourceContent> {
    if (parsedUri.id) {
      // Specific task
      const task = await this.services.taskService.getTaskWithSubtasks(parsedUri.id);
      if (!task) {
        throw new Error(`Task not found: ${String(String(parsedUri.id))}`);
      }

      // Get additional data
      const notes = await this.services.noteService.getTaskNotes(parsedUri.id, { limit: 50 });
      const tags = await this.services.tagService.getTaskTags(parsedUri.id);

      return {
        text: JSON.stringify(
          {
            ...task,
            notes,
            tags,
          },
          null,
          2
        ),
        mimeType: 'application/json',
      };
    }
    if (parsedUri.action) {
      // Task collections
      switch (parsedUri.action) {
        case 'blocked':
          const blockedTasks = await this.services.taskService.getBlockedTasks();
          return {
            text: JSON.stringify(
              {
                type: 'blocked_tasks',
                tasks: blockedTasks,
                count: blockedTasks.length,
              },
              null,
              2
            ),
            mimeType: 'application/json',
          };

        case 'overdue':
          const overdueTasks = await this.services.taskService.getOverdueTasks();
          return {
            text: JSON.stringify(
              {
                type: 'overdue_tasks',
                tasks: overdueTasks,
                count: overdueTasks.length,
              },
              null,
              2
            ),
            mimeType: 'application/json',
          };

        case 'priority':
          if (!parsedUri.id) {
            throw new Error('Priority level required');
          }
          const priority = parseInt(parsedUri.id, 10);
          const priorityTasks = await this.services.taskService.getTasks({
            priority_min: priority,
            priority_max: priority,
            limit: 200,
          });
          return {
            text: JSON.stringify(
              {
                type: 'priority_tasks',
                priority_level: priority,
                tasks: priorityTasks,
                count: priorityTasks.length,
              },
              null,
              2
            ),
            mimeType: 'application/json',
          };

        default:
          throw new Error(`Unknown task action: ${String(String(parsedUri.action))}`);
      }
    } else {
      // All tasks
      const tasks = await this.services.taskService.getTasks({ limit: 500 });

      return {
        text: JSON.stringify(
          {
            tasks,
            count: tasks.length,
          },
          null,
          2
        ),
        mimeType: 'application/json',
      };
    }
  }

  private async readNotes(parsedUri: ParsedUri): Promise<ResourceContent> {
    if (parsedUri.action === 'search') {
      const query = parsedUri.params?.q;
      if (!query) {
        throw new Error('Search query required');
      }

      const notes = await this.services.noteService.searchNotes({ query, limit: 100 });

      return {
        text: JSON.stringify(
          {
            type: 'search_results',
            query,
            notes,
            count: notes.length,
          },
          null,
          2
        ),
        mimeType: 'application/json',
      };
    }
    // All notes
    const notes = await this.services.noteService.getNotes({ limit: 500 });

    return {
      text: JSON.stringify(
        {
          notes,
          count: notes.length,
        },
        null,
        2
      ),
      mimeType: 'application/json',
    };
  }

  private async readTags(parsedUri: ParsedUri): Promise<ResourceContent> {
    if (parsedUri.action === 'hierarchy') {
      const tagTree = await this.services.tagService.getTagHierarchy();

      return {
        text: JSON.stringify(
          {
            type: 'tag_hierarchy',
            tree: tagTree,
          },
          null,
          2
        ),
        mimeType: 'application/json',
      };
    }
    // All tags
    const tags = await this.services.tagService.getTags({
      limit: 200,
    });

    return {
      text: JSON.stringify(
        {
          tags,
          count: tags.length,
        },
        null,
        2
      ),
      mimeType: 'application/json',
    };
  }

  private async readAnalytics(parsedUri: ParsedUri): Promise<ResourceContent> {
    if (parsedUri.action === 'boards' && parsedUri.id) {
      const analytics = await this.services.boardService.getBoardWithStats(parsedUri.id);

      return {
        text: JSON.stringify(analytics, null, 2),
        mimeType: 'application/json',
      };
    }
    throw new Error('Board ID required for analytics');
  }

  private async readContext(parsedUri: ParsedUri): Promise<ResourceContent> {
    if (parsedUri.action === 'project' && parsedUri.id) {
      const context = await this.services.contextService.getProjectContext({
        include_completed: false,
        days_back: 30,
        max_items: 100,
        include_metrics: true,
        detail_level: 'detailed',
      });

      return {
        text: JSON.stringify(context, null, 2),
        mimeType: 'application/json',
      };
    }
    if (parsedUri.action === 'task' && parsedUri.id) {
      const context = await this.services.contextService.getTaskContext(parsedUri.id, {
        include_completed: true,
        days_back: 30,
        max_items: 100,
        include_metrics: true,
        detail_level: 'detailed',
      });

      return {
        text: JSON.stringify(context, null, 2),
        mimeType: 'application/json',
      };
    }
    throw new Error('Invalid context resource URI');
  }

  private async readReports(parsedUri: ParsedUri): Promise<ResourceContent> {
    switch (parsedUri.action) {
      case 'summary':
        const summary = await this.services.contextService.getProjectContext({
          include_completed: true,
          days_back: 7,
          max_items: 50,
          include_metrics: true,
          detail_level: 'summary',
        });

        return {
          text: JSON.stringify(summary, null, 2),
          mimeType: 'application/json',
        };

      case 'workload':
        // Get all tasks grouped by assignee
        const allTasks = await this.services.taskService.getTasks({ limit: 1000 });
        interface WorkloadStats {
          assignee: string;
          total_tasks: number;
          todo: number;
          in_progress: number;
          done: number;
          blocked: number;
          overdue: number;
          high_priority: number;
          [key: string]: string | number; // Allow dynamic status keys
        }
        const workloadMap: Record<string, WorkloadStats> = {};

        allTasks.forEach(task => {
          const assignee = task.assignee ?? 'unassigned';
          if (!workloadMap[assignee]) {
            workloadMap[assignee] = {
              assignee,
              total_tasks: 0,
              todo: 0,
              in_progress: 0,
              done: 0,
              blocked: 0,
              overdue: 0,
              high_priority: 0,
            };
          }

          const stats = workloadMap[assignee];
          stats.total_tasks++;
          if (task.status in stats) {
            (stats as unknown)[task.status]++;
          }

          if (task.priority >= 4) {
            workloadMap[assignee].high_priority++;
          }

          if (task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done') {
            workloadMap[assignee].overdue++;
          }
        });

        return {
          text: JSON.stringify(
            {
              type: 'workload_report',
              workload: Object.values(workloadMap),
              generated_at: new Date().toISOString(),
            },
            null,
            2
          ),
          mimeType: 'application/json',
        };

      default:
        throw new Error(`Unknown report type: ${String(String(parsedUri.action))}`);
    }
  }

  private async readExports(parsedUri: ParsedUri): Promise<ResourceContent> {
    if (parsedUri.action === 'board' && parsedUri.id) {
      const board = await this.services.boardService.getBoardWithColumns(parsedUri.id);
      if (!board) {
        throw new Error(`Board not found: ${String(String(parsedUri.id))}`);
      }

      const tasks = await this.services.taskService.getTasks({
        board_id: parsedUri.id,
        limit: 10000,
      });
      const allNotes: unknown[] = [];
      const allTags: unknown[] = [];

      // Get all notes and tags for tasks
      await Promise.all(
        tasks.map(async task => {
          await this.services.noteService.getTaskNotes(task.id, { limit: 100 });
        })
      );

      return {
        text: JSON.stringify(
          {
            export_type: 'board_complete',
            board,
            tasks,
            notes: allNotes,
            tags: allTags,
            exported_at: new Date().toISOString(),
            counts: {
              tasks: tasks.length,
              notes: allNotes.length,
              tags: allTags.length,
            },
          },
          null,
          2
        ),
        mimeType: 'application/json',
      };
    }
    throw new Error('Board ID required for export');
  }
}
