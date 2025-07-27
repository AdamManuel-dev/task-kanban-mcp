import type { ApiClient } from '../client';
import type { DashboardData } from '../utils/dashboard-manager';

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

      return {
        tasks: this.transformTaskData(tasks),
        velocity: await this.calculateVelocity(),
        teamMembers: await this.fetchTeamMembers(),
        burndown: await this.calculateBurndown(),
        activity: this.transformActivityData(activity),
      };
    } catch (error) {
      console.warn('Failed to fetch dashboard data, using sample data:', error.message);
      return this.generateSampleData();
    }
  }

  /**
   * Fetch tasks from API
   */
  private async fetchTasks(): Promise<any[]> {
    try {
      const response = await this.apiClient.get('/tasks', {
        include_archived: false,
        limit: 1000,
      });
      return response.data || [];
    } catch (error) {
      throw new Error(`Failed to fetch tasks: ${error.message}`);
    }
  }

  /**
   * Fetch boards from API
   */
  private async fetchBoards(): Promise<any[]> {
    try {
      const response = await this.apiClient.get('/boards');
      return response.data || [];
    } catch (error) {
      throw new Error(`Failed to fetch boards: ${error.message}`);
    }
  }

  /**
   * Fetch activity from API
   */
  private async fetchActivity(): Promise<any[]> {
    try {
      const response = await this.apiClient.get('/activity', {
        limit: 20,
        order: 'desc',
      });
      return response.data || [];
    } catch (error) {
      throw new Error(`Failed to fetch activity: ${error.message}`);
    }
  }

  /**
   * Transform task data for dashboard display
   */
  private transformTaskData(tasks: any[]): DashboardData['tasks'] {
    const total = tasks.length;
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    let completed = 0;
    let overdue = 0;

    const now = new Date();

    tasks.forEach(task => {
      // Count by status
      const status = task.status || 'todo';
      byStatus[status] = (byStatus[status] || 0) + 1;

      // Count by priority
      const priority = task.priority || 'P3';
      byPriority[priority] = (byPriority[priority] || 0) + 1;

      // Count completed
      if (status === 'done' || status === 'completed') {
        completed++;
      }

      // Count overdue
      if (task.due_date && new Date(task.due_date) < now && status !== 'done') {
        overdue++;
      }
    });

    return {
      total,
      byStatus,
      byPriority,
      completed,
      overdue,
    };
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
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        group_by: 'week',
      });

      return (
        response.data?.map((item: any, index: number) => ({
          period: `W${index + 1}`,
          completed: item.completed_count || 0,
        })) || this.generateSampleVelocity()
      );
    } catch (error) {
      return this.generateSampleVelocity();
    }
  }

  /**
   * Fetch team member data
   */
  private async fetchTeamMembers(): Promise<DashboardData['teamMembers']> {
    try {
      const response = await this.apiClient.get('/analytics/team-workload');

      return (
        response.data?.map((member: any) => ({
          name: member.name || member.username,
          taskCount: member.active_tasks || 0,
          load: member.workload_percentage || 0,
        })) || this.generateSampleTeamMembers()
      );
    } catch (error) {
      return this.generateSampleTeamMembers();
    }
  }

  /**
   * Calculate burndown chart data
   */
  private async calculateBurndown(): Promise<DashboardData['burndown']> {
    try {
      const response = await this.apiClient.get('/analytics/burndown');

      return (
        response.data?.map((item: any) => ({
          day: item.day,
          remaining: item.remaining_tasks || 0,
          ideal: item.ideal_remaining || 0,
        })) || this.generateSampleBurndown()
      );
    } catch (error) {
      return this.generateSampleBurndown();
    }
  }

  /**
   * Transform activity data for display
   */
  private transformActivityData(activities: any[]): DashboardData['activity'] {
    return activities.slice(0, 10).map(activity => ({
      timestamp: new Date(activity.created_at).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      event: this.formatActivityEvent(activity),
      user: activity.user?.name || activity.user?.username || 'System',
    }));
  }

  /**
   * Format activity event for display
   */
  private formatActivityEvent(activity: any): string {
    const action = activity.action || 'updated';
    const entityType = activity.entity_type || 'task';
    const entityName = activity.entity_name || `${entityType} #${activity.entity_id}`;

    switch (action) {
      case 'create':
        return `Created ${entityType}: ${entityName}`;
      case 'update':
        return `Updated ${entityType}: ${entityName}`;
      case 'delete':
        return `Deleted ${entityType}: ${entityName}`;
      case 'move':
        return `Moved ${entityName} to ${activity.details?.new_status}`;
      case 'assign':
        return `Assigned ${entityName} to ${activity.details?.assignee}`;
      case 'comment':
        return `Commented on ${entityName}`;
      default:
        return `${action} ${entityName}`;
    }
  }

  /**
   * Generate sample velocity data as fallback
   */
  private generateSampleVelocity(): DashboardData['velocity'] {
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
  private generateSampleTeamMembers(): DashboardData['teamMembers'] {
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
  private generateSampleBurndown(): DashboardData['burndown'] {
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
  private generateSampleData(): DashboardData {
    return {
      tasks: {
        total: 45,
        byStatus: {
          todo: 18,
          in_progress: 12,
          done: 13,
          blocked: 2,
        },
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
