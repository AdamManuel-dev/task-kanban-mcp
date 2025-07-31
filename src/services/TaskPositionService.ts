/**
 * @fileoverview Task Position Management Service
 * @lastmodified 2025-07-31T12:00:00Z
 * 
 * Features: Task positioning, column reordering, position adjustment algorithms
 * Main APIs: moveTask(), getNextPosition(), adjustPositionsForInsertion()
 * Constraints: Maintains sequential positioning, handles column moves
 * Patterns: Transactional operations, position normalization, conflict resolution
 */

import { logger } from '../utils/logger';
import type { DatabaseConnection } from '../database/connection';

/**
 * Service responsible for managing task positions within columns
 * 
 * Handles positioning logic for tasks, including moving tasks between columns,
 * adjusting positions when tasks are inserted or removed, and maintaining
 * proper sequential ordering.
 */
export class TaskPositionService {
  constructor(private readonly db: DatabaseConnection) {}

  /**
   * Get the next available position in a column
   * 
   * @param columnId - ID of the column to get next position for
   * @returns Next available position number
   */
  async getNextPosition(columnId: string): Promise<number> {
    const maxPositionResult = await this.db.get(
      'SELECT MAX(position) as max_pos FROM tasks WHERE column_id = ?',
      [columnId]
    );

    const maxPosition = maxPositionResult?.max_pos ?? 0;
    return maxPosition + 1;
  }

  /**
   * Adjust positions for all tasks after insertion point
   * 
   * When a task is inserted at a specific position, all tasks at or after
   * that position need to be shifted down by 1.
   * 
   * @param columnId - Column where insertion occurred
   * @param position - Position where task was inserted
   */
  async adjustPositionsForInsertion(columnId: string, position: number): Promise<void> {
    await this.db.run(
      'UPDATE tasks SET position = position + 1 WHERE column_id = ? AND position >= ? AND id != ?',
      [columnId, position, ''] // Empty string ensures no task is excluded
    );

    logger.debug('Adjusted positions after insertion', {
      columnId,
      insertPosition: position,
    });
  }

  /**
   * Adjust positions for all tasks after removal point
   * 
   * When a task is removed from a position, all tasks after that position
   * need to be shifted up by 1 to fill the gap.
   * 
   * @param columnId - Column where removal occurred
   * @param position - Position where task was removed
   */
  async adjustPositionsForRemoval(columnId: string, position: number): Promise<void> {
    await this.db.run(
      'UPDATE tasks SET position = position - 1 WHERE column_id = ? AND position > ?',
      [columnId, position]
    );

    logger.debug('Adjusted positions after removal', {
      columnId,
      removedPosition: position,
    });
  }

  /**
   * Handle position adjustments when moving task between columns
   * 
   * This method handles the complex logic of moving a task from one position
   * to another, potentially across different columns.
   * 
   * @param taskId - ID of task being moved
   * @param oldColumnId - Original column ID
   * @param newColumnId - Destination column ID
   * @param oldPosition - Original position
   * @param newPosition - Destination position
   */
  async adjustPositionsForMove(
    taskId: string,
    oldColumnId: string,
    newColumnId: string,
    oldPosition: number,
    newPosition: number
  ): Promise<void> {
    if (oldColumnId === newColumnId) {
      // Moving within same column
      if (newPosition > oldPosition) {
        // Moving down: shift tasks between old and new position up
        await this.db.run(
          'UPDATE tasks SET position = position - 1 WHERE column_id = ? AND position > ? AND position <= ? AND id != ?',
          [oldColumnId, oldPosition, newPosition, taskId]
        );
      } else if (newPosition < oldPosition) {
        // Moving up: shift tasks between new and old position down
        await this.db.run(
          'UPDATE tasks SET position = position + 1 WHERE column_id = ? AND position >= ? AND position < ? AND id != ?',
          [oldColumnId, newPosition, oldPosition, taskId]
        );
      }
    } else {
      // Moving between different columns
      // First, adjust positions in the old column (fill the gap)
      await this.adjustPositionsForRemoval(oldColumnId, oldPosition);
      
      // Then, adjust positions in the new column (make space)
      await this.adjustPositionsForInsertion(newColumnId, newPosition);
    }

    logger.debug('Adjusted positions for task move', {
      taskId,
      oldColumnId,
      newColumnId,
      oldPosition,
      newPosition,
    });
  }

  /**
   * Normalize positions in a column to ensure sequential ordering
   * 
   * Over time, position gaps may form due to various operations.
   * This method ensures positions are sequential starting from 1.
   * 
   * @param columnId - Column to normalize positions for
   */
  async normalizePositions(columnId: string): Promise<void> {
    const tasks = await this.db.all(
      'SELECT id FROM tasks WHERE column_id = ? ORDER BY position ASC',
      [columnId]
    );

    // Update positions to be sequential starting from 1
    for (let i = 0; i < tasks.length; i++) {
      await this.db.run(
        'UPDATE tasks SET position = ? WHERE id = ?',
        [i + 1, tasks[i].id]
      );
    }

    logger.info('Normalized positions for column', {
      columnId,
      taskCount: tasks.length,
    });
  }

  /**
   * Get all tasks in a column ordered by position
   * 
   * @param columnId - Column to get tasks for
   * @returns Array of task IDs in position order
   */
  async getTasksInColumnOrder(columnId: string): Promise<string[]> {
    const tasks = await this.db.all(
      'SELECT id FROM tasks WHERE column_id = ? ORDER BY position ASC',
      [columnId]
    );

    return tasks.map(task => task.id);
  }

  /**
   * Validate that positions in a column are properly sequential
   * 
   * @param columnId - Column to validate
   * @returns Object containing validation result and any issues found
   */
  async validateColumnPositions(columnId: string): Promise<{
    isValid: boolean;
    issues: string[];
    taskCount: number;
  }> {
    const tasks = await this.db.all(
      'SELECT id, position FROM tasks WHERE column_id = ? ORDER BY position ASC',
      [columnId]
    );

    const issues: string[] = [];
    const positions = tasks.map(t => t.position);
    const uniquePositions = new Set(positions);

    // Check for duplicate positions
    if (uniquePositions.size !== positions.length) {
      issues.push('Duplicate positions found');
    }

    // Check for proper sequence (should be 1, 2, 3, ...)
    const expectedPositions = Array.from({ length: tasks.length }, (_, i) => i + 1);
    if (JSON.stringify(positions) !== JSON.stringify(expectedPositions)) {
      issues.push('Positions are not sequential starting from 1');
    }

    // Check for negative or zero positions
    if (positions.some(pos => pos <= 0)) {
      issues.push('Invalid positions (zero or negative) found');
    }

    return {
      isValid: issues.length === 0,
      issues,
      taskCount: tasks.length,
    };
  }
}