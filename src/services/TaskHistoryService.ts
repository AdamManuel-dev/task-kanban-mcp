/**
 * Task History Service
 * Tracks and manages the history of task changes for audit trail and analytics
 */

import { randomUUID } from 'crypto';
import { dbConnection } from '@/database/connection';
import type { QueryParameter } from '@/database/connection';
import { logger } from '@/utils/logger';
import type { Task } from '@/types';

export interface TaskHistoryEntry {
  id: string;
  task_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  changed_at: Date;
  reason?: string;
}

export interface PriorityChangeEntry extends TaskHistoryEntry {
  field_name: 'priority';
  old_value: string | null; // string representation of number
  new_value: string | null; // string representation of number
}

export interface PriorityHistoryAnalytics {
  task_id: string;
  task_title: string;
  total_changes: number;
  average_priority: number;
  highest_priority_ever: number;
  lowest_priority_ever: number;
  most_common_priority: number;
  priority_trend: 'increasing' | 'decreasing' | 'stable';
  change_frequency_days: number;
  recent_changes: PriorityChangeEntry[];
  change_reasons: Array<{ reason: string; count: number }>;
}

export interface TaskHistoryRequest {
  task_id: string;
  field_name: string;
  old_value: unknown;
  new_value: unknown;
  changed_by?: string;
  reason?: string;
}

export class TaskHistoryService {
  private static instance: TaskHistoryService;

  public static getInstance(): TaskHistoryService {
    if (!TaskHistoryService.instance) {
      TaskHistoryService.instance = new TaskHistoryService();
    }
    return TaskHistoryService.instance;
  }

  /**
   * Record a change in task history
   */
  async recordChange(request: TaskHistoryRequest): Promise<TaskHistoryEntry> {
    try {
      const id = randomUUID();
      const now = new Date();

      const entry: TaskHistoryEntry = {
        id,
        task_id: request.task_id,
        field_name: request.field_name,
        old_value: request.old_value ? request.old_value.toString() : null,
        new_value: request.new_value ? request.new_value.toString() : null,
        changed_by: request.changed_by ?? null,
        changed_at: now,
        reason: request.reason,
      };

      await dbConnection.execute(
        `INSERT INTO task_history (
          id, task_id, field_name, old_value, new_value, changed_by, changed_at, reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.id,
          entry.task_id,
          entry.field_name,
          entry.old_value,
          entry.new_value,
          entry.changed_by,
          entry.changed_at.toISOString(),
          entry.reason ?? null,
        ]
      );

      logger.info('Task history recorded', {
        taskId: request.task_id,
        field: request.field_name,
        oldValue: request.old_value,
        newValue: request.new_value,
      });

      return entry;
    } catch (error) {
      logger.error('Failed to record task history:', error);
      throw new Error(
        `Failed to record task history: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get task history for a specific task
   */
  async getTaskHistory(taskId: string, fieldName?: string): Promise<TaskHistoryEntry[]> {
    try {
      let query = 'SELECT * FROM task_history WHERE task_id = ?';
      const params: QueryParameter[] = [taskId];

      if (fieldName) {
        query += ' AND field_name = ?';
        params.push(fieldName);
      }

      query += ' ORDER BY changed_at DESC';

      const rows = await dbConnection.query(query, params);
      return rows.map((row: unknown) => this.mapRowToHistoryEntry(row));
    } catch (error) {
      logger.error('Failed to get task history:', error);
      throw new Error(
        `Failed to get task history: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get priority change history for a specific task
   */
  async getPriorityHistory(taskId: string): Promise<PriorityChangeEntry[]> {
    try {
      const history = await this.getTaskHistory(taskId, 'priority');
      return history as PriorityChangeEntry[];
    } catch (error) {
      logger.error('Failed to get priority history:', error);
      throw error;
    }
  }

  /**
   * Get priority history analytics for a task
   */
  async getPriorityAnalytics(taskId: string): Promise<PriorityHistoryAnalytics> {
    try {
      // Get task info
      const task = (await dbConnection.queryOne('SELECT id, title FROM tasks WHERE id = ?', [
        taskId,
      ])) as { id: string; title: string } | null;

      if (!task) {
        throw new Error('Task not found');
      }

      const priorityHistory = await this.getPriorityHistory(taskId);

      if (priorityHistory.length === 0) {
        // No priority changes yet
        const currentTask = await dbConnection.queryOne('SELECT priority FROM tasks WHERE id = ?', [
          taskId,
        ]);

        return {
          task_id: taskId,
          task_title: task.title,
          total_changes: 0,
          average_priority: currentTask?.priority || 1,
          highest_priority_ever: currentTask?.priority || 1,
          lowest_priority_ever: currentTask?.priority || 1,
          most_common_priority: currentTask?.priority || 1,
          priority_trend: 'stable',
          change_frequency_days: 0,
          recent_changes: [],
          change_reasons: [],
        };
      }

      // Calculate analytics
      const priorities = priorityHistory
        .map(h => parseInt(h.new_value ?? '1'))
        .filter(p => !isNaN(p));

      const averagePriority = priorities.reduce((sum, p) => sum + p, 0) / priorities.length;
      const highestPriority = Math.max(...priorities);
      const lowestPriority = Math.min(...priorities);

      // Find most common priority
      const priorityCounts = priorities.reduce(
        (acc, p) => {
          acc[p] = (acc[p] ?? 0) + 1;
          return acc;
        },
        {} as Record<number, number>
      );

      const mostCommonPriority = parseInt(
        Object.entries(priorityCounts).sort(([, a], [, b]) => b - a)[0][0]
      );

      // Calculate trend (compare first and last few values)
      let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
      if (priorities.length >= 2) {
        const recentPriorities = priorities.slice(0, 3);
        const olderPriorities = priorities.slice(-3);

        const recentAvg = recentPriorities.reduce((sum, p) => sum + p, 0) / recentPriorities.length;
        const olderAvg = olderPriorities.reduce((sum, p) => sum + p, 0) / olderPriorities.length;

        if (recentAvg > olderAvg + 0.5) {
          trend = 'increasing';
        } else if (recentAvg < olderAvg - 0.5) {
          trend = 'decreasing';
        }
      }

      // Calculate change frequency
      let changeFrequencyDays = 0;
      if (priorityHistory.length > 1) {
        const firstChange = new Date(priorityHistory[priorityHistory.length - 1].changed_at);
        const lastChange = new Date(priorityHistory[0].changed_at);
        const totalDays = Math.ceil(
          (lastChange.getTime() - firstChange.getTime()) / (1000 * 60 * 60 * 24)
        );
        changeFrequencyDays = totalDays / priorityHistory.length;
      }

      // Count change reasons
      const reasonCounts = priorityHistory
        .filter(h => h.reason)
        .reduce(
          (acc, h) => {
            const reason = h.reason!;
            acc[reason] = (acc[reason] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        );

      const changeReasons = Object.entries(reasonCounts)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count);

      return {
        task_id: taskId,
        task_title: task.title,
        total_changes: priorityHistory.length,
        average_priority: Math.round(averagePriority * 10) / 10,
        highest_priority_ever: highestPriority,
        lowest_priority_ever: lowestPriority,
        most_common_priority: mostCommonPriority,
        priority_trend: trend,
        change_frequency_days: Math.round(changeFrequencyDays * 10) / 10,
        recent_changes: priorityHistory.slice(0, 5),
        change_reasons: changeReasons,
      };
    } catch (error) {
      logger.error('Failed to get priority analytics:', error);
      throw error;
    }
  }

  /**
   * Get priority change patterns across all tasks
   */
  async getPriorityChangePatterns(boardId?: string): Promise<{
    total_priority_changes: number;
    most_active_tasks: Array<{ task_id: string; task_title: string; change_count: number }>;
    common_change_reasons: Array<{ reason: string; count: number }>;
    priority_distribution: Array<{ priority: number; count: number }>;
    trend_analysis: {
      increasing_count: number;
      decreasing_count: number;
      stable_count: number;
    };
  }> {
    try {
      let historyQuery = `
        SELECT th.*, t.title as task_title, t.board_id
        FROM task_history th
        JOIN tasks t ON th.task_id = t.id
        WHERE th.field_name = 'priority'
      `;
      const params: QueryParameter[] = [];

      if (boardId) {
        historyQuery += ' AND t.board_id = ?';
        params.push(boardId);
      }

      historyQuery += ' ORDER BY th.changed_at DESC';

      const allPriorityChanges = await dbConnection.query<PriorityChangeEntry>(
        historyQuery,
        params
      );

      // Count total changes
      const totalPriorityChanges = allPriorityChanges.length;

      // Find most active tasks
      const taskChangeCounts = allPriorityChanges.reduce(
        (
          acc: Record<string, { task_id: string; task_title: string; change_count: number }>,
          change: unknown
        ) => {
          const key = change.task_id;
          if (!acc[key]) {
            acc[key] = {
              task_id: change.task_id,
              task_title: change.task_title,
              change_count: 0,
            };
          }
          acc[key].change_count++;
          return acc;
        },
        {} as Record<string, { task_id: string; task_title: string; change_count: number }>
      );

      const mostActiveTasks = Object.values(taskChangeCounts)
        .sort((a, b) => b.change_count - a.change_count)
        .slice(0, 10);

      // Count common change reasons
      const reasonCounts = allPriorityChanges
        .filter((change: PriorityChangeEntry) => change.reason)
        .reduce(
          (acc: Record<string, number>, change: PriorityChangeEntry) => {
            const { reason } = change;
            acc[reason] = (acc[reason] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        );

      const commonChangeReasons = Object.entries(reasonCounts)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Analyze priority distribution
      const priorityValues = allPriorityChanges
        .map((change: PriorityChangeEntry) => parseInt(change.new_value ?? '1'))
        .filter(p => !isNaN(p));

      const priorityCounts = priorityValues.reduce(
        (acc, priority) => {
          acc[priority] = (acc[priority] ?? 0) + 1;
          return acc;
        },
        {} as Record<number, number>
      );

      const priorityDistribution = Object.entries(priorityCounts)
        .map(([priority, count]) => ({ priority: parseInt(priority), count }))
        .sort((a, b) => a.priority - b.priority);

      // Trend analysis (simplified for now)
      const trendAnalysis = {
        increasing_count: 0,
        decreasing_count: 0,
        stable_count: 0,
      };

      // This could be enhanced with more sophisticated trend analysis
      // For now, just count based on recent changes per task
      for (const taskId of Object.keys(taskChangeCounts)) {
        const taskChanges = allPriorityChanges.filter(
          (c: PriorityChangeEntry) => c.task_id === taskId
        );
        if (taskChanges.length >= 2) {
          const recent = parseInt(taskChanges[0].new_value || '1');
          const older = parseInt(taskChanges[taskChanges.length - 1].old_value || '1');

          if (recent > older) {
            trendAnalysis.increasing_count++;
          } else if (recent < older) {
            trendAnalysis.decreasing_count++;
          } else {
            trendAnalysis.stable_count++;
          }
        } else {
          trendAnalysis.stable_count++;
        }
      }

      return {
        total_priority_changes: totalPriorityChanges,
        most_active_tasks: mostActiveTasks,
        common_change_reasons: commonChangeReasons,
        priority_distribution: priorityDistribution,
        trend_analysis: trendAnalysis,
      };
    } catch (error) {
      logger.error('Failed to get priority change patterns:', error);
      throw error;
    }
  }

  /**
   * Get recent priority changes across all tasks
   */
  async getRecentPriorityChanges(limit = 20, boardId?: string): Promise<PriorityChangeEntry[]> {
    try {
      let query = `
        SELECT th.*, t.title as task_title
        FROM task_history th
        JOIN tasks t ON th.task_id = t.id
        WHERE th.field_name = 'priority'
      `;
      const params: QueryParameter[] = [];

      if (boardId) {
        query += ' AND t.board_id = ?';
        params.push(boardId);
      }

      query += ' ORDER BY th.changed_at DESC LIMIT ?';
      params.push(limit);

      const rows = await dbConnection.query(query, params);
      return rows.map((row: unknown) => this.mapRowToHistoryEntry(row)) as PriorityChangeEntry[];
    } catch (error) {
      logger.error('Failed to get recent priority changes:', error);
      throw error;
    }
  }

  // Private helper methods

  private mapRowToHistoryEntry(row: unknown): TaskHistoryEntry {
    return {
      id: row.id,
      task_id: row.task_id,
      field_name: row.field_name,
      old_value: row.old_value,
      new_value: row.new_value,
      changed_by: row.changed_by,
      changed_at: new Date(row.changed_at),
      reason: row.reason,
    };
  }
}
