/**
 * AI Contextual Prioritizer
 * Enhanced prioritization algorithm with machine learning-like capabilities
 */

import type { Task } from '../types';
import { logger } from '../utils/logger';
import { GitService } from './GitService';
import { PriorityHistoryService } from './PriorityHistoryService';
import type { TaskService } from './TaskService';

export interface ContextualPriorityFactors {
  gitContext?: {
    currentBranch?: string;
    recentCommits?: number;
    branchAge?: number;
  };
  timeContext?: {
    hourOfDay?: number;
    dayOfWeek?: number;
    userActiveHours?: number[];
  };
  userContext?: {
    recentPriorityAdjustments?: number;
    taskCompletionVelocity?: number;
    preferredTaskTypes?: string[];
  };
  projectContext?: {
    milestoneProximity?: number;
    teamWorkload?: number;
    criticalPathImpact?: number;
  };
}

export interface EnhancedPriorityResult {
  task: Task;
  priorityScore: number;
  confidence: number;
  reasoning: string[];
  contextFactors: ContextualPriorityFactors;
  mlSimilarity?: number;
}

export class AIContextualPrioritizer {
  private readonly gitService = GitService;

  private readonly priorityHistoryService = new PriorityHistoryService();

  constructor(private readonly taskService: TaskService) {
    // TaskService injected for dependency injection
  }

  /**
   * Enhanced prioritization with contextual awareness and ML-like capabilities
   */
  async prioritizeTasksWithContext(
    boardId: string,
    _contextFilters: string[] = [],
    maxTasks = 50
  ): Promise<EnhancedPriorityResult[]> {
    try {
      // Get all tasks
      const tasks = await this.taskService.getTasks({
        board_id: boardId,
        limit: maxTasks,
      });

      const activeTasks = tasks.filter(
        task => task.status !== 'done' && task.status !== 'archived'
      );

      // Gather contextual information in parallel
      const [gitContext, userContext, projectContext] = await Promise.all([
        this.getGitContext(),
        this.getUserContext(boardId),
        this.getProjectContext(boardId),
      ]);
      const timeContext = this.getTimeContext();

      // Calculate enhanced priority scores
      const prioritizedTasks = await Promise.all(
        activeTasks.map(async task =>
          this.calculateEnhancedPriority(task, {
            gitContext,
            timeContext,
            userContext,
            projectContext,
          })
        )
      );

      // Sort by priority score and confidence
      return prioritizedTasks.sort((a, b) => {
        // Primary sort by priority score
        if (b.priorityScore !== a.priorityScore) {
          return b.priorityScore - a.priorityScore;
        }
        // Secondary sort by confidence
        return b.confidence - a.confidence;
      });
    } catch (error) {
      logger.error('Error in enhanced prioritization:', error);
      throw error;
    }
  }

  /**
   * Calculate enhanced priority score using multiple factors
   */
  // eslint-disable-next-line complexity
  private async calculateEnhancedPriority(
    task: Task,
    context: ContextualPriorityFactors
  ): Promise<EnhancedPriorityResult> {
    const reasoning: string[] = [];
    let score = 0;
    let confidence = 0.5; // Base confidence

    // 1. Base Priority Score (20-100 points)
    const basePriority = (task.priority ?? 1) * 20;
    score += basePriority;
    reasoning.push(`Base priority: ${task.priority ?? 1} (${basePriority} points)`);

    // 2. Due Date Urgency (0-60 points)
    const urgencyBonus = this.calculateUrgencyScore(task);
    score += urgencyBonus.score;
    if (urgencyBonus.reasoning) reasoning.push(urgencyBonus.reasoning);

    // 3. Git Context Awareness (0-30 points)
    const gitBonus = this.calculateGitContextScore(task, context.gitContext);
    score += gitBonus.score;
    if (gitBonus.reasoning) reasoning.push(gitBonus.reasoning);
    confidence += gitBonus.confidence;

    // 4. User Behavior Patterns (0-25 points)
    const userBonus = this.calculateUserContextScore(task, context.userContext);
    score += userBonus.score;
    if (userBonus.reasoning) reasoning.push(userBonus.reasoning);
    confidence += userBonus.confidence;

    // 5. Time Context (0-20 points)
    const timeBonus = this.calculateTimeContextScore(task, context.timeContext);
    score += timeBonus.score;
    if (timeBonus.reasoning) reasoning.push(timeBonus.reasoning);

    // 6. Project Context (0-40 points)
    const projectBonus = this.calculateProjectContextScore(task, context.projectContext);
    score += projectBonus.score;
    if (projectBonus.reasoning) reasoning.push(projectBonus.reasoning);
    confidence += projectBonus.confidence;

    // 7. ML-like Task Similarity (0-15 points)
    const similarityScore = await this.calculateTaskSimilarity(task);
    score += similarityScore.score;
    if (similarityScore.reasoning) reasoning.push(similarityScore.reasoning);

    // 8. Dependency Impact (0-35 points)
    const dependencyScore = await this.calculateDependencyImpact(task);
    score += dependencyScore.score;
    if (dependencyScore.reasoning) reasoning.push(dependencyScore.reasoning);

    // 9. Historical Learning (-20 to +30 points)
    const historyBonus = await this.applyHistoricalLearning(task);
    score += historyBonus.score;
    if (historyBonus.reasoning) reasoning.push(historyBonus.reasoning);
    confidence += historyBonus.confidence;

    // Blocking penalty
    if (task.status === 'blocked') {
      score -= 25;
      reasoning.push('Blocked status penalty (-25 points)');
      confidence -= 0.2;
    }

    // Normalize confidence (0-1 range)
    confidence = Math.max(0, Math.min(1, confidence));

    return {
      task,
      priorityScore: Math.max(0, score),
      confidence,
      reasoning,
      contextFactors: context,
      mlSimilarity: similarityScore.similarity,
    };
  }

  /**
   * Calculate urgency score based on due dates
   */
  private calculateUrgencyScore(task: Task): { score: number; reasoning?: string } {
    if (!task.due_date) {
      return { score: 0 };
    }

    const dueDate = new Date(task.due_date);
    const now = new Date();
    const hoursUntilDue = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilDue < 0) {
      return {
        score: 60,
        reasoning: `Overdue by ${Math.abs(Math.round(hoursUntilDue))} hours (+60 points)`,
      };
    }
    if (hoursUntilDue <= 4) {
      return { score: 45, reasoning: `Due in ${Math.round(hoursUntilDue)} hours (+45 points)` };
    }
    if (hoursUntilDue <= 24) {
      return { score: 30, reasoning: `Due today (+30 points)` };
    }
    if (hoursUntilDue <= 72) {
      return { score: 15, reasoning: `Due in ${Math.round(hoursUntilDue / 24)} days (+15 points)` };
    }
    if (hoursUntilDue <= 168) {
      return { score: 5, reasoning: `Due this week (+5 points)` };
    }

    return { score: 0 };
  }

  /**
   * Calculate git context score
   */
  private calculateGitContextScore(
    task: Task,
    gitContext?: ContextualPriorityFactors['gitContext']
  ): { score: number; reasoning?: string; confidence: number } {
    if (!gitContext?.currentBranch) {
      return { score: 0, confidence: 0 };
    }

    let score = 0;
    let confidence = 0.3;
    const reasons: string[] = [];

    // Branch name pattern matching
    const branchName = gitContext.currentBranch.toLowerCase();
    const taskTitle = task.title.toLowerCase();

    // Simple keyword matching
    const commonWords = this.extractKeywords(taskTitle);
    const branchWords = this.extractKeywords(branchName);
    const overlap = commonWords.filter(word => branchWords.includes(word));

    if (overlap.length > 0) {
      score += 20;
      confidence += 0.4;
      reasons.push(`Git branch relevance: ${overlap.join(', ')} (+20 points)`);
    }

    // Recent commit activity
    if (gitContext.recentCommits && gitContext.recentCommits > 0) {
      score += Math.min(10, gitContext.recentCommits * 2);
      confidence += 0.2;
      reasons.push(`Active branch (+${Math.min(10, gitContext.recentCommits * 2)} points)`);
    }

    return { score, reasoning: reasons.length > 0 ? reasons.join(', ') : undefined, confidence };
  }

  /**
   * Calculate user behavior context score
   */
  private calculateUserContextScore(
    task: Task,
    userContext?: ContextualPriorityFactors['userContext']
  ): { score: number; reasoning?: string; confidence: number } {
    if (!userContext) {
      return { score: 0, confidence: 0 };
    }

    let score = 0;
    let confidence = 0.3;
    const reasons: string[] = [];

    // Task type preference
    if (userContext.preferredTaskTypes && task.type) {
      if (userContext.preferredTaskTypes.includes(task.type)) {
        score += 15;
        confidence += 0.3;
        reasons.push(`Preferred task type (+15 points)`);
      }
    }

    // Velocity matching
    if (userContext.taskCompletionVelocity) {
      // Estimate task complexity (simple heuristic)
      const estimatedEffort = this.estimateTaskEffort(task);
      const velocityMatch = Math.abs(userContext.taskCompletionVelocity - estimatedEffort);

      if (velocityMatch < 2) {
        score += 10;
        confidence += 0.2;
        reasons.push(`Good velocity match (+10 points)`);
      }
    }

    return { score, reasoning: reasons.length > 0 ? reasons.join(', ') : undefined, confidence };
  }

  /**
   * Calculate time context score
   */
  private calculateTimeContextScore(
    task: Task,
    timeContext?: ContextualPriorityFactors['timeContext']
  ): { score: number; reasoning?: string } {
    if (!timeContext) {
      return { score: 0 };
    }

    let score = 0;
    const reasons: string[] = [];

    // Peak productivity hours
    if (timeContext.userActiveHours && timeContext.hourOfDay) {
      if (timeContext.userActiveHours.includes(timeContext.hourOfDay)) {
        score += 10;
        reasons.push(`Peak productivity time (+10 points)`);
      }
    }

    // Day of week patterns
    if (timeContext.dayOfWeek !== undefined) {
      // Monday/Tuesday for planning tasks, Wednesday-Friday for execution
      if (task.title.toLowerCase().includes('plan') && [1, 2].includes(timeContext.dayOfWeek)) {
        score += 8;
        reasons.push(`Planning task on planning day (+8 points)`);
      } else if (
        !task.title.toLowerCase().includes('plan') &&
        [3, 4, 5].includes(timeContext.dayOfWeek)
      ) {
        score += 5;
        reasons.push(`Execution task on execution day (+5 points)`);
      }
    }

    return { score, reasoning: reasons.length > 0 ? reasons.join(', ') : undefined };
  }

  /**
   * Calculate project context score
   */
  private calculateProjectContextScore(
    task: Task,
    projectContext?: ContextualPriorityFactors['projectContext']
  ): { score: number; reasoning?: string; confidence: number } {
    if (!projectContext) {
      return { score: 0, confidence: 0 };
    }

    let score = 0;
    let confidence = 0.2;
    const reasons: string[] = [];

    // Milestone proximity
    if (projectContext.milestoneProximity && projectContext.milestoneProximity < 7) {
      score += 25;
      confidence += 0.4;
      reasons.push(`Near milestone deadline (+25 points)`);
    }

    // Critical path impact
    if (projectContext.criticalPathImpact && projectContext.criticalPathImpact > 0.7) {
      score += 15;
      confidence += 0.3;
      reasons.push(`High critical path impact (+15 points)`);
    }

    return { score, reasoning: reasons.length > 0 ? reasons.join(', ') : undefined, confidence };
  }

  /**
   * ML-like task similarity calculation
   */
  private async calculateTaskSimilarity(
    task: Task
  ): Promise<{ score: number; reasoning?: string; similarity?: number }> {
    try {
      // Get recently completed tasks
      const recentCompleted = await this.taskService.getTasks({
        limit: 20,
        status: 'done',
      });

      if (recentCompleted.length === 0) {
        return { score: 0 };
      }

      // Calculate similarity to recently completed tasks
      const similarities = recentCompleted.map(completedTask =>
        this.calculateTextSimilarity(task.title, completedTask.title)
      );

      const maxSimilarity = Math.max(...similarities);

      if (maxSimilarity > 0.6) {
        const score = Math.round(maxSimilarity * 15);
        return {
          score,
          reasoning: `Similar to recent completion (+${score} points)`,
          similarity: maxSimilarity,
        };
      }

      return { score: 0, similarity: maxSimilarity };
    } catch (error) {
      logger.error('Error calculating task similarity:', error);
      return { score: 0 };
    }
  }

  /**
   * Calculate dependency impact score
   */
  private async calculateDependencyImpact(
    _task: Task
  ): Promise<{ score: number; reasoning?: string }> {
    try {
      // This would integrate with the existing dependency service
      // For now, a placeholder implementation

      // Check if task is blocking others
      const blockingCount = 0; // Would get from dependency service
      if (blockingCount > 0) {
        const score = Math.min(35, blockingCount * 10);
        return { score, reasoning: `Blocking ${blockingCount} tasks (+${score} points)` };
      }

      return { score: 0 };
    } catch (error) {
      logger.error('Error calculating dependency impact:', error);
      return { score: 0 };
    }
  }

  /**
   * Apply historical learning from priority adjustments
   */
  private async applyHistoricalLearning(
    task: Task
  ): Promise<{ score: number; reasoning?: string; confidence: number }> {
    try {
      // Get historical priority changes for similar tasks
      const history = await this.priorityHistoryService.getTaskPriorityHistory(task.id);

      if (history.length === 0) {
        return { score: 0, confidence: 0 };
      }

      // Analyze patterns in priority adjustments
      const avgAdjustment =
        history.reduce((sum, change) => {
          const adjustment = change.new_priority - (change.old_priority ?? 1);
          return sum + adjustment;
        }, 0) / history.length;

      if (Math.abs(avgAdjustment) > 0.5) {
        const score = Math.round(avgAdjustment * 10);
        const confidence = Math.min(0.5, history.length * 0.1);

        return {
          score,
          reasoning: `Historical adjustment pattern (${score > 0 ? '+' : ''}${score} points)`,
          confidence,
        };
      }

      return { score: 0, confidence: 0.1 };
    } catch (error) {
      logger.error('Error applying historical learning:', error);
      return { score: 0, confidence: 0 };
    }
  }

  // Helper methods

  private async getGitContext(): Promise<ContextualPriorityFactors['gitContext']> {
    try {
      const repo = await this.gitService.detectRepository();
      if (!repo) return {};

      const branches = await this.gitService.getBranches(repo.path);
      const currentBranch = branches.find(b => (b as unknown as { current: boolean }).current);

      return {
        currentBranch: currentBranch?.name,
        recentCommits: (currentBranch as unknown as { commitCount: number }).commitCount ?? 0,
        branchAge: currentBranch ? this.calculateBranchAge(currentBranch) : 0,
      };
    } catch (error) {
      logger.error('Error getting git context:', error);
      return {};
    }
  }

  private getTimeContext(): ContextualPriorityFactors['timeContext'] {
    const now = new Date();
    return {
      hourOfDay: now.getHours(),
      dayOfWeek: now.getDay(),
      userActiveHours: [9, 10, 11, 14, 15, 16], // Default active hours
    };
  }

  private async getUserContext(boardId: string): Promise<ContextualPriorityFactors['userContext']> {
    try {
      // Get recent priority adjustments
      // TODO: Implement getRecentPatterns method in PriorityHistoryService
      const recentAdjustments: unknown[] = [];

      // Calculate task completion velocity (tasks per day)
      const recentTasks = await this.taskService.getTasks({
        board_id: boardId,
        limit: 20,
        status: 'done',
      });

      const velocity = recentTasks.length / 7; // rough velocity

      return {
        recentPriorityAdjustments: recentAdjustments.length,
        taskCompletionVelocity: velocity,
        preferredTaskTypes: ['feature', 'enhancement'], // Would learn from history
      };
    } catch (error) {
      logger.error('Error getting user context:', error);
      return {};
    }
  }

  private getProjectContext(_boardId: string): ContextualPriorityFactors['projectContext'] {
    try {
      // This would integrate with project management features
      return {
        milestoneProximity: 14, // days to next milestone
        teamWorkload: 0.8, // 80% capacity
        criticalPathImpact: 0.5, // medium impact
      };
    } catch (error) {
      logger.error('Error getting project context:', error);
      return {};
    }
  }

  private extractKeywords(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter(
        word =>
          ![
            'the',
            'and',
            'for',
            'are',
            'but',
            'not',
            'you',
            'all',
            'can',
            'her',
            'was',
            'one',
            'our',
            'had',
            'day',
          ].includes(word)
      );
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = this.extractKeywords(text1);
    const words2 = this.extractKeywords(text2);

    if (words1.length === 0 || words2.length === 0) return 0;

    const intersection = words1.filter(word => words2.includes(word));
    const union = [...new Set([...words1, ...words2])];

    return intersection.length / union.length; // Jaccard similarity
  }

  private calculateBranchAge(_branch: unknown): number {
    // Calculate branch age in days - placeholder implementation
    return 5; // days
  }

  private estimateTaskEffort(task: Task): number {
    // Simple effort estimation based on title length and content
    const titleLength = task.title.length;
    const descriptionLength = task.description?.length ?? 0;

    if (titleLength < 20 && descriptionLength < 100) return 1; // Small
    if (titleLength < 50 && descriptionLength < 300) return 2; // Medium
    return 3; // Large
  }
}
