/**
 * @file TaskHistoryService.test.ts
 * @description Unit tests for TaskHistoryService
 */

import { TaskHistoryService } from '../../../src/services/TaskHistoryService';
import { TaskService } from '../../../src/services/TaskService';
import { BoardService } from '../../../src/services/BoardService';
import { dbConnection } from '../../../src/database/connection';

describe('TaskHistoryService', () => {
  let historyService: TaskHistoryService;
  let taskService: TaskService;
  let boardService: BoardService;
  let testBoardId: string;
  let testTaskId: string;

  beforeEach(async () => {
    historyService = TaskHistoryService.getInstance();
    taskService = new TaskService(dbConnection);
    boardService = BoardService.getInstance();

    // Create test board
    const board = await boardService.createBoard({
      name: 'Test Board',
      description: 'Test board for history tests',
    });
    testBoardId = board.id;

    // Create test task
    const task = await taskService.createTask({
      title: 'Test Task',
      description: 'Test task for history tracking',
      board_id: testBoardId,
      column_id: 'todo',
      priority: 5,
    });
    testTaskId = task.id;
  });

  afterEach(async () => {
    // Clean up test data
    await dbConnection.run('DELETE FROM task_history WHERE task_id = ?', [testTaskId]);
    await taskService.deleteTask(testTaskId);
    await boardService.deleteBoard(testBoardId);
  });

  describe('recordChange', () => {
    it('should record a task history change', async () => {
      const historyEntry = await historyService.recordChange({
        task_id: testTaskId,
        field_name: 'priority',
        old_value: '5',
        new_value: '8',
        changed_by: 'test-user',
        reason: 'Increased priority due to urgency',
      });

      expect(historyEntry).toBeDefined();
      expect(historyEntry.task_id).toBe(testTaskId);
      expect(historyEntry.field_name).toBe('priority');
      expect(historyEntry.old_value).toBe('5');
      expect(historyEntry.new_value).toBe('8');
      expect(historyEntry.changed_by).toBe('test-user');
      expect(historyEntry.reason).toBe('Increased priority due to urgency');
      expect(historyEntry.changed_at).toBeInstanceOf(Date);
    });

    it('should handle null values correctly', async () => {
      const historyEntry = await historyService.recordChange({
        task_id: testTaskId,
        field_name: 'assignee',
        old_value: null,
        new_value: 'john.doe',
      });

      expect(historyEntry.old_value).toBeNull();
      expect(historyEntry.new_value).toBe('john.doe');
      expect(historyEntry.changed_by).toBeNull();
      expect(historyEntry.reason).toBeNull();
    });
  });

  describe('getPriorityHistory', () => {
    beforeEach(async () => {
      // Add some priority history entries
      await historyService.recordChange({
        task_id: testTaskId,
        field_name: 'priority',
        old_value: '5',
        new_value: '8',
        reason: 'Urgent deadline approaching',
      });

      await historyService.recordChange({
        task_id: testTaskId,
        field_name: 'priority',
        old_value: '8',
        new_value: '6',
        reason: 'Deadline extended',
      });
    });

    it('should return priority history for a task', async () => {
      const history = await historyService.getPriorityHistory(testTaskId);

      expect(history).toHaveLength(2);
      expect(history[0].field_name).toBe('priority');
      expect(history[0].new_value).toBe('6'); // Most recent first
      expect(history[1].new_value).toBe('8');
    });

    it('should return empty array for task with no priority history', async () => {
      // Create another task
      const anotherTask = await taskService.createTask({
        title: 'Another Task',
        board_id: testBoardId,
        column_id: 'todo',
      });

      const history = await historyService.getPriorityHistory(anotherTask.id);
      expect(history).toHaveLength(0);

      // Clean up
      await taskService.deleteTask(anotherTask.id);
    });
  });

  describe('getPriorityAnalytics', () => {
    beforeEach(async () => {
      // Add comprehensive priority history
      const changes = [
        { old: '5', new: '8', reason: 'Urgent deadline' },
        { old: '8', new: '6', reason: 'Deadline extended' },
        { old: '6', new: '9', reason: 'Critical bug found' },
        { old: '9', new: '7', reason: 'Issue resolved' },
        { old: '7', new: '8', reason: 'Final push needed' },
      ];

      for (const change of changes) {
        await historyService.recordChange({
          task_id: testTaskId,
          field_name: 'priority',
          old_value: change.old,
          new_value: change.new,
          reason: change.reason,
        });
      }
    });

    it('should calculate comprehensive priority analytics', async () => {
      const analytics = await historyService.getPriorityAnalytics(testTaskId);

      expect(analytics.task_id).toBe(testTaskId);
      expect(analytics.total_changes).toBe(5);
      expect(analytics.average_priority).toBeCloseTo(7.6); // (8+6+9+7+8)/5
      expect(analytics.highest_priority_ever).toBe(9);
      expect(analytics.lowest_priority_ever).toBe(6);
      expect(analytics.most_common_priority).toBe(8); // appears twice
      expect(analytics.priority_trend).toMatch(/increasing|decreasing|stable/);
      expect(analytics.change_frequency_days).toBeGreaterThanOrEqual(0);
      expect(analytics.recent_changes).toHaveLength(5);
      expect(analytics.change_reasons).toHaveLength(5);
    });

    it('should handle task with no priority history', async () => {
      const anotherTask = await taskService.createTask({
        title: 'No History Task',
        board_id: testBoardId,
        column_id: 'todo',
        priority: 5,
      });

      const analytics = await historyService.getPriorityAnalytics(anotherTask.id);

      expect(analytics.total_changes).toBe(0);
      expect(analytics.average_priority).toBe(5); // Current priority
      expect(analytics.highest_priority_ever).toBe(5);
      expect(analytics.lowest_priority_ever).toBe(5);
      expect(analytics.recent_changes).toHaveLength(0);
      expect(analytics.change_reasons).toHaveLength(0);

      // Clean up
      await taskService.deleteTask(anotherTask.id);
    });
  });

  describe('getPriorityChangePatterns', () => {
    beforeEach(async () => {
      // Create multiple tasks with priority histories
      const task2 = await taskService.createTask({
        title: 'Task 2',
        board_id: testBoardId,
        column_id: 'todo',
        priority: 3,
      });

      // Add histories for both tasks
      await historyService.recordChange({
        task_id: testTaskId,
        field_name: 'priority',
        old_value: '5',
        new_value: '8',
        reason: 'Sprint deadline',
      });

      await historyService.recordChange({
        task_id: task2.id,
        field_name: 'priority',
        old_value: '3',
        new_value: '6',
        reason: 'Sprint deadline',
      });

      await historyService.recordChange({
        task_id: testTaskId,
        field_name: 'priority',
        old_value: '8',
        new_value: '7',
        reason: 'Reevaluation',
      });
    });

    it('should return comprehensive change patterns', async () => {
      const patterns = await historyService.getPriorityChangePatterns();

      expect(patterns.total_priority_changes).toBeGreaterThanOrEqual(3);
      expect(patterns.most_active_tasks).toBeDefined();
      expect(patterns.common_change_reasons).toBeDefined();
      expect(patterns.priority_distribution).toBeDefined();
      expect(patterns.trend_analysis).toBeDefined();
      expect(patterns.trend_analysis).toHaveProperty('increasing_count');
      expect(patterns.trend_analysis).toHaveProperty('decreasing_count');
      expect(patterns.trend_analysis).toHaveProperty('stable_count');
    });

    it('should filter patterns by board', async () => {
      const patternsForBoard = await historyService.getPriorityChangePatterns(testBoardId);
      const patternsAll = await historyService.getPriorityChangePatterns();

      expect(patternsForBoard.total_priority_changes).toBeLessThanOrEqual(
        patternsAll.total_priority_changes
      );
    });
  });

  describe('integration with TaskService', () => {
    it('should automatically record history when task priority is updated', async () => {
      // Update task priority through TaskService
      await taskService.updateTask(testTaskId, {
        priority: 9,
        change_reason: 'Critical security vulnerability found',
      });

      // Check that history was automatically recorded
      const history = await historyService.getPriorityHistory(testTaskId);
      expect(history).toHaveLength(1);
      expect(history[0].field_name).toBe('priority');
      expect(history[0].old_value).toBe('5'); // Initial priority
      expect(history[0].new_value).toBe('9');
      expect(history[0].reason).toBe('Critical security vulnerability found');
    });

    it('should record multiple field changes in one update', async () => {
      await taskService.updateTask(testTaskId, {
        title: 'Updated Task Title',
        priority: 8,
        status: 'in_progress',
        assignee: 'jane.doe',
        change_reason: 'Task refinement and assignment',
      });

      // Check all history entries
      const allHistory = await dbConnection.all(
        'SELECT * FROM task_history WHERE task_id = ? ORDER BY changed_at DESC',
        [testTaskId]
      );

      expect(allHistory.length).toBeGreaterThanOrEqual(4); // title, priority, status, assignee
      
      const fieldNames = allHistory.map(h => h.field_name);
      expect(fieldNames).toContain('title');
      expect(fieldNames).toContain('priority');
      expect(fieldNames).toContain('status');
      expect(fieldNames).toContain('assignee');

      // All should have the same reason
      allHistory.forEach(entry => {
        expect(entry.reason).toBe('Task refinement and assignment');
      });
    });
  });
});