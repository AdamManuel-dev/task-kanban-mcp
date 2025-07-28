/**
 * @fileoverview Priority management routes
 * @lastmodified 2025-07-27T18:15:00Z
 *
 * Features: Priority calculation, next task recommendation, priority recalculation
 * Main APIs: GET /api/priorities/next, POST /api/priorities/calculate
 * Constraints: Requires read/write permissions
 * Patterns: Returns priority scores and reasoning, supports board filtering
 */

import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validation';
import { TaskService } from '@/services/TaskService';
import { NotFoundError, ValidationError } from '@/utils/errors';
import { dbConnection } from '@/database/connection';
import {
  PRIORITY_THRESHOLDS,
  PRIORITY_SCORING,
  TIME_THRESHOLDS,
  MILLISECONDS_PER_DAY,
} from '@/constants';

const router = Router();

// Validation schemas
const NextTaskSchema = z.object({
  board_id: z.string().uuid().optional(),
  assignee: z.string().optional(),
  skill_context: z.string().optional(),
  exclude_blocked: z.boolean().default(true),
  limit: z.number().int().min(1).max(10).default(1),
});

const CalculatePrioritiesSchema = z.object({
  board_id: z.string().uuid().optional(),
  task_ids: z.array(z.string().uuid()).optional(),
  recalculate_all: z.boolean().default(false),
});

/**
 * Get next recommended task(s) based on priority algorithm.
 *
 * @route GET /api/v1/priorities/next
 * @auth Required - Read permission
 *
 * @queryparam {string} [board_id] - Filter by board ID
 * @queryparam {string} [assignee] - Filter by assignee
 * @queryparam {string} [skill_context] - Filter by skill context
 * @queryparam {boolean} [exclude_blocked] - Exclude blocked tasks (default: true)
 * @queryparam {number} [limit] - Number of tasks to return (1-10, default: 1)
 *
 * @response 200 - Next task(s) recommended
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "next_tasks": [
 *       {
 *         "id": "task123",
 *         "title": "Implement login",
 *         "priority": 8,
 *         "status": "todo",
 *         "due_date": "2024-12-31T00:00:00Z",
 *         "priority_score": 85.5,
 *         "reasoning": "High priority with approaching deadline"
 *       }
 *     ],
 *     "total_available": 15,
 *     "algorithm_version": "v1.2"
 *   }
 * }
 * ```
 *
 * @response 400 - Invalid query parameters
 * @response 401 - Missing or invalid API key
 * @response 403 - Insufficient permissions
 */
router.get(
  '/next',
  requirePermission('read'),
  validateRequest(NextTaskSchema),
  async (req, res, next): Promise<void> => {
    try {
      const { board_id, assignee, skill_context, exclude_blocked, limit } = req.query;

      const taskService = new TaskService(dbConnection);

      // Build filter options
      const filters: any = {
        status: ['todo', 'in_progress'],
        sortBy: 'priority',
        sortOrder: 'desc',
        limit: 100, // Get more tasks to apply priority algorithm
      };

      if (board_id) filters.board_id = board_id;
      if (assignee) filters.assignee = assignee;
      if (exclude_blocked) {
        filters.status = filters.status.filter((s: string) => s !== 'blocked');
      }

      // Get available tasks
      const availableTasks = await taskService.getTasks(filters);

      if (availableTasks.length === 0) {
        return res.apiSuccess({
          next_tasks: [],
          total_available: 0,
          algorithm_version: 'v1.2',
        });
      }

      // Apply priority scoring algorithm
      const scoredTasks = availableTasks.map(task => {
        let score = calculateBaseScore(task);
        score += calculateDueDateBonus(task);
        score += calculateStatusBonus(task);
        score += calculateSkillContextBonus(task, skill_context);
        score += calculateTaskAgeBonus(task);

        return {
          ...task,
          priority_score: score,
          reasoning: generatePriorityReasoning(task, score, String(skill_context ?? '')),
        };
      });

      // Sort by priority score and take top N
      scoredTasks.sort((a, b) => b.priority_score - a.priority_score);
      const nextTasks = scoredTasks.slice(0, parseInt(String(limit), 10) || 10);

      return res.apiSuccess({
        next_tasks: nextTasks,
        total_available: availableTasks.length,
        algorithm_version: 'v1.2',
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Recalculate priorities for tasks using AI-powered algorithm.
 *
 * @route POST /api/v1/priorities/calculate
 * @auth Required - Write permission
 *
 * @bodyparam {string} [board_id] - Board ID to recalculate (optional)
 * @bodyparam {string[]} [task_ids] - Specific task IDs to recalculate (optional)
 * @bodyparam {boolean} [recalculate_all] - Recalculate all tasks (default: false)
 *
 * @response 200 - Priorities recalculated
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "updated_count": 25,
 *     "updated_tasks": [
 *       {
 *         "id": "task123",
 *         "old_priority": 5,
 *         "new_priority": 8,
 *         "reasoning": "Deadline approaching and blocking other tasks"
 *       }
 *     ],
 *     "algorithm_version": "v1.2",
 *     "calculation_time_ms": 1250
 *   }
 * }
 * ```
 *
 * @response 400 - Invalid input data
 * @response 401 - Missing or invalid API key
 * @response 403 - Insufficient permissions
 */
router.post(
  '/calculate',
  requirePermission('write'),
  validateRequest(CalculatePrioritiesSchema),
  async (req, res, next): Promise<void> => {
    try {
      const { board_id, task_ids, recalculate_all } = req.body;
      const startTime = Date.now();

      const taskService = new TaskService(dbConnection);

      let tasksToRecalculate: any[] = [];

      if (recalculate_all) {
        // Get all tasks
        tasksToRecalculate = await taskService.getTasks({
          limit: 10000,
          ...(board_id && { board_id }),
        });
      } else if (task_ids && task_ids.length > 0) {
        // Get specific tasks
        for (const taskId of task_ids) {
          const task = await taskService.getTaskById(taskId);
          if (task) {
            tasksToRecalculate.push(task);
          }
        }
      } else if (board_id) {
        // Get tasks for specific board
        tasksToRecalculate = await taskService.getTasks({
          board_id,
          limit: 10000,
        });
      } else {
        throw new ValidationError('Must specify board_id, task_ids, or recalculate_all');
      }

      const updatedTasks: any[] = [];

      // Recalculate priorities
      for (const task of tasksToRecalculate) {
        const oldPriority = task.priority || 5;
        const newPriority = calculateAIPriority(task);

        if (newPriority !== oldPriority) {
          await taskService.updateTask(task.id, { priority: newPriority });

          updatedTasks.push({
            id: task.id,
            title: task.title,
            old_priority: oldPriority,
            new_priority: newPriority,
            reasoning: generatePriorityChangeReasoning(task, oldPriority, newPriority),
          });
        }
      }

      const calculationTime = Date.now() - startTime;

      return res.apiSuccess({
        updated_count: updatedTasks.length,
        total_analyzed: tasksToRecalculate.length,
        updated_tasks: updatedTasks,
        algorithm_version: 'v1.2',
        calculation_time_ms: calculationTime,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// ============================================================================
// HELPER FUNCTIONS FOR PRIORITY SCORING
// ============================================================================

/**
 * Calculate the base priority score for a task.
 * Base score is the task priority multiplied by the base multiplier.
 */
function calculateBaseScore(task: any): number {
  const basePriority = task.priority || PRIORITY_THRESHOLDS.LOW;
  return basePriority * PRIORITY_SCORING.BASE_MULTIPLIER;
}

/**
 * Calculate due date bonus based on how soon the task is due.
 * Overdue tasks get the highest bonus, followed by tasks due soon.
 */
function calculateDueDateBonus(task: any): number {
  if (!task.due_date) return 0;

  const daysUntilDue = calculateDaysUntilDue(task.due_date);

  if (daysUntilDue < TIME_THRESHOLDS.OVERDUE_DAYS) {
    return PRIORITY_SCORING.OVERDUE_BONUS;
  }
  if (daysUntilDue <= TIME_THRESHOLDS.DUE_SOON_DAYS) {
    return PRIORITY_SCORING.DUE_SOON_BONUS;
  }
  if (daysUntilDue <= TIME_THRESHOLDS.DUE_THIS_WEEK_DAYS) {
    return PRIORITY_SCORING.DUE_THIS_WEEK_BONUS;
  }
  
  return 0;
}

/**
 * Calculate status bonus for tasks already in progress.
 * In-progress tasks get a bonus to maintain momentum.
 */
function calculateStatusBonus(task: any): number {
  return task.status === 'in_progress' ? PRIORITY_SCORING.IN_PROGRESS_BONUS : 0;
}

/**
 * Calculate skill context bonus if task matches user's skill context.
 */
function calculateSkillContextBonus(task: any, skillContext: any): number {
  if (!skillContext || !task.description) return 0;

  const contextString = String(skillContext).toLowerCase();
  const description = task.description.toLowerCase();
  
  return description.includes(contextString) ? PRIORITY_SCORING.SKILL_MATCH_BONUS : 0;
}

/**
 * Calculate task age bonus for older tasks.
 * Older tasks get a slight boost to prevent them from getting forgotten.
 */
function calculateTaskAgeBonus(task: any): number {
  const ageInDays = calculateTaskAge(task.created_at);
  
  if (ageInDays <= TIME_THRESHOLDS.OLD_TASK_DAYS) return 0;
  
  const ageBonus = ageInDays * PRIORITY_SCORING.AGE_MULTIPLIER;
  return Math.min(ageBonus, PRIORITY_SCORING.MAX_AGE_BONUS);
}

/**
 * Calculate days until due date (negative if overdue).
 */
function calculateDaysUntilDue(dueDate: string): number {
  const targetDate = new Date(dueDate);
  const now = new Date();
  return Math.ceil((targetDate.getTime() - now.getTime()) / MILLISECONDS_PER_DAY);
}

/**
 * Calculate task age in days.
 */
function calculateTaskAge(createdAt: string): number {
  const createdDate = new Date(createdAt);
  return Math.ceil((Date.now() - createdDate.getTime()) / MILLISECONDS_PER_DAY);
}

// ============================================================================
// HELPER FUNCTIONS FOR PRIORITY REASONING
// ============================================================================

/**
 * Generate human-readable reasoning for task priority calculation.
 */
function generatePriorityReasoning(task: any, score: number, skillContext?: string): string {
  const reasons: string[] = [];

  reasons.push(getPriorityLevelDescription(task.priority));
  
  const dueDateReason = getDueDateReasoning(task.due_date);
  if (dueDateReason) {
    reasons.push(dueDateReason);
  }

  if (task.status === 'in_progress') {
    reasons.push('🔄 Already in progress - maintain momentum');
  }

  const skillMatchReason = getSkillContextReasoning(task, skillContext);
  if (skillMatchReason) {
    reasons.push(skillMatchReason);
  }

  return `${reasons.join('. ')}.`;
}

/**
 * Get priority level description based on task priority using constants.
 */
function getPriorityLevelDescription(priority: number): string {
  const basePriority = priority || PRIORITY_THRESHOLDS.LOW;
  
  if (basePriority >= PRIORITY_THRESHOLDS.CRITICAL) return '🔥 Critical priority task';
  if (basePriority >= PRIORITY_THRESHOLDS.HIGH) return '⚡ High priority task';
  if (basePriority >= PRIORITY_THRESHOLDS.MEDIUM) return '📈 Medium priority task';
  return '📝 Low priority task';
}

/**
 * Get due date reasoning for priority calculation using constants.
 */
function getDueDateReasoning(dueDate: string | null): string | null {
  if (!dueDate) return null;

  const daysUntilDue = calculateDaysUntilDue(dueDate);

  if (daysUntilDue < TIME_THRESHOLDS.OVERDUE_DAYS) {
    return '🚨 OVERDUE - immediate attention required';
  }
  if (daysUntilDue <= TIME_THRESHOLDS.DUE_SOON_DAYS) {
    return '⏰ Due within 24 hours';
  }
  if (daysUntilDue <= TIME_THRESHOLDS.DUE_THIS_WEEK_DAYS) {
    return '📅 Due this week';
  }
  
  return null;
}

/**
 * Get skill context reasoning if applicable.
 */
function getSkillContextReasoning(task: any, skillContext?: string): string | null {
  if (!skillContext || !task.description) return null;
  
  const taskDescription = task.description.toLowerCase();
  const contextKeyword = skillContext.toLowerCase();
  
  return taskDescription.includes(contextKeyword) 
    ? `🎯 Matches skill context: "${skillContext}"`
    : null;
}

function generatePriorityChangeReasoning(
  task: any,
  oldPriority: number,
  newPriority: number
): string {
  const change = newPriority - oldPriority;
  const reasons: string[] = [];

  if (change > 0) {
    reasons.push('Priority increased due to:');

    if (task.due_date) {
      const daysUntilDue = Math.ceil(
        (new Date(task.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntilDue <= 7) {
        reasons.push('• Approaching deadline');
      }
    }

    const ageInDays = Math.ceil(
      (Date.now() - new Date(task.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (ageInDays > 14) {
      reasons.push('• Task aging (created over 2 weeks ago)');
    }
  } else {
    reasons.push('Priority decreased due to:');
    reasons.push('• Other tasks became more urgent');
    reasons.push('• Task reassessment based on current workload');
  }

  return reasons.join(' ');
}

/**
 * Calculate AI-adjusted priority for a task based on various factors.
 * Uses constants for consistent scoring across the application.
 */
function calculateAIPriority(task: any): number {
  let priority = task.priority || 5;

  priority += calculateDueDateAdjustment(task);
  priority += calculateAgeAdjustment(task);
  priority += calculateStatusAdjustment(task);

  // Ensure priority stays within valid bounds (1-10)
  return Math.round(Math.max(1, Math.min(10, priority)));
}

/**
 * Calculate due date adjustment for AI priority calculation.
 */
function calculateDueDateAdjustment(task: any): number {
  if (!task.due_date) return 0;

  const daysUntilDue = calculateDaysUntilDue(task.due_date);

  if (daysUntilDue < TIME_THRESHOLDS.OVERDUE_DAYS) {
    return 3; // Overdue boost
  }
  if (daysUntilDue <= 3) {
    return 2; // Due soon boost
  }
  if (daysUntilDue <= TIME_THRESHOLDS.DUE_THIS_WEEK_DAYS) {
    return 1; // Due this week boost
  }

  return 0;
}

/**
 * Calculate age adjustment for AI priority calculation.
 */
function calculateAgeAdjustment(task: any): number {
  const ageInDays = calculateTaskAge(task.created_at);
  return ageInDays > TIME_THRESHOLDS.STALE_TASK_DAYS ? 1 : 0;
}

/**
 * Calculate status adjustment for AI priority calculation.
 */
function calculateStatusAdjustment(task: any): number {
  return task.status === 'blocked' ? -2 : 0;
}

export default router;
