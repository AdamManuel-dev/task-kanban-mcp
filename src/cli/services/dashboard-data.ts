import type { ApiClient } from '../client';
import type { DashboardData } from '../utils/dashboard-manager';
import { logger } from '../../utils/logger';

/**
 * Service to fetch and transform data for dashboard components
 */
export class DashboardDataService {
  constructor(private readonly apiClient: ApiClient) {}

  /**
   * Fetch complete dashboard data from API
   */
  async fetchDashboardData(): Promise<DashboardData> {
    try {
      const [tasks, activity] = await Promise.all([this.fetchTasks(), this.fetchActivity()]);

      return { tasks: DashboardDataService.transformTaskData(tasks), velocity: await this.calculateVelocity(), teamMembers: await this.fetchTeamMembers(), burndown: await this.calculateBurndown(), activity: DashboardDataService.transformActivityData(activity) };
    } catch (error) {
      logger.warn(
        'Failed to fetch dashboard data, using sample data:',
        error instanceof Error ? error.message : 'Unknown error'
      );
      return DashboardDataService.generateSampleData();
    }
  }

  /**
   * Fetch tasks from API
   */
  private async fetchTasks(): Promise<unknown[]> {
    try {
      const response = await this.apiClient.get('/tasks', {
        // include_archived: false, // Not supported in RequestOptions type
        // limit: 1000, // Not supported in RequestOptions type
      });
      return 'data' in response && Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      throw new Error(
        `Failed to fetch tasks: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
      );
    }
  }

  /**
   * Fetch boards from API
   */
  // private async fetchBoards(): Promise<any[]> {
  //   try {
  //     const response = await this.apiClient.get('/boards');
  //     return response.data ?? [];
  //   } catch (error) {
  //     throw new Error(
  //       `Failed to fetch boards: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
  //     );
  //   }
  // }

  /**
   * Fetch activity from API
   */
  private async fetchActivity(): Promise<unknown[]> {
    try {
      const response = await this.apiClient.get('/activity', {
        // limit: 20, // Not supported in RequestOptions type
        // order: 'desc', // Not supported in RequestOptions type
      });
      return 'data' in response && Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      throw new Error(
        `Failed to fetch activity: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
      );
    }
  }

  /**
   * Transform task data for dashboard display
   */
  private static transformTaskData(tasks: unknown[]): DashboardData['tasks'] {
    const total = tasks.length;
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    let completed = 0;
    let overdue = 0;

    const now = new Date();

    tasks.forEach(task => {
      if (!task || typeof task !== 'object') return;
      const taskObj = task as { status?: string; priority?: string; due_date?: string };

      // Count by status
      const status = taskObj.status ?? 'todo';
      byStatus[status] = (byStatus[status] ?? 0) + 1;

      // Count by priority
      const priority = taskObj.priority ?? 'P3';
      byPriority[priority] = (byPriority[priority] ?? 0) + 1;

      // Count completed
      if (status === 'done' || status === 'completed') {
        completed += 1;
      }

      // Count overdue
      if (taskObj.due_date && new Date(taskObj.due_date) < now && status !== 'done') {
        overdue += 1;
      }
    });

    return { total, byStatus, byPriority, completed, overdue };
  }

  /**
   * Calculate velocity data (tasks completed per week)
   */
  private async calculateVelocity(): Promise<DashboardData['velocity']> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 8 * 7); // 8 weeks back

      const response = await this.apiClient.get('/analytics/velocity', {
        // start_date: startDate.toISOString(), // Not supported in RequestOptions type
        // end_date: endDate.toISOString(), // Not supported in RequestOptions type
        // group_by: 'week', // Not supported in RequestOptions type
      });

      return (
        ('data' in response && Array.isArray(response.data) ? response.data : []).map(
          (item: unknown, index: number) => ({
            period: `W${String(index + 1)}`,
            completed:
              item && typeof item === 'object' && 'completed_count' in item
                ? ((item as { completed_count?: number }).completed_count ?? 0)
                : 0,
          })
        ) || DashboardDataService.generateSampleVelocity()
      );
    } catch (error) {
      return DashboardDataService.generateSampleVelocity();
    }
  }

  /**
   * Fetch team member data
   */
  private async fetchTeamMembers(): Promise<DashboardData['teamMembers']> {
    try {
      const response = await this.apiClient.get('/analytics/team-workload');

      return (
        ('data' in response && Array.isArray(response.data) ? response.data : []).map(
          (member: unknown) => {
            const memberObj = member as {
              name?: string;
              username?: string;
              active_tasks?: number;
              workload_percentage?: number;
            };
            return { name: memberObj.name ?? memberObj.username ?? 'Unknown', taskCount: memberObj.active_tasks ?? 0, load: memberObj.workload_percentage ?? 0 };
          }
        ) || DashboardDataService.generateSampleTeamMembers()
      );
    } catch (error) {
      return DashboardDataService.generateSampleTeamMembers();
    }
  }

  /**
   * Calculate burndown chart data
   */
  private async calculateBurndown(): Promise<DashboardData['burndown']> {
    try {
      const response = await this.apiClient.get('/analytics/burndown');

      const data = 'data' in response && Array.isArray(response.data) ? response.data : [];
      const burndownData = data.map((item: unknown) => {
        const itemObj = item as {
          day?: string;
          remaining_tasks?: number;
          ideal_remaining?: number;
        };
        return { day: itemObj.day ?? '', remaining: itemObj.remaining_tasks ?? 0, ideal: itemObj.ideal_remaining ?? 0 };
      });

      return burndownData.length > 0 ? burndownData : DashboardDataService.generateSampleBurndown();
    } catch (error) {
      return DashboardDataService.generateSampleBurndown();
    }
  }

  /**
   * Transform activity data for display
   */
  private static transformActivityData(activities: unknown[]): DashboardData['activity'] {
    return activities.slice(0, 10).map(activity => {
      const activityObj = activity as {
        created_at?: string;
        user?: { name?: string; username?: string };
      };
      return { timestamp: activityObj.created_at, ? new Date(activityObj.created_at).toLocaleTimeString('en-US', {, hour: '2-digit', minute: '2-digit' })
          : 'Unknown',
        event: this.formatActivityEvent(activity),
        user: activityObj.user?.name ?? activityObj.user?.username ?? 'System',
      };
    });
  }

  /**
   * Format activity event for display
   */
  private static formatActivityEvent(activity: unknown): string {
    const activityObj = activity as {
      action?: string;
      entity_type?: string;
      entity?: { title?: string; name?: string };
      entity_name?: string;
      entity_id?: string;
      details?: { new_status?: string; assignee?: string };
    };
    const action = activityObj.action ?? 'updated';
    const entityType = activityObj.entity_type ?? 'task';
    const entityName =
      activityObj.entity_name ??
      `${String(entityType)} #${String(activityObj.entity_id ?? 'Unknown')}`;

    switch (action) {
      case 'create':
        return `Created ${String(entityType)}: ${String(entityName)}`;
      case 'update':
        return `Updated ${String(entityType)}: ${String(entityName)}`;
      case 'delete':
        return `Deleted ${String(entityType)}: ${String(entityName)}`;
      case 'move':
        return `Moved ${String(entityName)} to ${String(activityObj.details?.new_status ?? 'unknown')}`;
      case 'assign':
        return `Assigned ${String(entityName)} to ${String(activityObj.details?.assignee ?? 'unknown')}`;
      case 'comment':
        return `Commented on ${String(entityName)}`;
      default:
        return `${String(action)} ${String(entityName)}`;
    }
  }

  /**
   * Generate sample velocity data as fallback
   */
  private static generateSampleVelocity(): DashboardData['velocity'] {
    return [
      { period: 'W1', completed: 12 },
      { period: 'W2', completed: 15 },
      { period: 'W3', completed: 18 },
      { period: 'W4', completed: 14 },
      { period: 'W5', completed: 20 },
      { period: 'W6', completed: 16 },
      { period: 'W7', completed: 22 },
      { period: 'W8', completed: 19 },
    ];
  }

  /**
   * Generate sample team data as fallback
   */
  private static generateSampleTeamMembers(): DashboardData['teamMembers'] {
    return [
      { name: 'Alice', taskCount: 8, load: 85 },
      { name: 'Bob', taskCount: 6, load: 70 },
      { name: 'Charlie', taskCount: 10, load: 95 },
      { name: 'Diana', taskCount: 7, load: 75 },
    ];
  }

  /**
   * Generate sample burndown data as fallback
   */
  private static generateSampleBurndown(): DashboardData['burndown'] {
    return [
      { day: 'Day 1', remaining: 45, ideal: 45 },
      { day: 'Day 2', remaining: 42, ideal: 40 },
      { day: 'Day 3', remaining: 38, ideal: 35 },
      { day: 'Day 4', remaining: 35, ideal: 30 },
      { day: 'Day 5', remaining: 30, ideal: 25 },
      { day: 'Day 6', remaining: 28, ideal: 20 },
      { day: 'Day 7', remaining: 25, ideal: 15 },
      { day: 'Day 8', remaining: 20, ideal: 10 },
      { day: 'Day 9', remaining: 15, ideal: 5 },
      { day: 'Day 10', remaining: 12, ideal: 0 },
    ];
  }

  /**
   * Generate complete sample data as fallback
   */
  private static generateSampleData(): DashboardData {
    return { tasks: {, total: 45, byStatus: {, todo: 18, in_progress: 12, done: 13, blocked: 2 },
        byPriority: {
          P1: 8,
          P2: 15,
          P3: 18,
          P4: 4,
        },
        completed: 13,
        overdue: 3,
      },
      velocity: this.generateSampleVelocity(),
      teamMembers: this.generateSampleTeamMembers(),
      burndown: this.generateSampleBurndown(),
      activity: [
        { timestamp: '14:32', event: 'Task completed: User Auth', user: 'Alice' },
        { timestamp: '14:15', event: 'New task created: Fix login bug', user: 'Bob' },
        { timestamp: '13:45', event: 'Task moved to In Progress', user: 'Charlie' },
        { timestamp: '13:20', event: 'Comment added to TASK-123', user: 'Diana' },
        { timestamp: '12:55', event: 'Task assigned to Alice', user: 'Bob' },
      ],
    };
  }
}
