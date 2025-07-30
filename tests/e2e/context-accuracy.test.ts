/**
 * @fileoverview E2E test for context service accuracy evaluation
 * @lastmodified 2025-01-30T00:00:00Z
 * 
 * Features: Tests context generation accuracy without MCP server
 * Main APIs: ContextService direct testing with validation
 * Constraints: In-memory database, no external dependencies
 * Patterns: Scenario validation, accuracy metrics, edge cases
 */

import { Database } from 'better-sqlite3';
import { join } from 'path';
import { tmpdir } from 'os';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { getDatabaseConnection } from '@/database/connection';
import { BoardService } from '@/services/BoardService';
import { TaskService } from '@/services/TaskService';
import { TagService } from '@/services/TagService';
import { NoteService } from '@/services/NoteService';
import { ContextService } from '@/services/ContextService';
import type { ProjectContext, TaskContext } from '@/services/ContextService';

interface ValidationResult {
  passed: boolean;
  score: number;
  details: string[];
}

describe('Context Accuracy E2E Test', () => {
  let db: Database;
  let boardService: BoardService;
  let taskService: TaskService;
  let tagService: TagService;
  let noteService: NoteService;
  let contextService: ContextService;
  const testDir = join(tmpdir(), `context-accuracy-test-${Date.now()}`);

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
    process.env.KANBAN_DB_PATH = join(testDir, 'test.db');
    process.env.NODE_ENV = 'test';
    
    db = getDatabaseConnection();
    boardService = new BoardService(db);
    taskService = new TaskService(db);
    tagService = new TagService(db);
    noteService = new NoteService(db);
    contextService = new ContextService(db, boardService, taskService, noteService, tagService);
  });

  afterAll(async () => {
    if (db) db.close();
    try {
      await fs.rm(testDir, { recursive: true });
    } catch (error) {
      // Ignore
    }
  });

  function validateProjectContext(
    context: ProjectContext,
    expectations: {
      boardCount?: number;
      taskCount?: number;
      completedTasks?: number;
      blockedTasks?: number;
      overdueTasks?: number;
      priorityTasks?: number;
      summaryKeywords?: string[];
    }
  ): ValidationResult {
    const result: ValidationResult = {
      passed: true,
      score: 0,
      details: [],
    };
    
    let totalChecks = 0;
    let passedChecks = 0;
    
    // Check board count
    if (expectations.boardCount !== undefined) {
      totalChecks++;
      if (context.boards.length === expectations.boardCount) {
        passedChecks++;
        result.details.push(`✓ Board count correct: ${expectations.boardCount}`);
      } else {
        result.passed = false;
        result.details.push(`✗ Board count mismatch: expected ${expectations.boardCount}, got ${context.boards.length}`);
      }
    }
    
    // Check metrics
    if (expectations.taskCount !== undefined) {
      totalChecks++;
      if (context.key_metrics.total_tasks === expectations.taskCount) {
        passedChecks++;
        result.details.push(`✓ Task count correct: ${expectations.taskCount}`);
      } else {
        result.passed = false;
        result.details.push(`✗ Task count mismatch: expected ${expectations.taskCount}, got ${context.key_metrics.total_tasks}`);
      }
    }
    
    if (expectations.completedTasks !== undefined) {
      totalChecks++;
      if (context.key_metrics.completed_tasks === expectations.completedTasks) {
        passedChecks++;
        result.details.push(`✓ Completed tasks correct: ${expectations.completedTasks}`);
      } else {
        result.passed = false;
        result.details.push(`✗ Completed tasks mismatch: expected ${expectations.completedTasks}, got ${context.key_metrics.completed_tasks}`);
      }
    }
    
    if (expectations.blockedTasks !== undefined) {
      totalChecks++;
      if (context.blockers.length === expectations.blockedTasks) {
        passedChecks++;
        result.details.push(`✓ Blocked tasks correct: ${expectations.blockedTasks}`);
      } else {
        result.passed = false;
        result.details.push(`✗ Blocked tasks mismatch: expected ${expectations.blockedTasks}, got ${context.blockers.length}`);
      }
    }
    
    if (expectations.overdueTasks !== undefined) {
      totalChecks++;
      if (context.overdue_tasks.length === expectations.overdueTasks) {
        passedChecks++;
        result.details.push(`✓ Overdue tasks correct: ${expectations.overdueTasks}`);
      } else {
        result.passed = false;
        result.details.push(`✗ Overdue tasks mismatch: expected ${expectations.overdueTasks}, got ${context.overdue_tasks.length}`);
      }
    }
    
    if (expectations.priorityTasks !== undefined) {
      totalChecks++;
      const highPriorityCount = context.priorities.filter(p => p.urgency_level === 'high' || p.urgency_level === 'critical').length;
      if (highPriorityCount === expectations.priorityTasks) {
        passedChecks++;
        result.details.push(`✓ High priority tasks correct: ${expectations.priorityTasks}`);
      } else {
        result.passed = false;
        result.details.push(`✗ High priority tasks mismatch: expected ${expectations.priorityTasks}, got ${highPriorityCount}`);
      }
    }
    
    // Check summary keywords
    if (expectations.summaryKeywords) {
      const summaryLower = context.summary.toLowerCase();
      for (const keyword of expectations.summaryKeywords) {
        totalChecks++;
        if (summaryLower.includes(keyword.toLowerCase())) {
          passedChecks++;
          result.details.push(`✓ Summary contains keyword: "${keyword}"`);
        } else {
          result.passed = false;
          result.details.push(`✗ Summary missing keyword: "${keyword}"`);
        }
      }
    }
    
    result.score = totalChecks > 0 ? passedChecks / totalChecks : 0;
    return result;
  }

  test('should accurately reflect simple project state', async () => {
    // Create test data
    const board = boardService.createBoard({
      name: 'Simple Project',
      description: 'Basic project for testing',
      color: '#0000FF',
    });
    
    // Create tasks
    taskService.createTask({
      title: 'Task 1',
      board_id: board.id,
      column_id: 'todo',
      priority: 'P2',
    });
    
    taskService.createTask({
      title: 'Task 2',
      board_id: board.id,
      column_id: 'in-progress',
      priority: 'P1',
    });
    
    taskService.createTask({
      title: 'Task 3',
      board_id: board.id,
      column_id: 'done',
      priority: 'P3',
    });
    
    // Get context
    const context = await contextService.getProjectContext({
      detail_level: 'comprehensive',
      include_metrics: true,
    });
    
    // Validate
    const validation = validateProjectContext(context, {
      boardCount: 1,
      taskCount: 3,
      completedTasks: 1,
      blockedTasks: 0,
      overdueTasks: 0,
      summaryKeywords: ['Simple Project', '3 tasks', 'progress'],
    });
    
    console.log('Simple project validation:', validation.details);
    expect(validation.score).toBeGreaterThan(0.8);
  });

  test('should accurately detect blocked tasks and dependencies', async () => {
    const board = boardService.createBoard({
      name: 'Complex Project',
      description: 'Project with dependencies',
      color: '#FF0000',
    });
    
    // Create dependent tasks
    const task1 = taskService.createTask({
      title: 'Backend API',
      board_id: board.id,
      column_id: 'in-progress',
      priority: 'P0',
    });
    
    const task2 = taskService.createTask({
      title: 'Frontend UI',
      board_id: board.id,
      column_id: 'blocked',
      priority: 'P0',
    });
    
    // Add blocking note
    noteService.createNote({
      task_id: task2.id,
      content: `Blocked by task ${task1.id} - waiting for API endpoints`,
      category: 'blocker',
    });
    
    const task3 = taskService.createTask({
      title: 'Documentation',
      board_id: board.id,
      column_id: 'todo',
      priority: 'P2',
    });
    
    // Get context
    const context = await contextService.getProjectContext({
      detail_level: 'comprehensive',
    });
    
    // Validate
    expect(context.blockers).toHaveLength(1);
    expect(context.blockers[0].blocked_task.id).toBe(task2.id);
    expect(context.summary).toContain('blocked');
    expect(context.summary).toMatch(/Frontend UI.*blocked/i);
    
    // Check priority analysis
    const highPriorityTasks = context.priorities.filter(p => p.urgency_level === 'high' || p.urgency_level === 'critical');
    expect(highPriorityTasks).toHaveLength(2); // Both P0 tasks
  });

  test('should accurately track overdue tasks', async () => {
    const board = boardService.createBoard({
      name: 'Time-sensitive Project',
      description: 'Project with deadlines',
      color: '#00FF00',
    });
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    
    // Create overdue task
    taskService.createTask({
      title: 'Overdue Task',
      board_id: board.id,
      column_id: 'todo',
      priority: 'P0',
      due_date: yesterday,
    });
    
    // Create upcoming task
    taskService.createTask({
      title: 'Upcoming Task',
      board_id: board.id,
      column_id: 'todo',
      priority: 'P1',
      due_date: nextWeek,
    });
    
    // Get context
    const context = await contextService.getProjectContext();
    
    // Validate
    expect(context.overdue_tasks).toHaveLength(1);
    expect(context.overdue_tasks[0].title).toBe('Overdue Task');
    expect(context.summary).toContain('overdue');
    expect(context.key_metrics.overdue_count).toBe(1);
  });

  test('should provide accurate task context with relationships', async () => {
    const board = boardService.createBoard({
      name: 'Feature Development',
      description: 'New feature implementation',
      color: '#FF00FF',
    });
    
    // Create main task
    const mainTask = taskService.createTask({
      title: 'Implement User Authentication',
      description: 'Complete authentication system with OAuth support',
      board_id: board.id,
      column_id: 'in-progress',
      priority: 'P0',
    });
    
    // Add tags
    const securityTag = tagService.createTag({ name: 'security', color: '#FF0000' });
    const backendTag = tagService.createTag({ name: 'backend', color: '#0000FF' });
    tagService.addTagToTask(mainTask.id, securityTag.id);
    tagService.addTagToTask(mainTask.id, backendTag.id);
    
    // Add notes
    noteService.createNote({
      task_id: mainTask.id,
      content: 'Need to implement OAuth2 flow with Google and GitHub',
      category: 'requirement',
    });
    
    noteService.createNote({
      task_id: mainTask.id,
      content: 'Security review required before deployment',
      category: 'technical',
    });
    
    // Create related tasks
    const relatedTask1 = taskService.createTask({
      title: 'Create Login UI',
      board_id: board.id,
      column_id: 'todo',
      priority: 'P1',
    });
    
    const relatedTask2 = taskService.createTask({
      title: 'Setup OAuth Providers',
      board_id: board.id,
      column_id: 'todo',
      priority: 'P1',
    });
    
    // Get task context
    const context = await contextService.getTaskContext(mainTask.id, {
      detail_level: 'comprehensive',
    });
    
    // Validate
    expect(context.task.id).toBe(mainTask.id);
    expect(context.board.id).toBe(board.id);
    expect(context.tags).toHaveLength(2);
    expect(context.notes).toHaveLength(2);
    expect(context.related_tasks.length).toBeGreaterThan(0);
    expect(context.context_summary).toContain('authentication');
    expect(context.context_summary).toContain('OAuth');
    expect(context.recommendations.length).toBeGreaterThan(0);
    expect(context.recommendations.some(r => r.toLowerCase().includes('security'))).toBe(true);
  });

  test('should accurately calculate project metrics and velocity', async () => {
    const board = boardService.createBoard({
      name: 'Metrics Test Project',
      description: 'Testing metrics accuracy',
      color: '#FFFF00',
    });
    
    // Create tasks with various states
    const taskData = [
      { status: 'done', priority: 'P0', daysAgo: 1 },
      { status: 'done', priority: 'P1', daysAgo: 2 },
      { status: 'done', priority: 'P2', daysAgo: 3 },
      { status: 'in-progress', priority: 'P0', daysAgo: 5 },
      { status: 'in-progress', priority: 'P1', daysAgo: 7 },
      { status: 'todo', priority: 'P0', daysAgo: 10 },
      { status: 'todo', priority: 'P1', daysAgo: 10 },
      { status: 'todo', priority: 'P2', daysAgo: 10 },
      { status: 'blocked', priority: 'P0', daysAgo: 15 },
    ];
    
    for (const data of taskData) {
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - data.daysAgo);
      
      const task = taskService.createTask({
        title: `Task ${data.status} ${data.priority}`,
        board_id: board.id,
        column_id: data.status,
        priority: data.priority,
      });
      
      // Manually update created_at for accurate age calculation
      db.prepare('UPDATE tasks SET created_at = ? WHERE id = ?').run(
        createdAt.toISOString(),
        task.id
      );
    }
    
    // Get context
    const context = await contextService.getProjectContext({
      include_metrics: true,
      detail_level: 'comprehensive',
    });
    
    // Validate metrics
    expect(context.key_metrics.total_tasks).toBe(9);
    expect(context.key_metrics.completed_tasks).toBe(3);
    expect(context.key_metrics.completion_rate).toBeCloseTo(0.33, 1);
    expect(context.key_metrics.blocked_count).toBe(1);
    expect(context.key_metrics.average_task_age_days).toBeGreaterThan(5);
    expect(context.key_metrics.average_task_age_days).toBeLessThan(10);
    
    // Check velocity trend (3 completed in recent days)
    expect(context.key_metrics.velocity_trend).toBe('stable');
  });

  test('should provide accurate work context recommendations', async () => {
    const board = boardService.createBoard({
      name: 'Active Development',
      description: 'Current sprint work',
      color: '#00FFFF',
    });
    
    // Create varied tasks
    taskService.createTask({
      title: 'Critical Bug Fix',
      board_id: board.id,
      column_id: 'todo',
      priority: 'P0',
    });
    
    taskService.createTask({
      title: 'Feature in Progress',
      board_id: board.id,
      column_id: 'in-progress',
      priority: 'P1',
    });
    
    taskService.createTask({
      title: 'Blocked Task',
      board_id: board.id,
      column_id: 'blocked',
      priority: 'P1',
    });
    
    taskService.createTask({
      title: 'Low Priority Enhancement',
      board_id: board.id,
      column_id: 'todo',
      priority: 'P3',
    });
    
    // Get work context
    const workContext = await contextService.getCurrentWorkContext();
    
    // Validate
    expect(workContext.active_tasks).toHaveLength(1); // Only in-progress
    expect(workContext.active_tasks[0].title).toBe('Feature in Progress');
    
    expect(workContext.next_actions.length).toBeGreaterThan(0);
    expect(workContext.next_actions[0].task.title).toBe('Critical Bug Fix'); // P0 should be first
    
    expect(workContext.blockers.length).toBeGreaterThan(0);
    
    expect(workContext.focus_recommendations.length).toBeGreaterThan(0);
    expect(workContext.focus_recommendations[0]).toMatch(/critical|bug|priority/i);
    
    expect(workContext.estimated_work_hours).toBeGreaterThan(0);
  });

  test('should maintain context accuracy with large datasets', async () => {
    const board = boardService.createBoard({
      name: 'Large Project',
      description: 'Project with many tasks',
      color: '#808080',
    });
    
    // Create 100 tasks with varied properties
    const priorities = ['P0', 'P1', 'P2', 'P3'];
    const statuses = ['todo', 'in-progress', 'done', 'blocked'];
    const tags = ['frontend', 'backend', 'bug', 'feature', 'tech-debt'];
    
    for (let i = 0; i < 100; i++) {
      const task = taskService.createTask({
        title: `Task ${i}`,
        description: `Description for task ${i}`,
        board_id: board.id,
        column_id: statuses[i % statuses.length],
        priority: priorities[i % priorities.length],
      });
      
      // Add random tags
      if (Math.random() > 0.5) {
        const tag = tagService.createTag({ 
          name: tags[Math.floor(Math.random() * tags.length)], 
          color: '#000000' 
        });
        tagService.addTagToTask(task.id, tag.id);
      }
      
      // Add random notes
      if (Math.random() > 0.7) {
        noteService.createNote({
          task_id: task.id,
          content: `Note for task ${i}`,
          category: 'general',
        });
      }
    }
    
    // Get context with limits
    const context = await contextService.getProjectContext({
      max_items: 50,
      detail_level: 'summary',
    });
    
    // Validate
    expect(context.key_metrics.total_tasks).toBe(100);
    expect(context.priorities.length).toBeLessThanOrEqual(50);
    expect(context.recent_activities.length).toBeLessThanOrEqual(50);
    
    // Ensure summary is concise for large datasets
    expect(context.summary.length).toBeLessThan(1000);
    expect(context.summary).toContain('100');
    
    // Performance check - should complete quickly even with large dataset
    const start = Date.now();
    await contextService.getProjectContext({ detail_level: 'comprehensive' });
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
  });
});