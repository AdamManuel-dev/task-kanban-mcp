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
  validateRequest(NextTaskSchema, 'query'),
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
        let score = (task.priority || 1) * 10; // Base priority score (10-100)

        // Due date scoring (urgency)
        if (task.due_date) {
          const dueDate = new Date(task.due_date);
          const now = new Date();
          const daysUntilDue = Math.ceil(
            (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysUntilDue < 0) {
            score += 50; // Overdue tasks get major boost
          } else if (daysUntilDue <= 1) {
            score += 30; // Due soon
          } else if (daysUntilDue <= 7) {
            score += 15; // Due this week
          }
        }

        // Status scoring
        if (task.status === 'in_progress') {
          score += 20; // Continue work in progress
        }

        // Skill context matching
        if (
          skill_context &&
          task.description?.toLowerCase().includes(skill_context.toLowerCase())
        ) {
          score += 10;
        }

        // Task age (older tasks get slight boost)
        const ageInDays = Math.ceil(
          (Date.now() - new Date(task.created_at).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (ageInDays > 7) {
          score += Math.min(ageInDays * 0.5, 10);
        }

        return {
          ...task,
          priority_score: score,
          reasoning: generatePriorityReasoning(task, score, skill_context),
        };
      });

      // Sort by priority score and take top N
      scoredTasks.sort((a, b) => b.priority_score - a.priority_score);
      const nextTasks = scoredTasks.slice(0, limit as number);

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

// Helper functions
function generatePriorityReasoning(task: any, score: number, skillContext?: string): string {
  const reasons: string[] = [];

  const basePriority = task.priority || 1;
  if (basePriority >= 8) {
    reasons.push('🔥 Critical priority task');
  } else if (basePriority >= 6) {
    reasons.push('⚡ High priority task');
  } else if (basePriority >= 4) {
    reasons.push('📈 Medium priority task');
  } else {
    reasons.push('📝 Low priority task');
  }

  if (task.due_date) {
    const dueDate = new Date(task.due_date);
    const now = new Date();
    const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilDue < 0) {
      reasons.push('🚨 OVERDUE - immediate attention required');
    } else if (daysUntilDue <= 1) {
      reasons.push('⏰ Due within 24 hours');
    } else if (daysUntilDue <= 7) {
      reasons.push('📅 Due this week');
    }
  }

  if (task.status === 'in_progress') {
    reasons.push('🔄 Already in progress - maintain momentum');
  }

  if (skillContext && task.description?.toLowerCase().includes(skillContext.toLowerCase())) {
    reasons.push(`🎯 Matches skill context: "${skillContext}"`);
  }

  return `${reasons.join('. ')}.`;
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

function calculateAIPriority(task: any): number {
  let priority = task.priority || 5;

  // Due date adjustment
  if (task.due_date) {
    const daysUntilDue = Math.ceil(
      (new Date(task.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilDue < 0) {
      priority = Math.min(priority + 3, 10); // Overdue boost
    } else if (daysUntilDue <= 3) {
      priority = Math.min(priority + 2, 10); // Due soon boost
    } else if (daysUntilDue <= 7) {
      priority = Math.min(priority + 1, 10); // Due this week boost
    }
  }

  // Age adjustment
  const ageInDays = Math.ceil(
    (Date.now() - new Date(task.created_at).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (ageInDays > 14) {
    priority = Math.min(priority + 1, 10); // Old task boost
  }

  // Status adjustment
  if (task.status === 'blocked') {
    priority = Math.max(priority - 2, 1); // Blocked tasks get lower priority
  }

  return Math.round(priority);
}

export default router;
