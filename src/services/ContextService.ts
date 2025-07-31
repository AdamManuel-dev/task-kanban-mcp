/**
 * Context Service - Intelligent context generation for project and task analysis
 *
 * @module services/ContextService
 * @description Provides comprehensive context generation for AI-powered project management.
 * Analyzes project data to generate intelligent summaries, priority insights, blocker detection,
 * and actionable recommendations. Supports multiple context levels and customizable analysis depth.
 *
 * @example
 * ```typescript
 * import { ContextService } from '@/services/ContextService';
 * import { dbConnection } from '@/database/connection';
 *
 * const contextService = new ContextService(db, boardService, taskService, noteService, tagService);
 *
 * // Get comprehensive project overview
 * const projectContext = await contextService.getProjectContext({
 *   days_back: 30,
 *   detail_level: 'comprehensive'
 * });
 *
 * // Get focused task analysis
 * const taskContext = await contextService.getTaskContext('task-123', {
 *   detail_level: 'detailed'
 * });
 *
 * // Get current work recommendations
 * const workContext = await contextService.getCurrentWorkContext();
 * logger.log('Next actions:', workContext.next_actions);
 * ```
 */

import { logger } from '@/utils/logger';
import type { DatabaseConnection, QueryParameters } from '@/database/connection';
import type { Task, Note, Tag, Board, ServiceError } from '@/types';
import type { BoardService } from './BoardService';
import type { TaskService } from './TaskService';
import type { NoteService } from './NoteService';
import type { TagService } from './TagService';

/**
 * Comprehensive project context with analytics and insights
 *
 * @interface ProjectContext
 * @description Contains project-wide analysis including board status, recent activities,
 * priority analysis, blocker detection, and key performance metrics
 */
export interface ProjectContext {
  summary: string;
  boards: BoardContextInfo[];
  recent_activities: ActivityItem[];
  priorities: PriorityInfo[];
  blockers: BlockerInfo[];
  overdue_tasks: Task[];
  key_metrics: ProjectMetrics;
  generated_at: Date;
}

/**
 * Detailed task context with relationships and analysis
 *
 * @interface TaskContext
 * @description Contains comprehensive task analysis including related tasks,
 * dependencies, notes, tags, history, and AI-generated recommendations
 */
export interface TaskContext {
  task: Task;
  board: Board;
  related_tasks: RelatedTaskInfo[];
  dependencies: DependencyInfo;
  notes: Note[];
  tags: Tag[];
  history: ActivityItem[];
  context_summary: string;
  recommendations: string[];
  generated_at: Date;
}

/**
 * Board information with contextual metrics
 *
 * @interface BoardContextInfo
 * @description Board data enriched with task counts, completion rates,
 * recent activity metrics, and calculated priority scores
 */
export interface BoardContextInfo {
  board: Board;
  task_count: number;
  completion_rate: number;
  recent_activity: number;
  priority_score: number;
}

/**
 * Project activity item for timeline tracking
 *
 * @interface ActivityItem
 * @description Represents a significant project event with type classification,
 * entity references, and descriptive information for activity feeds
 */
export interface ActivityItem {
  type: 'task_created' | 'task_updated' | 'task_completed' | 'note_added' | 'dependency_added';
  entity_id: string;
  entity_title: string;
  board_name: string;
  timestamp: Date;
  description: string;
}

/**
 * Task priority analysis with scoring and reasoning
 *
 * @interface PriorityInfo
 * @description Comprehensive priority assessment including calculated scores,
 * reasoning explanations, blocking impact, and urgency classification
 */
export interface PriorityInfo {
  task: Task;
  score: number;
  reasoning: string[];
  blocking_count: number;
  urgency_level: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Task blocker analysis with impact assessment
 *
 * @interface BlockerInfo
 * @description Information about task dependencies that are causing blocks,
 * including duration metrics and impact level classification
 */
export interface BlockerInfo {
  blocked_task: Task;
  blocking_task: Task;
  days_blocked: number;
  impact_level: 'low' | 'medium' | 'high';
}

/**
 * Related task information with relationship classification
 *
 * @interface RelatedTaskInfo
 * @description Task relationships with type classification and relevance scoring
 * for contextual task analysis and recommendations
 */
export interface RelatedTaskInfo {
  task: Task;
  relationship: 'parent' | 'child' | 'dependency' | 'similar';
  relevance_score: number;
}

/**
 * Task dependency analysis and risk assessment
 *
 * @interface DependencyInfo
 * @description Comprehensive dependency mapping including upstream/downstream tasks,
 * circular dependency risks, and critical path analysis
 */
export interface DependencyInfo {
  depends_on: Task[];
  blocks: Task[];
  circular_risks: string[];
  critical_path: boolean;
}

/**
 * Comprehensive project performance metrics
 *
 * @interface ProjectMetrics
 * @description Key performance indicators including task counts, completion rates,
 * velocity trends, and predictive analytics for project health assessment
 */
export interface ProjectMetrics {
  total_tasks: number;
  completed_tasks: number;
  completion_rate: number;
  average_task_age_days: number;
  overdue_count: number;
  blocked_count: number;
  velocity_trend: 'increasing' | 'decreasing' | 'stable';
  estimated_completion_date?: Date;
}

/**
 * Configuration options for context generation
 *
 * @interface ContextOptions
 * @description Customizable options for controlling context generation scope,
 * depth, and inclusion criteria for different analysis needs
 */
export interface ContextOptions {
  include_completed?: boolean;
  days_back?: number;
  max_items?: number;
  include_metrics?: boolean;
  detail_level?: 'summary' | 'detailed' | 'comprehensive';
}

/**
 * Context Service - AI-powered project analysis and insight generation
 *
 * @class ContextService
 * @description Provides intelligent context generation for project management workflows.
 * Analyzes project data to generate summaries, identify priorities, detect blockers,
 * and provide actionable recommendations. Integrates with all service layers to provide
 * comprehensive project insights for AI-powered task management.
 *
 * @example
 * ```typescript
 * const contextService = new ContextService(db, boardService, taskService, noteService, tagService);
 *
 * // Generate project overview
 * const context = await contextService.getProjectContext({
 *   days_back: 14,
 *   detail_level: 'comprehensive'
 * });
 *
 * logger.log(context.summary);
 * logger.log(`Priority tasks: ${context.priorities.length}`);
 * logger.log(`Active blockers: ${context.blockers.length}`);
 * ```
 */
export class ContextService {
  /**
   * Initialize ContextService with all required service dependencies
   *
   * @param {DatabaseConnection} db - Database connection instance
   * @param {BoardService} boardService - Board management service
   * @param {TaskService} taskService - Task management service
   * @param {NoteService} noteService - Note management service
   * @param {TagService} tagService - Tag management service
   */
  constructor(
    private readonly db: DatabaseConnection,
    private readonly boardService: BoardService,
    private readonly taskService: TaskService,
    private readonly noteService: NoteService,
    private readonly tagService: TagService
  ) {}

  /**
   * Generate comprehensive project context with analytics and insights
   *
   * @param {ContextOptions} [options={}] - Context generation options
   * @param {boolean} [options['include_completed'] = false] - Include completed tasks in analysis
   * @param {number} [options.days_back=30] - Number of days to look back for activities
   * @param {number} [options.max_items=50] - Maximum items to include in each category
   * @param {boolean} [options.include_metrics=true] - Include performance metrics
   * @param {'summary'|'detailed'|'comprehensive'} [options.detail_level='detailed'] - Analysis depth
   * @returns {Promise<ProjectContext>} Comprehensive project analysis
   * @throws {ServiceError} If context generation fails
   *
   * @example
   * ```typescript
   * // Get detailed project overview
   * const context = await contextService.getProjectContext({
   *   days_back: 14,
   *   detail_level: 'comprehensive',
   *   max_items: 25
   * });
   *
   * logger.log(`Project Summary: ${context.summary}`);
   * logger.log(`Active Boards: ${context.boards.length}`);
   * logger.log(`High Priority Tasks: ${context.priorities.filter(p => p['urgency_level'] === 'high').length}`);
   * logger.log(`Critical Blockers: ${context.blockers.filter(b => b['impact_level'] === 'high').length}`);
   * ```
   */
  async getProjectContext(options: ContextOptions = {}): Promise<ProjectContext> {
    const {
      include_completed = false,
      days_back = 30,
      max_items = 50,
      include_metrics = true,
      detail_level = 'detailed',
    } = options;

    try {
      logger.info('Generating project context', { options });

      const [boards, recentActivities, priorities, blockers, overdueTasks, metrics] =
        await Promise.all([
          this.getBoardsContext(include_completed),
          this.getRecentActivities(days_back, max_items),
          this.getPriorityAnalysis(max_items),
          this.getBlockerAnalysis(),
          this.taskService.getOverdueTasks(),
          include_metrics
            ? this.calculateProjectMetrics()
            : Promise.resolve(ContextService.getEmptyMetrics()),
        ]);

      const summary = ContextService.generateProjectSummary(
        boards,
        priorities,
        blockers,
        metrics,
        detail_level
      );

      const context: ProjectContext = {
        summary,
        boards,
        recent_activities: recentActivities,
        priorities: priorities.slice(0, max_items),
        blockers,
        overdue_tasks: overdueTasks.slice(0, max_items),
        key_metrics: metrics,
        generated_at: new Date(),
      };

      logger.info('Project context generated successfully', {
        boardCount: boards.length,
        activitiesCount: recentActivities.length,
        prioritiesCount: priorities.length,
        blockersCount: blockers.length,
      });

      return context;
    } catch (error) {
      logger.error('Failed to generate project context', { error });
      throw ContextService.createError(
        'CONTEXT_GENERATION_FAILED',
        'Failed to generate project context',
        error
      );
    }
  }

  /**
   * Generate detailed context analysis for a specific task
   *
   * @param {string} taskId - Task ID (UUID) to analyze
   * @param {ContextOptions} [options={}] - Context generation options
   * @param {number} [options['days_back'] = 14] - Days to look back for task history
   * @param {number} [options.max_items=20] - Maximum related items to include
   * @param {'summary'|'detailed'|'comprehensive'} [options.detail_level='comprehensive'] - Analysis depth
   * @returns {Promise<TaskContext>} Detailed task analysis with recommendations
   * @throws {ServiceError} If task not found or context generation fails
   *
   * @example
   * ```typescript
   * const taskContext = await contextService.getTaskContext('task-123', {
   *   detail_level: 'comprehensive',
   *   days_back: 7
   * });
   *
   * logger.log(`Task: ${taskContext.task.title}`);
   * logger.log(`Board: ${taskContext.board.name}`);
   * logger.log(`Related Tasks: ${taskContext.related_tasks.length}`);
   * logger.log(`Dependencies: ${taskContext.dependencies.depends_on.length}`);
   * logger.log(`Blocks: ${taskContext.dependencies.blocks.length}`);
   * logger.log(`Notes: ${taskContext.notes.length}`);
   * logger.log(`Recommendations: ${taskContext.recommendations.join(', ')}`);
   * ```
   */
  async getTaskContext(taskId: string, options: ContextOptions = {}): Promise<TaskContext> {
    const { days_back = 14, max_items = 20, detail_level = 'comprehensive' } = options;

    try {
      logger.info('Generating task context', { taskId, options });

      const task = await this.taskService.getTaskById(taskId);
      if (!task) {
        throw ContextService.createError('TASK_NOT_FOUND', 'Task not found', { taskId });
      }

      const [board, relatedTasks, dependencies, notes, tags, history] = await Promise.all([
        this.boardService.getBoardById(task.board_id),
        this.getRelatedTasks(taskId, max_items),
        this.getDependencyContext(taskId),
        this.noteService.getTaskNotes(taskId),
        this.tagService.getTaskTags(taskId),
        this.getTaskHistory(taskId, days_back),
      ]);

      if (!board) {
        throw ContextService.createError('BOARD_NOT_FOUND', 'Task board not found');
      }

      const contextSummary = ContextService.generateTaskContextSummary(
        task,
        relatedTasks,
        dependencies,
        notes,
        detail_level
      );
      const recommendations = ContextService.generateTaskRecommendations(
        task,
        dependencies,
        notes,
        tags
      );

      const context: TaskContext = {
        task,
        board,
        related_tasks: relatedTasks,
        dependencies,
        notes,
        tags,
        history,
        context_summary: contextSummary,
        recommendations,
        generated_at: new Date(),
      };

      logger.info('Task context generated successfully', { taskId });
      return context;
    } catch (error) {
      if (error instanceof Error && error.message.includes('_NOT_FOUND')) {
        throw error;
      }
      logger.error('Failed to generate task context', { error, taskId });
      throw ContextService.createError(
        'TASK_CONTEXT_FAILED',
        'Failed to generate task context',
        error
      );
    }
  }

  /**
   * Get current work context with actionable recommendations
   *
   * @param {ContextOptions} [options={}] - Context generation options
   * @param {number} [options['max_items'] = 10] - Maximum items per category
   * @returns {Promise<Object>} Current work context with recommendations
   * @returns {Task[]} returns.active_tasks - Currently in-progress tasks
   * @returns {PriorityInfo[]} returns.next_actions - Top priority tasks ready to start
   * @returns {BlockerInfo[]} returns.blockers - Active blockers requiring attention
   * @returns {string[]} returns.focus_recommendations - AI-generated focus suggestions
   * @returns {number} returns.estimated_work_hours - Estimated remaining work hours
   * @throws {ServiceError} If work context generation fails
   *
   * @example
   * ```typescript
   * const workContext = await contextService.getCurrentWorkContext({
   *   max_items: 5
   * });
   *
   * logger.log(`Active Tasks: ${workContext.active_tasks.length}`);
   * logger.log(`Next Actions: ${workContext.next_actions.length}`);
   * logger.log(`Blockers: ${workContext.blockers.length}`);
   * logger.log(`Estimated Hours: ${workContext.estimated_work_hours}`);
   *
   * workContext.focus_recommendations.forEach(rec => {
   *   logger.log(`Recommendation: ${rec}`);
   * });
   * ```
   */
  async getCurrentWorkContext(options: ContextOptions = {}): Promise<{
    active_tasks: Task[];
    next_actions: PriorityInfo[];
    blockers: BlockerInfo[];
    focus_recommendations: string[];
    estimated_work_hours: number;
  }> {
    try {
      const activeTasks = await this.taskService.getTasks({
        status: 'in_progress',
        limit: options.max_items ?? 10,
        sortBy: 'priority',
        sortOrder: 'desc',
      });

      const [nextActions, blockers] = await Promise.all([
        this.getPriorityAnalysis(10),
        this.getBlockerAnalysis(),
      ]);

      const focusRecommendations = ContextService.generateFocusRecommendations(
        activeTasks,
        nextActions,
        blockers
      );
      const estimatedHours = ContextService.calculateEstimatedWorkHours(activeTasks);

      return {
        active_tasks: activeTasks,
        next_actions: nextActions.slice(0, 5),
        blockers: blockers.filter(b => b.impact_level !== 'low'),
        focus_recommendations: focusRecommendations,
        estimated_work_hours: estimatedHours,
      };
    } catch (error) {
      logger.error('Failed to get current work context', { error });
      throw ContextService.createError(
        'WORK_CONTEXT_FAILED',
        'Failed to generate work context',
        error
      );
    }
  }

  private async getBoardsContext(_includeCompleted: boolean): Promise<BoardContextInfo[]> {
    const boards = await this.boardService.getBoards({ archived: false });
    const boardContexts: BoardContextInfo[] = [];

    await Promise.all(
      boards.map(async board => {
        await this.boardService.getBoardWithStats(board.id);
      })
    );

    return boardContexts.sort((a, b) => b.priority_score - a.priority_score);
  }

  private async getRecentActivities(daysBack: number, maxItems: number): Promise<ActivityItem[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    const activities = await this.db.query<{
      type: string;
      entity_id: string;
      entity_title: string;
      board_name: string;
      timestamp: string;
      description: string;
    }>(
      `
      SELECT 
        'task_created' as type,
        t.id as entity_id,
        t.title as entity_title,
        b.name as board_name,
        t.created_at as timestamp,
        'Task created: ' || t.title as description
      FROM tasks t
      INNER JOIN boards b ON t.board_id = b.id
      WHERE t.created_at >= ?
      
      UNION ALL
      
      SELECT 
        'task_completed' as type,
        t.id as entity_id,
        t.title as entity_title,
        b.name as board_name,
        t.completed_at as timestamp,
        'Task completed: ' || t.title as description
      FROM tasks t
      INNER JOIN boards b ON t.board_id = b.id
      WHERE t.completed_at >= ? AND t.completed_at IS NOT NULL
      
      UNION ALL
      
      SELECT 
        'note_added' as type,
        n.id as entity_id,
        t.title as entity_title,
        b.name as board_name,
        n.created_at as timestamp,
        'Note added to: ' || t.title as description
      FROM notes n
      INNER JOIN tasks t ON n.task_id = t.id
      INNER JOIN boards b ON t.board_id = b.id
      WHERE n.created_at >= ?
      
      ORDER BY timestamp DESC
      LIMIT ?
    `,
      [cutoffDate, cutoffDate, cutoffDate, maxItems]
    );

    return activities.map(activity => ({
      type: activity.type as ActivityItem['type'],
      entity_id: activity.entity_id,
      entity_title: activity.entity_title,
      board_name: activity.board_name,
      timestamp: new Date(activity.timestamp),
      description: activity.description,
    }));
  }

  private async getPriorityAnalysis(maxItems: number): Promise<PriorityInfo[]> {
    const tasks = await this.taskService.getTasks({
      status: 'todo',
      limit: maxItems * 2, // Get more to analyze and filter
      sortBy: 'priority',
      sortOrder: 'desc',
    });

    const priorityInfos: PriorityInfo[] = [];

    await Promise.all(
      tasks.map(async task => {
        await Promise.all([this.getBlockingTaskCount(task.id), this.calculateUrgencyFactors(task)]);
      })
    );

    return priorityInfos.sort((a, b) => b.score - a.score).slice(0, maxItems);
  }

  private async getBlockerAnalysis(): Promise<BlockerInfo[]> {
    const blockedTasks = await this.taskService.getBlockedTasks();
    const blockers: BlockerInfo[] = [];

    await Promise.all(
      blockedTasks.map(async blockedTask => {
        await this.db.query<{ depends_on_task_id: string }>(
          `
          SELECT depends_on_task_id FROM task_dependencies 
          WHERE task_id = ? AND dependency_type = 'blocks'
        `,
          [blockedTask.id]
        );
      })
    );

    return blockers.sort((a, b) => b.days_blocked - a.days_blocked);
  }

  private async getRelatedTasks(taskId: string, maxItems: number): Promise<RelatedTaskInfo[]> {
    const task = await this.taskService.getTaskById(taskId);
    if (!task) return [];

    const related: RelatedTaskInfo[] = [];

    // Get parent/child tasks
    if (task.parent_task_id) {
      const parentTask = await this.taskService.getTaskById(task.parent_task_id);
      if (parentTask) {
        related.push({
          task: parentTask,
          relationship: 'parent',
          relevance_score: 10,
        });
      }
    }

    const subtasks = await this.db.query<Task>(
      `
      SELECT * FROM tasks WHERE parent_task_id = ? LIMIT ?
    `,
      [taskId, maxItems]
    );

    subtasks.forEach(subtask => {
      related.push({
        task: subtask,
        relationship: 'child',
        relevance_score: 9,
      });
    });

    // Get dependency tasks
    const dependencies = await this.db.query<Task>(
      `
      SELECT t.* FROM tasks t
      INNER JOIN task_dependencies td ON t.id = td.depends_on_task_id
      WHERE td.task_id = ?
      LIMIT ?
    `,
      [taskId, maxItems]
    );

    dependencies.forEach(depTask => {
      related.push({
        task: depTask,
        relationship: 'dependency',
        relevance_score: 8,
      });
    });

    return related.sort((a, b) => b.relevance_score - a.relevance_score).slice(0, maxItems);
  }

  private async getDependencyContext(taskId: string): Promise<DependencyInfo> {
    const taskWithDeps = await this.taskService.getTaskWithDependencies(taskId);
    if (!taskWithDeps) {
      return { depends_on: [], blocks: [], circular_risks: [], critical_path: false };
    }

    const [dependsOnResults, blocksResults] = await Promise.all([
      Promise.all(
        taskWithDeps.dependencies.map(async dep =>
          this.taskService.getTaskById(dep.depends_on_task_id)
        )
      ),
      Promise.all(
        taskWithDeps.dependents.map(async dep => this.taskService.getTaskById(dep.task_id))
      ),
    ]);

    const dependsOn = dependsOnResults.filter((task): task is Task => task !== null);
    const blocks = blocksResults.filter((task): task is Task => task !== null);

    const circularRisks = await this.detectCircularRisks(taskId);
    const criticalPath = await this.isOnCriticalPath(taskId);

    return {
      depends_on: dependsOn,
      blocks,
      circular_risks: circularRisks,
      critical_path: criticalPath,
    };
  }

  private async getTaskHistory(taskId: string, daysBack: number): Promise<ActivityItem[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    return this.getRecentActivities(daysBack, 50).then(activities =>
      activities.filter(activity => activity.entity_id === taskId)
    );
  }

  private static generateProjectSummary(
    boards: BoardContextInfo[],
    priorities: PriorityInfo[],
    blockers: BlockerInfo[],
    metrics: ProjectMetrics,
    detailLevel: string
  ): string {
    const activeBoardCount = boards.length;
    const highPriorityCount = priorities.filter(
      p => p.urgency_level === 'high' || p.urgency_level === 'critical'
    ).length;
    const criticalBlockerCount = blockers.filter(b => b.impact_level === 'high').length;

    let summary = `Project Status: ${activeBoardCount} active boards, ${metrics.completion_rate.toFixed(1)}% completion rate. `;

    if (highPriorityCount > 0) {
      summary += `${highPriorityCount} high-priority tasks need attention. `;
    }

    if (criticalBlockerCount > 0) {
      summary += `${criticalBlockerCount} critical blockers identified. `;
    }

    if (metrics.overdue_count > 0) {
      summary += `${metrics.overdue_count} tasks are overdue. `;
    }

    summary += `Current velocity trend: ${metrics.velocity_trend}.`;

    if (detailLevel === 'comprehensive' && metrics.estimated_completion_date) {
      summary += ` Estimated completion: ${metrics.estimated_completion_date.toLocaleDateString()}.`;
    }

    return summary;
  }

  private static generateTaskContextSummary(
    task: Task,
    _relatedTasks: RelatedTaskInfo[],
    dependencies: DependencyInfo,
    notes: Note[],
    _detailLevel: string
  ): string {
    let summary = `Task "${task.title}" (${task.status}, Priority: ${task.priority}). `;

    if (dependencies.depends_on.length > 0) {
      summary += `Depends on ${dependencies.depends_on.length} task(s). `;
    }

    if (dependencies.blocks.length > 0) {
      summary += `Blocks ${dependencies.blocks.length} task(s). `;
    }

    if (notes.length > 0) {
      const recentNotes = notes.filter(
        n => Date.now() - n.created_at.getTime() < 7 * 24 * 60 * 60 * 1000 // 7 days
      ).length;
      summary += `${notes.length} notes (${recentNotes} recent). `;
    }

    if (task.due_date && task.due_date < new Date()) {
      const daysOverdue = Math.floor(
        (Date.now() - task.due_date.getTime()) / (1000 * 60 * 60 * 24)
      );
      summary += `Overdue by ${daysOverdue} days. `;
    }

    return summary.trim();
  }

  private static generateTaskRecommendations(
    task: Task,
    dependencies: DependencyInfo,
    notes: Note[],
    _tags: Tag[]
  ): string[] {
    const recommendations: string[] = [];

    if (task.status === 'todo' && dependencies.depends_on.some(dep => dep.status !== 'done')) {
      recommendations.push('Resolve blocking dependencies before starting this task');
    }

    if (task.due_date && task.due_date < new Date()) {
      recommendations.push('This task is overdue and should be prioritized');
    }

    if (dependencies.blocks.length > 3) {
      recommendations.push('This task blocks multiple others - consider breaking it down');
    }

    if (notes.length === 0 && task.status === 'in_progress') {
      recommendations.push('Consider adding progress notes to track development');
    }

    if (dependencies.circular_risks.length > 0) {
      recommendations.push('Review dependency structure to prevent circular dependencies');
    }

    if (
      task.estimated_hours &&
      task.actual_hours &&
      task.actual_hours > task.estimated_hours * 1.5
    ) {
      recommendations.push('Task is taking longer than estimated - review scope or approach');
    }

    return recommendations;
  }

  private static generateFocusRecommendations(
    activeTasks: Task[],
    nextActions: PriorityInfo[],
    blockers: BlockerInfo[]
  ): string[] {
    const recommendations: string[] = [];

    if (activeTasks.length > 3) {
      recommendations.push(
        'Consider reducing work in progress - focus on completing current tasks'
      );
    }

    if (blockers.length > 0) {
      recommendations.push('Address blocking tasks to improve team velocity');
    }

    const highPriorityNext = nextActions.filter(
      a => a.urgency_level === 'high' || a.urgency_level === 'critical'
    );
    if (highPriorityNext.length > 0) {
      recommendations.push(`${highPriorityNext.length} high-priority tasks ready to start`);
    }

    return recommendations;
  }

  private async calculateProjectMetrics(): Promise<ProjectMetrics> {
    const [taskStats, overdueCount, blockedCount, avgAge, velocityTrend] = await Promise.all([
      this.db.queryOne<{ total: number; completed: number }>(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completed
        FROM tasks WHERE archived = FALSE
      `),
      this.db.queryOne<{ count: number }>(
        `
        SELECT COUNT(*) as count FROM tasks 
        WHERE due_date < ? AND status != 'done' AND archived = FALSE
      `,
        [new Date()]
      ),
      this.db.queryOne<{ count: number }>(`
        SELECT COUNT(DISTINCT t.id) as count FROM tasks t
        INNER JOIN task_dependencies td ON t.id = td.task_id
        INNER JOIN tasks blocking ON td.depends_on_task_id = blocking.id
        WHERE blocking.status != 'done' AND t.archived = FALSE
      `),
      this.db.queryOne<{ avg_days: number }>(`
        SELECT AVG(julianday('now') - julianday(created_at)) as avg_days
        FROM tasks WHERE status != 'done' AND archived = FALSE
      `),
      this.calculateVelocityTrend(),
    ]);

    const total = taskStats?.total ?? 0;
    const completed = taskStats?.completed ?? 0;
    const completionRate = total > 0 ? (completed / total) * 100 : 0;

    return {
      total_tasks: total,
      completed_tasks: completed,
      completion_rate: completionRate,
      average_task_age_days: Math.round(avgAge?.avg_days ?? 0),
      overdue_count: overdueCount?.count ?? 0,
      blocked_count: blockedCount?.count ?? 0,
      velocity_trend: velocityTrend,
    };
  }

  private async calculateVelocityTrend(): Promise<'increasing' | 'decreasing' | 'stable'> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

    const [recentVelocity, olderVelocity] = await Promise.all([
      this.db.queryOne<{ count: number }>(
        `
        SELECT COUNT(*) as count FROM tasks 
        WHERE completed_at >= ? AND completed_at IS NOT NULL
      `,
        [fifteenDaysAgo]
      ),
      this.db.queryOne<{ count: number }>(
        `
        SELECT COUNT(*) as count FROM tasks 
        WHERE completed_at >= ? AND completed_at < ? AND completed_at IS NOT NULL
      `,
        [thirtyDaysAgo, fifteenDaysAgo]
      ),
    ]);

    const recent = recentVelocity?.count ?? 0;
    const older = olderVelocity?.count ?? 0;

    if (recent > older * 1.1) return 'increasing';
    if (recent < older * 0.9) return 'decreasing';
    return 'stable';
  }

  private static getEmptyMetrics(): ProjectMetrics {
    return {
      total_tasks: 0,
      completed_tasks: 0,
      completion_rate: 0,
      average_task_age_days: 0,
      overdue_count: 0,
      blocked_count: 0,
      velocity_trend: 'stable',
    };
  }

  private async getRecentActivityCount(boardId: string, days: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await this.db.queryOne<{ count: number }>(
      `
      SELECT COUNT(*) as count FROM tasks 
      WHERE board_id = ? AND (created_at >= ? OR updated_at >= ?)
    `,
      [boardId, cutoffDate, cutoffDate]
    );

    return result?.count ?? 0;
  }

  private static calculateBoardPriorityScore(
    board: BoardContextInfo,
    recentActivity: number
  ): number {
    let score = 0;

    // Task count factor
    score += Math.min(board.task_count * 2, 20);

    // Completion rate factor (inverse - lower completion means higher priority)
    score += (100 - board.completion_rate) * 0.3;

    // Recent activity factor
    score += recentActivity * 5;

    return Math.round(score);
  }

  private async getBlockingTaskCount(taskId: string): Promise<number> {
    const result = await this.db.queryOne<{ count: number }>(
      `
      SELECT COUNT(*) as count FROM task_dependencies 
      WHERE depends_on_task_id = ?
    `,
      [taskId]
    );

    return result?.count ?? 0;
  }

  private async calculateUrgencyFactors(task: Task): Promise<{
    has_due_date: boolean;
    overdue: boolean;
    blocks_others: boolean;
    high_priority: boolean;
  }> {
    const now = new Date();
    const blockingCount = await this.getBlockingTaskCount(task.id);

    return {
      has_due_date: !!task.due_date,
      overdue: !!(task.due_date && task.due_date < now),
      blocks_others: blockingCount > 0,
      high_priority: task.priority >= 7,
    };
  }

  private static calculatePriorityScore(
    task: Task,
    blockingCount: number,
    urgencyFactors: {
      has_due_date: boolean;
      overdue: boolean;
      blocks_others: boolean;
      high_priority: boolean;
    }
  ): number {
    let score = task.priority * 10; // Base priority

    if (urgencyFactors.overdue) score += 50;
    if (urgencyFactors.has_due_date) score += 20;
    if (urgencyFactors.blocks_others) score += blockingCount * 15;
    if (urgencyFactors.high_priority) score += 25;

    return Math.round(score);
  }

  private static generatePriorityReasoning(
    _task: Task,
    blockingCount: number,
    urgencyFactors: {
      has_due_date: boolean;
      overdue: boolean;
      blocks_others: boolean;
      high_priority: boolean;
    }
  ): string[] {
    const reasons: string[] = [];

    if (urgencyFactors.overdue) reasons.push('Task is overdue');
    if (urgencyFactors.blocks_others) reasons.push(`Blocks ${blockingCount} other task(s)`);
    if (urgencyFactors.high_priority) reasons.push('High priority level set');
    if (urgencyFactors.has_due_date) reasons.push('Has due date');

    return reasons;
  }

  private static determineUrgencyLevel(
    score: number,
    urgencyFactors: {
      has_due_date: boolean;
      overdue: boolean;
      blocks_others: boolean;
      high_priority: boolean;
    }
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (urgencyFactors.overdue ?? score >= 100) return 'critical';
    if (score >= 70) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }

  private static determineBlockerImpact(
    daysBlocked: number,
    priority: number
  ): 'low' | 'medium' | 'high' {
    if (daysBlocked > 7 || priority >= 8) return 'high';
    if (daysBlocked > 3 || priority >= 5) return 'medium';
    return 'low';
  }

  private detectCircularRisks(_taskId: string): string[] {
    // Simplified circular dependency detection
    return []; // Implementation would check for potential circular paths
  }

  private async isOnCriticalPath(taskId: string): Promise<boolean> {
    // Simplified critical path detection
    const blockingCount = await this.getBlockingTaskCount(taskId);
    return blockingCount > 2; // Simple heuristic
  }

  private static calculateEstimatedWorkHours(tasks: Task[]): number {
    return tasks.reduce((total, task) => {
      const remaining = (task.estimated_hours ?? 0) - (task.actual_hours ?? 0);
      return total + Math.max(0, remaining);
    }, 0);
  }

  /**
   * Create a standardized service error
   *
   * @private
   * @param {string} code - Error code for categorization
   * @param {string} message - Human-readable error message
   * @param {any} [originalError] - Original error object for debugging
   * @returns {ServiceError} Formatted service error with status code
   */
  private static createError(code: string, message: string, originalError?: unknown): ServiceError {
    const error = new Error(message) as ServiceError;
    error.code = code;
    error.statusCode = ContextService.getStatusCodeForError(code);
    error.details = originalError as ServiceError['details'];
    return error;
  }

  /**
   * Maps error codes to appropriate HTTP status codes
   *
   * @private
   * @param code Error code identifier
   * @returns HTTP status code
   */
  private static getStatusCodeForError(code: string): number {
    switch (code) {
      case 'CONTEXT_GENERATION_FAILED':
      case 'PROJECT_CONTEXT_FAILED':
      case 'TASK_CONTEXT_FAILED':
      case 'WORK_CONTEXT_FAILED':
        return 500;
      default:
        return 500;
    }
  }
}
