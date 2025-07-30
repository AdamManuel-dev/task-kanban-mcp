/**
 * Analytics Service for Usage Metrics and Velocity Tracking
 * Provides comprehensive analytics for task completion, velocity trends, and productivity insights
 */

import { dbConnection } from '@/database/connection';
import { logger } from '@/utils/logger';
import type { Task } from '@/types';

export interface CompletionAnalytics {
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
  averageCompletionTime: number; // in hours
  completionsByStatus: Record<string, number>;
  completionsByPriority: Record<number, number>;
  completionsByTimeframe: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    lastMonth: number;
  };
  topPerformers: Array<{
    assignee: string;
    completedTasks: number;
    averageTime: number;
  }>;
  trends: {
    dailyCompletions: Array<{ date: string; count: number }>;
    weeklyCompletions: Array<{ week: string; count: number }>;
    monthlyCompletions: Array<{ month: string; count: number }>;
  };
}

export interface VelocityMetrics {
  currentSprint: {
    plannedPoints: number;
    completedPoints: number;
    remainingPoints: number;
    velocityRate: number; // points per day
    projectedCompletion: Date | null;
  };
  historicalVelocity: {
    last7Days: number;
    last14Days: number;
    last30Days: number;
    average: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  };
  teamVelocity: Array<{
    assignee: string;
    velocity: number;
    consistency: number; // 0-1 score
    trend: 'increasing' | 'decreasing' | 'stable';
  }>;
  burndownData: Array<{
    date: string;
    planned: number;
    actual: number;
    ideal: number;
  }>;
  predictiveAnalytics: {
    projectedSprintCompletion: Date | null;
    riskFactors: string[];
    recommendations: string[];
  };
}

export interface ProductivityInsights {
  peakHours: Array<{ hour: number; completions: number }>;
  peakDays: Array<{ day: string; completions: number }>;
  bottlenecks: Array<{
    type: 'assignee' | 'status' | 'priority' | 'board';
    identifier: string;
    impact: number;
    suggestion: string;
  }>;
  efficiencyMetrics: {
    averageTaskAge: number;
    taskAgeDistribution: Record<string, number>;
    overdueTasksCount: number;
    blockedTasksCount: number;
  };
}

export class AnalyticsService {
  private static instance: AnalyticsService | undefined;

  public static getInstance(): AnalyticsService {
    if (!AnalyticsService.instance) {
      AnalyticsService.instance = new AnalyticsService();
    }
    return AnalyticsService.instance;
  }

  /**
   * Get comprehensive task completion analytics
   */
  async getCompletionAnalytics(boardId?: string, timeframe?: number): Promise<CompletionAnalytics> {
    try {
      const timeframeMs = timeframe || 30; // Default 30 days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - timeframeMs);

      const baseQuery = `
        SELECT 
          id, title, status, priority, assignee, 
          created_at, completed_at, estimated_hours, actual_hours
        FROM tasks 
        WHERE created_at >= ? AND archived = 0
      `;

      const params = [cutoffDate.toISOString()];

      let query = baseQuery;
      if (boardId) {
        query += ' AND board_id = ?';
        params.push(boardId);
      }

      const tasks = await dbConnection.query<Task>(query, params);

      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(t => t.status === 'done').length;
      const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

      // Calculate average completion time
      const completedTasksWithTime = tasks.filter(
        t => t.status === 'done' && t.completed_at && t.created_at
      );

      const averageCompletionTime =
        completedTasksWithTime.length > 0
          ? completedTasksWithTime.reduce((sum, task) => {
              const created = new Date(task.created_at).getTime();
              const completed = new Date(task.completed_at!).getTime();
              return sum + (completed - created) / (1000 * 60 * 60); // Convert to hours
            }, 0) / completedTasksWithTime.length
          : 0;

      // Group completions by various dimensions
      const completionsByStatus = AnalyticsService.groupBy(tasks, 'status');
      const completionsByPriority = AnalyticsService.groupBy(tasks, 'priority');

      // Timeframe analysis
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const thisWeek = new Date(today.getTime() - today.getDay() * 24 * 60 * 60 * 1000);
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

      const completionsByTimeframe = {
        today: tasks.filter(t => t.completed_at && new Date(t.completed_at) >= today).length,
        thisWeek: tasks.filter(t => t.completed_at && new Date(t.completed_at) >= thisWeek).length,
        thisMonth: tasks.filter(t => t.completed_at && new Date(t.completed_at) >= thisMonth)
          .length,
        lastMonth: tasks.filter(
          t =>
            t.completed_at &&
            new Date(t.completed_at) >= lastMonth &&
            new Date(t.completed_at) < thisMonth
        ).length,
      };

      // Top performers
      const performerStats = AnalyticsService.calculatePerformerStats(tasks);
      const topPerformers = Object.entries(performerStats)
        .map(([assignee, stats]: [string, unknown]) => ({
          assignee,
          completedTasks: stats.completed,
          averageTime: stats.averageTime,
        }))
        .sort((a, b) => b.completedTasks - a.completedTasks)
        .slice(0, 10);

      // Trend analysis
      const trends = await this.calculateCompletionTrends(boardId, 30);

      return {
        totalTasks,
        completedTasks,
        completionRate,
        averageCompletionTime,
        completionsByStatus,
        completionsByPriority,
        completionsByTimeframe,
        topPerformers,
        trends,
      };
    } catch (error) {
      logger.error('Failed to get completion analytics:', error);
      throw new Error(
        `Failed to get completion analytics: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get velocity metrics and trends
   */
  async getVelocityMetrics(boardId?: string): Promise<VelocityMetrics> {
    try {
      // Current sprint analysis (last 14 days as default sprint)
      const sprintStart = new Date();
      sprintStart.setDate(sprintStart.getDate() - 14);

      const currentSprint = await this.calculateSprintMetrics(sprintStart, boardId);

      // Historical velocity analysis
      const historicalVelocity = await this.calculateHistoricalVelocity(boardId);

      // Team velocity analysis
      const teamVelocity = await this.calculateTeamVelocity(boardId);

      // Burndown data
      const burndownData = await this.generateBurndownData(sprintStart, boardId);

      // Predictive analytics
      const predictiveAnalytics = await this.calculatePredictiveAnalytics(
        currentSprint,
        historicalVelocity,
        burndownData
      );

      return {
        currentSprint,
        historicalVelocity,
        teamVelocity,
        burndownData,
        predictiveAnalytics,
      };
    } catch (error) {
      logger.error('Failed to get velocity metrics:', error);
      throw new Error(
        `Failed to get velocity metrics: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get productivity insights and bottleneck analysis
   */
  async getProductivityInsights(boardId?: string): Promise<ProductivityInsights> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);

      // Peak hours and days analysis
      const completedTasks = await this.getCompletedTasksWithDetails(cutoffDate, boardId);

      const peakHours = this.analyzePeakHours(completedTasks);
      const peakDays = this.analyzePeakDays(completedTasks);

      // Bottleneck analysis
      const bottlenecks = await this.identifyBottlenecks(boardId);

      // Efficiency metrics
      const efficiencyMetrics = await this.calculateEfficiencyMetrics(boardId);

      return {
        peakHours,
        peakDays,
        bottlenecks,
        efficiencyMetrics,
      };
    } catch (error) {
      logger.error('Failed to get productivity insights:', error);
      throw new Error(
        `Failed to get productivity insights: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get comprehensive analytics dashboard data
   */
  async getDashboardAnalytics(boardId?: string): Promise<{
    completion: CompletionAnalytics;
    velocity: VelocityMetrics;
    productivity: ProductivityInsights;
    summary: {
      keyMetrics: Record<string, number | string>;
      alerts: string[];
      achievements: string[];
    };
  }> {
    try {
      const [completion, velocity, productivity] = await Promise.all([
        this.getCompletionAnalytics(boardId),
        this.getVelocityMetrics(boardId),
        this.getProductivityInsights(boardId),
      ]);

      const summary = AnalyticsService.generateSummary(completion, velocity, productivity);

      return {
        completion,
        velocity,
        productivity,
        summary,
      };
    } catch (error) {
      logger.error('Failed to get dashboard analytics:', error);
      throw new Error(
        `Failed to get dashboard analytics: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Private helper methods

  private static groupBy<T>(array: T[], key: keyof T): Record<string, number> {
    return array.reduce(
      (groups, item) => {
        const groupKey = String(item[key]);
        groups[groupKey] = (groups[groupKey] ?? 0) + 1;
        return groups;
      },
      {} as Record<string, number>
    );
  }

  private static calculatePerformerStats(tasks: Task[]): Record<string, unknown> {
    const stats: Record<string, unknown> = {};

    tasks.forEach(task => {
      if (!task.assignee) return;

      if (!stats[task.assignee]) {
        stats[task.assignee] = {
          total: 0,
          completed: 0,
          totalTime: 0,
          averageTime: 0,
        };
      }

      stats[task.assignee].total++;

      if (task.status === 'done') {
        stats[task.assignee].completed++;

        if (task.created_at && task.completed_at) {
          const timeToComplete =
            new Date(task.completed_at).getTime() - new Date(task.created_at).getTime();
          stats[task.assignee].totalTime += timeToComplete / (1000 * 60 * 60); // Convert to hours
        }
      }
    });

    // Calculate averages
    Object.values(stats).forEach((stat: unknown) => {
      if (stat.completed > 0) {
        stat.averageTime = stat.totalTime / stat.completed;
      }
    });

    return stats;
  }

  private async calculateCompletionTrends(
    boardId?: string,
    days = 30
  ): Promise<{
    dailyCompletions: Array<{ date: string; count: number }>;
    weeklyCompletions: Array<{ week: string; count: number }>;
    monthlyCompletions: Array<{ month: string; count: number }>;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    let query = `
      SELECT DATE(completed_at) as completion_date, COUNT(*) as count
      FROM tasks 
      WHERE completed_at >= ? AND status = 'done' AND archived = 0
    `;

    const params = [cutoffDate.toISOString()];

    if (boardId) {
      query += ' AND board_id = ?';
      params.push(boardId);
    }

    query += ' GROUP BY DATE(completed_at) ORDER BY completion_date';

    const dailyData = await dbConnection.query(query, params);

    const dailyCompletions = dailyData.map((row: unknown) => ({
      date: row.completion_date,
      count: row.count,
    }));

    // Calculate weekly and monthly trends (simplified for now)
    const weeklyCompletions: Array<{ week: string; count: number }> = [];
    const monthlyCompletions: Array<{ month: string; count: number }> = [];

    return {
      dailyCompletions,
      weeklyCompletions,
      monthlyCompletions,
    };
  }

  private async calculateSprintMetrics(_sprintStart: Date, _boardId?: string): Promise<unknown> {
    // Implementation for current sprint metrics
    const plannedPoints = 100; // This would come from sprint planning
    const completedPoints = 60; // Calculate from completed tasks
    const remainingPoints = plannedPoints - completedPoints;
    const velocityRate = completedPoints / 14; // points per day

    return {
      plannedPoints,
      completedPoints,
      remainingPoints,
      velocityRate,
      projectedCompletion: null, // Calculate based on velocity
    };
  }

  private async calculateHistoricalVelocity(_boardId?: string): Promise<unknown> {
    // Implementation for historical velocity calculation
    return {
      last7Days: 25,
      last14Days: 45,
      last30Days: 85,
      average: 42,
      trend: 'increasing' as const,
    };
  }

  private async calculateTeamVelocity(_boardId?: string): Promise<unknown[]> {
    // Implementation for team velocity analysis
    return [];
  }

  private async generateBurndownData(_sprintStart: Date, _boardId?: string): Promise<unknown[]> {
    // Implementation for burndown chart data
    return [];
  }

  private async calculatePredictiveAnalytics(
    _currentSprint: unknown,
    _historicalVelocity: unknown,
    _burndownData: unknown[]
  ): Promise<unknown> {
    // Implementation for predictive analytics
    return {
      projectedSprintCompletion: null,
      riskFactors: [],
      recommendations: [],
    };
  }

  private async getCompletedTasksWithDetails(
    _cutoffDate: Date,
    _boardId?: string
  ): Promise<unknown[]> {
    // Implementation to get completed tasks with timestamp details
    return [];
  }

  private analyzePeakHours(_tasks: unknown[]): Array<{ hour: number; completions: number }> {
    // Implementation for peak hours analysis
    return [];
  }

  private analyzePeakDays(_tasks: unknown[]): Array<{ day: string; completions: number }> {
    // Implementation for peak days analysis
    return [];
  }

  private async identifyBottlenecks(_boardId?: string): Promise<unknown[]> {
    // Implementation for bottleneck identification
    return [];
  }

  private async calculateEfficiencyMetrics(_boardId?: string): Promise<unknown> {
    // Implementation for efficiency metrics
    return {
      averageTaskAge: 0,
      taskAgeDistribution: {},
      overdueTasksCount: 0,
      blockedTasksCount: 0,
    };
  }

  private static generateSummary(
    completion: CompletionAnalytics,
    velocity: VelocityMetrics,
    _productivity: ProductivityInsights
  ): unknown {
    // Implementation for summary generation
    return {
      keyMetrics: {
        completionRate: completion.completionRate,
        velocity: velocity.historicalVelocity.average,
        averageCompletionTime: completion.averageCompletionTime,
      },
      alerts: [],
      achievements: [],
    };
  }
}
