/**
 * Integration tests for priorities API endpoints
 * Tests the new priority calculation and recommendation functionality added in Phase 15.6
 */

import request from 'supertest';
import { expect } from 'chai';
import { app } from '../../../src/server';
import { createTestBoard, createTestTask, cleanupTestData } from '../../helpers/testData';

describe('Priorities API Integration Tests', () => {
  let testBoardId: string;
  let testTaskIds: string[] = [];

  beforeEach(async () => {
    await cleanupTestData();

    // Create test board
    const board = await createTestBoard('Priority Test Board');
    testBoardId = board.id;

    // Create test tasks with different priorities
    const task1 = await createTestTask(testBoardId, {
      title: 'High Priority Task',
      priority: 5,
      status: 'todo',
      due_date: new Date(Date.now() + 24 * 60 * 60 * 1000), // Due tomorrow
    });

    const task2 = await createTestTask(testBoardId, {
      title: 'Medium Priority Task',
      priority: 3,
      status: 'in_progress',
      due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Due next week
    });

    const task3 = await createTestTask(testBoardId, {
      title: 'Low Priority Task',
      priority: 1,
      status: 'todo',
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Due next month
    });

    testTaskIds = [task1.id, task2.id, task3.id];
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('GET /api/v1/priorities/next', () => {
    it('should return next recommended task', async () => {
      const response = await request(app)
        .get('/api/v1/priorities/next')
        .query({ board_id: testBoardId })
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('data');
      expect(response.body.data).to.have.property('task');
      expect(response.body.data).to.have.property('score');
      expect(response.body.data).to.have.property('reasoning');

      // Should recommend the high priority task that's due soon
      expect(response.body.data.task.title).to.equal('High Priority Task');
    });

    it('should return 404 when no tasks available', async () => {
      // Create empty board
      const emptyBoard = await createTestBoard('Empty Board');

      const response = await request(app)
        .get('/api/v1/priorities/next')
        .query({ board_id: emptyBoard.id })
        .expect(404);

      expect(response.body).to.have.property('success', false);
      expect(response.body.error.message).to.include('No tasks available');
    });

    it('should filter by assignee when provided', async () => {
      // Assign task to specific user
      await request(app)
        .patch(`/api/v1/tasks/${testTaskIds[0]}`)
        .send({ assignee: 'test-user' })
        .expect(200);

      const response = await request(app)
        .get('/api/v1/priorities/next')
        .query({
          board_id: testBoardId,
          assignee: 'test-user',
        })
        .expect(200);

      expect(response.body.data.task.assignee).to.equal('test-user');
    });

    it('should respect status filter', async () => {
      const response = await request(app)
        .get('/api/v1/priorities/next')
        .query({
          board_id: testBoardId,
          status: 'in_progress',
        })
        .expect(200);

      expect(response.body.data.task.status).to.equal('in_progress');
      expect(response.body.data.task.title).to.equal('Medium Priority Task');
    });
  });

  describe('POST /api/v1/priorities/calculate', () => {
    it('should recalculate priorities for all tasks in board', async () => {
      const response = await request(app)
        .post('/api/v1/priorities/calculate')
        .send({
          board_id: testBoardId,
          algorithm: 'contextual',
        })
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('data');
      expect(response.body.data).to.have.property('updated_count');
      expect(response.body.data).to.have.property('calculations');

      expect(response.body.data.updated_count).to.equal(3);
      expect(response.body.data.calculations).to.have.length(3);
    });

    it('should recalculate priority for specific task', async () => {
      const response = await request(app)
        .post('/api/v1/priorities/calculate')
        .send({
          task_id: testTaskIds[0],
          algorithm: 'contextual',
        })
        .expect(200);

      expect(response.body.data.updated_count).to.equal(1);
      expect(response.body.data.calculations).to.have.length(1);
      expect(response.body.data.calculations[0].task_id).to.equal(testTaskIds[0]);
    });

    it('should use default algorithm when not specified', async () => {
      const response = await request(app)
        .post('/api/v1/priorities/calculate')
        .send({ board_id: testBoardId })
        .expect(200);

      expect(response.body.data.calculations[0]).to.have.property('algorithm');
      expect(response.body.data.calculations[0].algorithm).to.match(/^v\d+\.\d+$/);
    });

    it('should validate required parameters', async () => {
      const response = await request(app).post('/api/v1/priorities/calculate').send({}).expect(400);

      expect(response.body.success).to.be.false;
      expect(response.body.error.message).to.include('board_id or task_id');
    });

    it('should return error for invalid board_id', async () => {
      const response = await request(app)
        .post('/api/v1/priorities/calculate')
        .send({
          board_id: 'invalid-board-id',
          algorithm: 'contextual',
        })
        .expect(404);

      expect(response.body.success).to.be.false;
    });
  });

  describe('PATCH /api/v1/tasks/:id/dependencies', () => {
    let dependencyTaskId: string;

    beforeEach(async () => {
      const dependencyTask = await createTestTask(testBoardId, {
        title: 'Dependency Task',
        priority: 2,
        status: 'todo',
      });
      dependencyTaskId = dependencyTask.id;
    });

    it('should add dependencies to task', async () => {
      const response = await request(app)
        .patch(`/api/v1/tasks/${testTaskIds[0]}/dependencies`)
        .send({
          add: [dependencyTaskId],
          dependency_type: 'blocks',
        })
        .expect(200);

      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.have.property('dependencies_added');
      expect(response.body.data.dependencies_added).to.equal(1);
    });

    it('should remove dependencies from task', async () => {
      // First add a dependency
      await request(app)
        .patch(`/api/v1/tasks/${testTaskIds[0]}/dependencies`)
        .send({
          add: [dependencyTaskId],
          dependency_type: 'blocks',
        })
        .expect(200);

      // Then remove it
      const response = await request(app)
        .patch(`/api/v1/tasks/${testTaskIds[0]}/dependencies`)
        .send({
          remove: [dependencyTaskId],
        })
        .expect(200);

      expect(response.body.data).to.have.property('dependencies_removed');
      expect(response.body.data.dependencies_removed).to.equal(1);
    });

    it('should handle adding and removing dependencies in same request', async () => {
      // Create another dependency task
      const anotherTask = await createTestTask(testBoardId, {
        title: 'Another Dependency',
        priority: 1,
        status: 'todo',
      });

      // Add first dependency
      await request(app)
        .patch(`/api/v1/tasks/${testTaskIds[0]}/dependencies`)
        .send({
          add: [dependencyTaskId],
          dependency_type: 'blocks',
        })
        .expect(200);

      // Add new and remove old in same request
      const response = await request(app)
        .patch(`/api/v1/tasks/${testTaskIds[0]}/dependencies`)
        .send({
          add: [anotherTask.id],
          remove: [dependencyTaskId],
          dependency_type: 'relates_to',
        })
        .expect(200);

      expect(response.body.data.dependencies_added).to.equal(1);
      expect(response.body.data.dependencies_removed).to.equal(1);
    });

    it('should validate dependency type', async () => {
      const response = await request(app)
        .patch(`/api/v1/tasks/${testTaskIds[0]}/dependencies`)
        .send({
          add: [dependencyTaskId],
          dependency_type: 'invalid_type',
        })
        .expect(400);

      expect(response.body.success).to.be.false;
      expect(response.body.error.message).to.include('dependency_type');
    });

    it('should prevent circular dependencies', async () => {
      // Add dependency A -> B
      await request(app)
        .patch(`/api/v1/tasks/${testTaskIds[0]}/dependencies`)
        .send({
          add: [testTaskIds[1]],
          dependency_type: 'blocks',
        })
        .expect(200);

      // Try to add dependency B -> A (circular)
      const response = await request(app)
        .patch(`/api/v1/tasks/${testTaskIds[1]}/dependencies`)
        .send({
          add: [testTaskIds[0]],
          dependency_type: 'blocks',
        })
        .expect(400);

      expect(response.body.success).to.be.false;
      expect(response.body.error.message).to.include('circular');
    });
  });
});
