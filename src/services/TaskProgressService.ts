/**
 * @fileoverview Task Progress Calculation Service
 * @lastmodified 2025-07-31T12:00:00Z
 *
 * Features: Progress calculation, hierarchical progress, weighted subtasks, parent task automation
 * Main APIs: calculateParentTaskProgress(), calculateWeightedParentProgress(), getSubtaskHierarchy()
 * Constraints: Requires valid parent-child relationships, handles circular references
 * Patterns: Recursive calculations, weighted averages, automatic parent updates
 */

import type { DatabaseConnection } from '../database/connection';
import type { ProgressCalculationResult, SubtaskHierarchy } from '../types';
import { logger } from '../utils/logger';

// Constants for progress calculation
const PROGRESS_CONSTANTS = {
  COMPLETE_PERCENTAGE: 100,
  DEFAULT_SUBTASK_WEIGHT: 1,
  MIN_WEIGHT: 0.1,
  MAX_WEIGHT: 10,
  PRECISION_DECIMAL_PLACES: 2,
} as const;

/**
 * Service responsible for calculating task progress and managing hierarchical relationships
 *
 * Handles progress calculations for parent tasks based on their subtasks,
 * supports weighted progress calculations, and manages automatic updates
 * when subtask status changes.
 */
export class TaskProgressService {
  constructor(private readonly db: DatabaseConnection) {}

  /**
   * Calculate parent task progress based on subtask completion
   *
   * Calculates progress as a percentage based on the completion status of all subtasks.
   * Uses simple equal weighting for all subtasks.
   *
   * @param parentTaskId - ID of the parent task to calculate progress for
   * @returns Progress calculation result with percentage and breakdown
   */
  async calculateParentTaskProgress(parentTaskId: string): Promise<ProgressCalculationResult> {
    const subtasks = await this.db.all(
      'SELECT id, title, status FROM tasks WHERE parent_task_id = ?',
      [parentTaskId]
    );

    if (subtasks.length === 0) {
      return {
        parent_task_id: parentTaskId,
        calculated_progress: 0,
        subtask_breakdown: [],
        total_weight: 0,
        auto_complete_eligible: false,
      };
    }

    const completedSubtasks = subtasks.filter(
      (task: { status: string }) => task.status === 'done' || task.status === 'completed'
    );

    const progressPercentage = Math.round(
      (completedSubtasks.length / subtasks.length) * PROGRESS_CONSTANTS.COMPLETE_PERCENTAGE
    );

    const subtaskBreakdown = subtasks.map(
      (subtask: { id: string; title: string; status: string }) => ({
        taskId: subtask.id,
        title: subtask.title,
        status: subtask.status,
        isCompleted: subtask.status === 'done' || subtask.status === 'completed',
        weight: PROGRESS_CONSTANTS.DEFAULT_SUBTASK_WEIGHT,
      })
    );

    logger.debug('Calculated parent task progress', {
      parentTaskId,
      progressPercentage,
      totalSubtasks: subtasks.length,
      completedSubtasks: completedSubtasks.length,
    });

    return {
      parent_task_id: parentTaskId,
      calculated_progress: progressPercentage,
      subtask_breakdown: subtaskBreakdown,
      total_weight: subtasks.length,
      auto_complete_eligible: progressPercentage === PROGRESS_CONSTANTS.COMPLETE_PERCENTAGE,
    };
  }

  /**
   * Calculate weighted parent task progress
   *
   * Uses custom weights assigned to subtasks for more sophisticated progress calculation.
   * Weights allow certain subtasks to contribute more heavily to overall progress.
   *
   * @param parentTaskId - ID of the parent task
   * @returns Weighted progress calculation result
   */
  async calculateWeightedParentProgress(parentTaskId: string): Promise<ProgressCalculationResult> {
    const subtasks = await this.db.all(
      `SELECT id, title, status,
              COALESCE(JSON_EXTRACT(metadata, '$.weight'), ?) as weight
       FROM tasks
       WHERE parent_task_id = ?`,
      [PROGRESS_CONSTANTS.DEFAULT_SUBTASK_WEIGHT, parentTaskId]
    );

    if (subtasks.length === 0) {
      return {
        parent_task_id: parentTaskId,
        calculated_progress: 0,
        subtask_breakdown: [],
        total_weight: 0,
        auto_complete_eligible: false,
      };
    }

    let totalWeight = 0;
    let completedWeight = 0;
    const completedSubtasks = [];

    const subtaskBreakdown = subtasks.map(
      (subtask: { id: string; title: string; status: string; weight: number }) => {
        const weight = Math.max(
          PROGRESS_CONSTANTS.MIN_WEIGHT,
          Math.min(PROGRESS_CONSTANTS.MAX_WEIGHT, subtask.weight)
        );
        const isCompleted = subtask.status === 'done' || subtask.status === 'completed';

        totalWeight += weight;
        if (isCompleted) {
          completedWeight += weight;
          completedSubtasks.push(subtask);
        }

        return {
          taskId: subtask.id,
          title: subtask.title,
          status: subtask.status,
          isCompleted,
          weight,
        };
      }
    );

    const progressPercentage =
      totalWeight > 0
        ? Math.round((completedWeight / totalWeight) * PROGRESS_CONSTANTS.COMPLETE_PERCENTAGE)
        : 0;

    logger.debug('Calculated weighted parent task progress', {
      parentTaskId,
      progressPercentage,
      totalWeight,
      completedWeight,
      totalSubtasks: subtasks.length,
      completedSubtasks: completedSubtasks.length,
    });

    return {
      parent_task_id: parentTaskId,
      calculated_progress: progressPercentage,
      subtask_breakdown: subtaskBreakdown,
      total_weight: totalWeight,
      auto_complete_eligible: progressPercentage === PROGRESS_CONSTANTS.COMPLETE_PERCENTAGE,
    };
  }

  /**
   * Get complete subtask hierarchy for a parent task
   *
   * Recursively builds the full hierarchy tree showing all nested subtasks
   * and their relationships.
   *
   * @param parentTaskId - Root parent task ID
   * @param maxDepth - Maximum nesting depth to prevent infinite recursion
   * @returns Complete subtask hierarchy structure
   */
  async getSubtaskHierarchy(parentTaskId: string, maxDepth = 10): Promise<SubtaskHierarchy> {
    const parentTask = await this.db.get(
      'SELECT id, title, status, created_at FROM tasks WHERE id = ?',
      [parentTaskId]
    );

    if (!parentTask) {
      throw new Error(`Parent task with ID ${parentTaskId} not found`);
    }

    const hierarchy = await this.buildSubtaskHierarchy(parentTaskId, 0, maxDepth);

    // Return the root subtask hierarchy
    return {
      task_id: parentTaskId,
      parent_task_id: undefined,
      depth: 0,
      path: [parentTaskId],
      children: hierarchy,
      total_descendants: this.countTotalSubtasks(hierarchy),
    };
  }

  /**
   * Set weight for a specific subtask
   *
   * @param subtaskId - ID of the subtask to set weight for
   * @param weight - Weight value (will be clamped to valid range)
   */
  async setSubtaskWeight(subtaskId: string, weight: number): Promise<void> {
    const clampedWeight = Math.max(
      PROGRESS_CONSTANTS.MIN_WEIGHT,
      Math.min(PROGRESS_CONSTANTS.MAX_WEIGHT, weight)
    );

    // Get current metadata
    const task = await this.db.get('SELECT metadata FROM tasks WHERE id = ?', [subtaskId]);

    if (!task) {
      throw new Error(`Subtask with ID ${subtaskId} not found`);
    }

    const currentMetadata = task.metadata ? JSON.parse(task.metadata) : {};
    currentMetadata.weight = clampedWeight;

    await this.db.run('UPDATE tasks SET metadata = ? WHERE id = ?', [
      JSON.stringify(currentMetadata),
      subtaskId,
    ]);

    logger.info('Updated subtask weight', {
      subtaskId,
      weight: clampedWeight,
      originalWeight: weight,
    });
  }

  /**
   * Update parent task progress when a subtask changes status
   *
   * This method should be called whenever a subtask status changes to ensure
   * the parent task progress remains accurate.
   *
   * @param subtaskId - ID of the subtask that changed
   */
  async updateParentProgressOnSubtaskChange(subtaskId: string): Promise<void> {
    const subtask = await this.db.get('SELECT parent_task_id FROM tasks WHERE id = ?', [subtaskId]);

    if (!subtask?.parent_task_id) {
      return; // No parent task to update
    }

    const progressResult = await this.calculateWeightedParentProgress(subtask.parent_task_id);

    // Update parent task metadata with progress information
    const parentTask = await this.db.get('SELECT metadata FROM tasks WHERE id = ?', [
      subtask.parent_task_id,
    ]);

    const parentMetadata = parentTask?.metadata ? JSON.parse(parentTask.metadata) : {};
    parentMetadata.progress = {
      percentage: progressResult.calculated_progress,
      calculationMethod: 'weighted',
      lastUpdated: new Date().toISOString(),
      totalSubtasks: progressResult.total_weight,
      completedSubtasks: progressResult.subtask_breakdown.filter(s => s.status === 'done').length,
    };

    await this.db.run('UPDATE tasks SET metadata = ? WHERE id = ?', [
      JSON.stringify(parentMetadata),
      subtask.parent_task_id,
    ]);

    // Check if parent should be automatically marked as complete
    if (progressResult.calculated_progress === PROGRESS_CONSTANTS.COMPLETE_PERCENTAGE) {
      const shouldAutoComplete = await this.checkAutoCompleteEligibility(subtask.parent_task_id);
      if (shouldAutoComplete) {
        await this.db.run('UPDATE tasks SET status = ? WHERE id = ?', [
          'done',
          subtask.parent_task_id,
        ]);

        logger.info('Auto-completed parent task', {
          parentTaskId: subtask.parent_task_id,
          subtaskId,
        });

        // Recursively update grandparent if exists
        await this.updateParentProgressOnSubtaskChange(subtask.parent_task_id);
      }
    }
  }

  /**
   * Recursively build subtask hierarchy
   */
  private async buildSubtaskHierarchy(
    parentId: string,
    currentDepth: number,
    maxDepth: number,
    parentPath: string[] = []
  ): Promise<SubtaskHierarchy[]> {
    if (currentDepth >= maxDepth) {
      return [];
    }

    const subtasks = await this.db.all(
      `SELECT id, title, status, created_at,
              COALESCE(JSON_EXTRACT(metadata, '$.weight'), ?) as weight
       FROM tasks
       WHERE parent_task_id = ?
       ORDER BY position ASC`,
      [PROGRESS_CONSTANTS.DEFAULT_SUBTASK_WEIGHT, parentId]
    );

    const hierarchySubtasks: SubtaskHierarchy[] = [];
    const currentPath = [...parentPath, parentId];

    for (const subtask of subtasks) {
      const childPath = [...currentPath, subtask.id];
      const nestedSubtasks = await this.buildSubtaskHierarchy(
        subtask.id,
        currentDepth + 1,
        maxDepth,
        currentPath
      );

      hierarchySubtasks.push({
        task_id: subtask.id,
        parent_task_id: parentId,
        depth: currentDepth + 1,
        path: childPath,
        children: nestedSubtasks,
        total_descendants: nestedSubtasks.reduce(
          (sum, child) => sum + 1 + child.total_descendants,
          0
        ),
      });
    }

    return hierarchySubtasks;
  }

  /**
   * Calculate maximum depth in hierarchy
   */
  private calculateMaxDepth(subtasks: SubtaskHierarchy[]): number {
    if (subtasks.length === 0) return 0;

    return Math.max(...subtasks.map(subtask => 1 + this.calculateMaxDepth(subtask.children)));
  }

  /**
   * Count total number of subtasks in hierarchy
   */
  private countTotalSubtasks(subtasks: SubtaskHierarchy[]): number {
    return subtasks.reduce(
      (count, subtask) => count + 1 + this.countTotalSubtasks(subtask.children),
      0
    );
  }

  /**
   * Check if parent task is eligible for auto-completion
   */
  private async checkAutoCompleteEligibility(parentTaskId: string): Promise<boolean> {
    const parentTask = await this.db.get('SELECT metadata FROM tasks WHERE id = ?', [parentTaskId]);

    if (!parentTask?.metadata) return true;

    const metadata = JSON.parse(parentTask.metadata);
    return metadata.autoComplete !== false; // Default to true unless explicitly disabled
  }
}
