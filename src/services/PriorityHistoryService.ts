/**
 * Priority History Service
 * Tracks and analyzes task priority changes over time
 */

import { dbConnection } from '@/database/connection';
import type { QueryParameter } from '@/database/connection';
import { logger } from '@/utils/logger';
import type { Task } from '@/types';

export interface PriorityChange {
  id: string;
  task_id: string;
  old_priority: number | null;
  new_priority: number;
  reason?: string;
  changed_by?: string;
  context?: Record<string, unknown>;
  timestamp: Date;
}

export interface PriorityStats {
  total_changes: number;
  avg_changes_per_task: number;
  most_changed_tasks: Array<{
    task: Task;
    change_count: number;
    latest_reason?: string;
  }>;
  priority_trends: {
    increases: number;
    decreases: number;
    unchanged: number;
  };
  common_reasons: Array<{
    reason: string;
    count: number;
  }>;
}

export interface PriorityPattern {
  task_id: string;
  pattern_type: 'frequent_changes' | 'priority_drift' | 'emergency_bump' | 'gradual_decline';
  score: number;
  description: string;
  recommendations: string[];
}

interface PriorityChangeRow {
  id: string;
  task_id: string;
  old_priority: number | null;
  new_priority: number;
  reason: string | null;
  changed_by: string | null;
  context: string | null;
  timestamp: string;
}

interface PriorityChangeWithTask extends PriorityChangeRow {
  title: string;
  board_id: string;
  status: string;
}

interface PriorityChangeWithTaskExtended extends PriorityChangeWithTask {
  estimated_hours: number | null;
}

export class PriorityHistoryService {
  private static instance: PriorityHistoryService;

  public static getInstance(): PriorityHistoryService {
    if (!PriorityHistoryService.instance) {
      PriorityHistoryService.instance = new PriorityHistoryService();
    }
    return PriorityHistoryService.instance;
  }

  /**
   * Initialize the priority history table
   */
  async initializeSchema(): Promise<void> {
    try {
      await dbConnection.execute(`
        CREATE TABLE IF NOT EXISTS priority_history (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          old_priority INTEGER,
          new_priority INTEGER NOT NULL,
          reason TEXT,
          changed_by TEXT,
          context TEXT, -- JSON string
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE
        )
      `);

      await dbConnection.execute(`
        CREATE INDEX IF NOT EXISTS idx_priority_history_task_id 
        ON priority_history (task_id)
      `);

      await dbConnection.execute(`
        CREATE INDEX IF NOT EXISTS idx_priority_history_timestamp 
        ON priority_history (timestamp)
      `);

      logger.info('Priority history schema initialized');
    } catch (error) {
      logger.error('Failed to initialize priority history schema:', error);
      throw error;
    }
  }

  /**
   * Record a priority change
   */
  async recordPriorityChange(
    taskId: string,
    oldPriority: number | null,
    newPriority: number,
    reason?: string,
    changedBy?: string,
    context?: Record<string, unknown>
  ): Promise<PriorityChange> {
    try {
      const id = `ph_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const timestamp = new Date();

      await dbConnection.execute(
        `INSERT INTO priority_history 
         (id, task_id, old_priority, new_priority, reason, changed_by, context, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          taskId,
          oldPriority,
          newPriority,
          reason ?? null,
          changedBy ?? null,
          context ? JSON.stringify(context) : null,
          timestamp.toISOString(),
        ]
      );

      logger.info('Priority change recorded', {
        taskId,
        oldPriority,
        newPriority,
        reason,
        changedBy,
      });

      return {
        id,
        task_id: taskId,
        old_priority: oldPriority,
        new_priority: newPriority,
        reason,
        changed_by: changedBy,
        context,
        timestamp,
      };
    } catch (error) {
      logger.error('Failed to record priority change:', error);
      throw error;
    }
  }

  /**
   * Get priority history for a specific task
   */
  async getTaskPriorityHistory(taskId: string): Promise<PriorityChange[]> {
    try {
      const rows = await dbConnection.query<PriorityChangeRow>(
        `SELECT * FROM priority_history 
         WHERE task_id = ? 
         ORDER BY timestamp ASC`,
        [taskId]
      );

      return rows.map(row => ({
        id: row.id,
        task_id: row.task_id,
        old_priority: row.old_priority,
        new_priority: row.new_priority,
        reason: row.reason || undefined,
        changed_by: row.changed_by || undefined,
        context: row.context ? JSON.parse(row.context) : undefined,
        timestamp: new Date(row.timestamp),
      }));
    } catch (error) {
      logger.error('Failed to get task priority history:', error);
      throw error;
    }
  }

  /**
   * Get priority statistics for a board or globally
   */
  async getPriorityStats(
    boardId?: string,
    timeRange?: { start: Date; end: Date }
  ): Promise<PriorityStats> {
    try {
      let baseQuery = `
        SELECT 
          ph.*,
          t.title, t.board_id, t.status
        FROM priority_history ph
        JOIN tasks t ON ph.task_id = t.id
        WHERE 1=1
      `;
      const params: QueryParameter[] = [];

      if (boardId) {
        baseQuery += ' AND t.board_id = ?';
        params.push(boardId);
      }

      if (timeRange) {
        baseQuery += ' AND ph.timestamp BETWEEN ? AND ?';
        params.push(timeRange.start.toISOString(), timeRange.end.toISOString());
      }

      const changes = await dbConnection.query<PriorityChangeWithTask>(baseQuery, params);

      // Calculate total changes
      const totalChanges = changes.length;

      // Calculate average changes per task
      const uniqueTasks = new Set(changes.map(c => c.task_id));
      const avgChangesPerTask = uniqueTasks.size > 0 ? totalChanges / uniqueTasks.size : 0;

      // Find most changed tasks
      const taskChangeCounts = new Map<string, number>();
      const taskDetails = new Map<string, Task>();
      const taskLatestReasons = new Map<string, string>();

      changes.forEach(change => {
        taskChangeCounts.set(change.task_id, (taskChangeCounts.get(change.task_id) ?? 0) + 1);
        taskDetails.set(change.task_id, {
          id: change.task_id,
          title: change.title,
          board_id: change.board_id,
          status: change.status,
        } as Task);
        if (change.reason) {
          taskLatestReasons.set(change.task_id, change.reason);
        }
      });

      const mostChangedTasks = Array.from(taskChangeCounts.entries())
        .map(([taskId, count]) => ({
          task: taskDetails.get(taskId)!,
          change_count: count,
          latest_reason: taskLatestReasons.get(taskId),
        }))
        .filter(item => item.task) // Filter out entries where task is undefined
        .sort((a, b) => b.change_count - a.change_count)
        .slice(0, 10);

      // Calculate priority trends
      let increases = 0;
      let decreases = 0;
      let unchanged = 0;

      changes.forEach(change => {
        const oldPri = change.old_priority ?? 0;
        const newPri = change.new_priority;

        if (newPri > oldPri) increases++;
        else if (newPri < oldPri) decreases++;
        else unchanged++;
      });

      // Count common reasons
      const reasonCounts = new Map<string, number>();
      changes.forEach(change => {
        if (change.reason) {
          reasonCounts.set(change.reason, (reasonCounts.get(change.reason) ?? 0) + 1);
        }
      });

      const commonReasons = Array.from(reasonCounts.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return {
        total_changes: totalChanges,
        avg_changes_per_task: avgChangesPerTask,
        most_changed_tasks: mostChangedTasks,
        priority_trends: {
          increases,
          decreases,
          unchanged,
        },
        common_reasons: commonReasons,
      };
    } catch (error) {
      logger.error('Failed to get priority statistics:', error);
      throw error;
    }
  }

  /**
   * Analyze priority patterns for insights
   */
  async analyzePriorityPatterns(taskId?: string, boardId?: string): Promise<PriorityPattern[]> {
    try {
      let query = `
        SELECT 
          ph.*,
          t.title, t.board_id, t.status, t.estimated_hours
        FROM priority_history ph
        JOIN tasks t ON ph.task_id = t.id
        WHERE 1=1
      `;
      const params: QueryParameter[] = [];

      if (taskId) {
        query += ' AND ph.task_id = ?';
        params.push(taskId);
      } else if (boardId) {
        query += ' AND t.board_id = ?';
        params.push(boardId);
      }

      query += ' ORDER BY ph.task_id, ph.timestamp ASC';

      const changes = await dbConnection.query<PriorityChangeWithTaskExtended>(query, params);
      const patterns: PriorityPattern[] = [];

      // Group changes by task
      const taskChanges = new Map<string, PriorityChangeWithTaskExtended[]>();
      changes.forEach(change => {
        if (!taskChanges.has(change.task_id)) {
          taskChanges.set(change.task_id, []);
        }
        taskChanges.get(change.task_id)!.push(change);
      });

      // Analyze each task for patterns
      for (const [taskId, taskChangeList] of taskChanges.entries()) {
        if (taskChangeList.length < 2) continue;

        const task = taskChangeList[0];

        // Pattern 1: Frequent changes (>5 changes in 30 days)
        const recentChanges = taskChangeList.filter(
          c => new Date(c.timestamp) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        );

        if (recentChanges.length > 5) {
          patterns.push({
            task_id: taskId,
            pattern_type: 'frequent_changes',
            score: Math.min(recentChanges.length / 10, 1),
            description: `Task has ${recentChanges.length} priority changes in the last 30 days`,
            recommendations: [
              'Consider stabilizing task requirements',
              'Review if task scope is well-defined',
              'Check for external dependency issues',
            ],
          });
        }

        // Pattern 2: Priority drift (gradual increase over time)
        const priorityTrend = this.calculatePriorityTrend(taskChangeList);
        if (priorityTrend > 0.5) {
          patterns.push({
            task_id: taskId,
            pattern_type: 'priority_drift',
            score: priorityTrend,
            description: 'Task priority has been consistently increasing over time',
            recommendations: [
              'Consider if this task has become more critical',
              'Review if deadlines are approaching',
              'Check for scope creep or additional requirements',
            ],
          });
        }

        // Pattern 3: Emergency bumps (sudden large increases)
        const emergencyBumps = taskChangeList.filter(
          (change: any, i: number) =>
            i > 0 && change.new_priority - (taskChangeList[i - 1].new_priority ?? 0) >= 5
        );

        if (emergencyBumps.length > 0) {
          patterns.push({
            task_id: taskId,
            pattern_type: 'emergency_bump',
            score: emergencyBumps.length / taskChangeList.length,
            description: `Task has had ${emergencyBumps.length} emergency priority increases`,
            recommendations: [
              'Investigate causes of urgent priority changes',
              'Consider better initial priority estimation',
              'Review task dependencies for blocking issues',
            ],
          });
        }

        // Pattern 4: Gradual decline (priority decreasing over time)
        if (priorityTrend < -0.3) {
          patterns.push({
            task_id: taskId,
            pattern_type: 'gradual_decline',
            score: Math.abs(priorityTrend),
            description: 'Task priority has been gradually decreasing',
            recommendations: [
              'Consider if task is still relevant',
              'Review if requirements have changed',
              'Check if other tasks have become higher priority',
            ],
          });
        }
      }

      return patterns.sort((a, b) => b.score - a.score);
    } catch (error) {
      logger.error('Failed to analyze priority patterns:', error);
      throw error;
    }
  }

  /**
   * Get priority change summary for a time period
   */
  async getPriorityChangeSummary(
    timeRange: { start: Date; end: Date },
    boardId?: string
  ): Promise<{
    changes_count: number;
    affected_tasks: number;
    avg_priority_change: number;
    most_active_day: { date: string; changes: number };
    busiest_hours: Array<{ hour: number; changes: number }>;
  }> {
    try {
      let query = `
        SELECT 
          ph.*,
          t.board_id
        FROM priority_history ph
        JOIN tasks t ON ph.task_id = t.id
        WHERE ph.timestamp BETWEEN ? AND ?
      `;
      const params = [timeRange.start.toISOString(), timeRange.end.toISOString()];

      if (boardId) {
        query += ' AND t.board_id = ?';
        params.push(boardId);
      }

      const changes = await dbConnection.query(query, params);

      const changesCount = changes.length;
      const affectedTasks = new Set(changes.map((c: any) => c.task_id)).size;

      // Calculate average priority change
      const priorityChanges = changes
        .filter((c: any) => c.old_priority !== null)
        .map((c: any) => Math.abs(c.new_priority - c.old_priority));
      const avgPriorityChange =
        priorityChanges.length > 0
          ? priorityChanges.reduce((a, b) => a + b, 0) / priorityChanges.length
          : 0;

      // Find most active day
      const dayChanges = new Map<string, number>();
      changes.forEach((change: any) => {
        const day = new Date(change.timestamp).toISOString().split('T')[0];
        dayChanges.set(day, (dayChanges.get(day) ?? 0) + 1);
      });

      const mostActiveDay = Array.from(dayChanges.entries()).sort((a, b) => b[1] - a[1])[0] || [
        '',
        0,
      ];

      // Find busiest hours
      const hourChanges = new Map<number, number>();
      changes.forEach((change: any) => {
        const hour = new Date(change.timestamp).getHours();
        hourChanges.set(hour, (hourChanges.get(hour) ?? 0) + 1);
      });

      const busiestHours = Array.from(hourChanges.entries())
        .map(([hour, count]) => ({ hour, changes: count }))
        .sort((a, b) => b.changes - a.changes)
        .slice(0, 5);

      return {
        changes_count: changesCount,
        affected_tasks: affectedTasks,
        avg_priority_change: avgPriorityChange,
        most_active_day: { date: mostActiveDay[0], changes: mostActiveDay[1] },
        busiest_hours: busiestHours,
      };
    } catch (error) {
      logger.error('Failed to get priority change summary:', error);
      throw error;
    }
  }

  // Private helper methods

  private calculatePriorityTrend(changes: unknown[]): number {
    if (changes.length < 3) return 0;

    const priorities = changes.map((c: any) => c.new_priority);
    const n = priorities.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += priorities[i];
      sumXY += i * priorities[i];
      sumXX += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return slope / 10; // Normalize slope to reasonable range
  }
}
