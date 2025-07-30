/**
 * Unit tests for DependencyVisualizationService
 */

import { DependencyVisualizationService } from '../../../src/services/DependencyVisualizationService';
import { TaskService } from '../../../src/services/TaskService';
import { BoardService } from '../../../src/services/BoardService';
import { dbConnection } from '../../../src/database/connection';

describe('DependencyVisualizationService', () => {
  let service: DependencyVisualizationService;
  let taskService: TaskService;
  let boardService: BoardService;

  let testBoardId: string;
  let testColumnId: string;
  let testTasks: Array<{ id: string; title: string }> = [];

  beforeAll(async () => {
    await dbConnection.initialize({ skipSchema: false });
    service = DependencyVisualizationService.getInstance();
    taskService = new TaskService(dbConnection);
    boardService = new BoardService(dbConnection);
  });

  afterAll(async () => {
    await dbConnection.close();
  });

  beforeEach(async () => {
    // Clean up dependencies and tasks
    await dbConnection.execute('DELETE FROM task_dependencies');
    await dbConnection.execute('DELETE FROM tasks');
    await dbConnection.execute('DELETE FROM columns');
    await dbConnection.execute('DELETE FROM boards');

    // Create test board and column
    const board = await boardService.createBoard({
      name: 'Test Board',
      description: 'Board for dependency testing',
      color: '#blue',
    });
    testBoardId = board.id;

    const boardWithColumns = await boardService.getBoardWithColumns(testBoardId);
    testColumnId = boardWithColumns!.columns[0].id; // Default "To Do" column

    // Create test tasks
    const taskData = [
      { title: 'Task A', estimated_hours: 4 },
      { title: 'Task B', estimated_hours: 2 },
      { title: 'Task C', estimated_hours: 6 },
      { title: 'Task D', estimated_hours: 3 },
    ];

    testTasks = [];
    for (const data of taskData) {
      const task = await taskService.createTask({
        title: data.title,
        board_id: testBoardId,
        column_id: testColumnId,
        estimated_hours: data.estimated_hours,
      });
      testTasks.push({ id: task.id, title: task.title });
    }
  });

  describe('Dependency Graph Creation', () => {
    test('should create empty dependency graph when no dependencies exist', async () => {
      const graph = await service.getDependencyGraph(testBoardId);

      expect(graph.nodes.size).toBe(4);
      expect(graph.edges).toHaveLength(0);
      expect(graph.roots).toHaveLength(4); // All tasks are roots with no dependencies
      expect(graph.leaves).toHaveLength(4); // All tasks are leaves with no dependents
    });

    test('should create dependency graph with simple chain', async () => {
      // Create dependencies: A -> B -> C -> D (A blocks B, B blocks C, C blocks D)
      await createDependency(testTasks[1].id, testTasks[0].id); // B depends on A
      await createDependency(testTasks[2].id, testTasks[1].id); // C depends on B
      await createDependency(testTasks[3].id, testTasks[2].id); // D depends on C

      const graph = await service.getDependencyGraph(testBoardId);

      expect(graph.nodes.size).toBe(4);
      expect(graph.edges).toHaveLength(3);
      expect(graph.roots).toEqual([testTasks[0].id]); // Only A has no dependencies
      expect(graph.leaves).toEqual([testTasks[3].id]); // Only D has no dependents

      // Check dependency relationships
      const nodeA = graph.nodes.get(testTasks[0].id)!;
      const nodeB = graph.nodes.get(testTasks[1].id)!;
      const nodeC = graph.nodes.get(testTasks[2].id)!;
      const nodeD = graph.nodes.get(testTasks[3].id)!;

      expect(nodeA.dependencies).toHaveLength(0);
      expect(nodeA.dependents).toEqual([testTasks[1].id]);

      expect(nodeB.dependencies).toEqual([testTasks[0].id]);
      expect(nodeB.dependents).toEqual([testTasks[2].id]);

      expect(nodeC.dependencies).toEqual([testTasks[1].id]);
      expect(nodeC.dependents).toEqual([testTasks[3].id]);

      expect(nodeD.dependencies).toEqual([testTasks[2].id]);
      expect(nodeD.dependents).toHaveLength(0);
    });
  });

  describe('ASCII Visualization', () => {
    test('should generate tree view visualization', async () => {
      // Create simple dependency: A -> B
      await createDependency(testTasks[1].id, testTasks[0].id);

      const visualization = await service.generateAsciiVisualization(testBoardId, {
        format: 'tree',
        showTaskDetails: false,
      });

      expect(visualization).toContain('🌳 Task Dependency Tree');
      expect(visualization).toContain('Task A');
      expect(visualization).toContain('Task B');
      expect(visualization).toContain('Level 0:');
      expect(visualization).toContain('Level 1:');
      expect(visualization).toContain('📊 Summary:');
    });

    test('should generate DOT format visualization', async () => {
      // Create simple dependency: A -> B
      await createDependency(testTasks[1].id, testTasks[0].id);

      const visualization = await service.generateAsciiVisualization(testBoardId, {
        format: 'dot',
        showTaskDetails: true,
      });

      expect(visualization).toContain('digraph TaskDependencies');
      expect(visualization).toContain('rankdir=TB');
      expect(visualization).toContain(testTasks[0].id);
      expect(visualization).toContain(testTasks[1].id);
      expect(visualization).toContain('->'); // DOT edge format
    });

    test('should handle empty dependency case', async () => {
      // Delete all tasks to test empty case
      await dbConnection.execute('DELETE FROM tasks');

      const visualization = await service.generateAsciiVisualization(testBoardId);
      expect(visualization).toBe('No tasks found.');
    });

    test('should handle no dependencies case', async () => {
      const visualization = await service.generateAsciiVisualization(testBoardId);
      expect(visualization).toBe('No dependencies found.');
    });
  });

  describe('Critical Path Analysis', () => {
    test('should find critical path in simple chain', async () => {
      // Create linear dependency chain: A(4h) -> B(2h) -> C(6h) -> D(3h)
      await createDependency(testTasks[1].id, testTasks[0].id); // B depends on A
      await createDependency(testTasks[2].id, testTasks[1].id); // C depends on B
      await createDependency(testTasks[3].id, testTasks[2].id); // D depends on C

      const result = await service.findCriticalPath(testBoardId);

      expect(result.critical_path).toHaveLength(4);
      expect(result.total_duration).toBe(15); // 4 + 2 + 6 + 3
      expect(result.starting_tasks).toHaveLength(1);
      expect(result.starting_tasks[0].title).toBe('Task A');
      expect(result.ending_tasks).toHaveLength(1);
      expect(result.ending_tasks[0].title).toBe('Task D');
      expect(result.dependency_count).toBe(3);
    });

    test('should handle empty dependency graph', async () => {
      // Delete all tasks
      await dbConnection.execute('DELETE FROM tasks');

      const result = await service.findCriticalPath(testBoardId);

      expect(result.critical_path).toHaveLength(0);
      expect(result.total_duration).toBe(0);
      expect(result.starting_tasks).toHaveLength(0);
      expect(result.ending_tasks).toHaveLength(0);
      expect(result.bottlenecks).toHaveLength(0);
      expect(result.dependency_count).toBe(0);
    });

    test('should identify bottleneck tasks', async () => {
      // Create a bottleneck: A -> B, C -> B, D -> B (B is a bottleneck)
      await createDependency(testTasks[1].id, testTasks[0].id); // B depends on A
      await createDependency(testTasks[1].id, testTasks[2].id); // B depends on C
      await createDependency(testTasks[1].id, testTasks[3].id); // B depends on D

      const result = await service.findCriticalPath(testBoardId);

      // No bottlenecks in this case since B has dependents, not many dependents
      // Let's create a different scenario where A has many dependents
      await dbConnection.execute('DELETE FROM task_dependencies');

      // A blocks B, C, D (A is the bottleneck)
      await createDependency(testTasks[1].id, testTasks[0].id); // B depends on A
      await createDependency(testTasks[2].id, testTasks[0].id); // C depends on A
      await createDependency(testTasks[3].id, testTasks[0].id); // D depends on A

      const bottleneckResult = await service.findCriticalPath(testBoardId);
      expect(bottleneckResult.bottlenecks).toHaveLength(1);
      expect(bottleneckResult.bottlenecks[0].title).toBe('Task A');
    });
  });

  describe('Task Impact Analysis', () => {
    test('should analyze direct and indirect impact', async () => {
      // Create chain: A -> B -> C -> D
      await createDependency(testTasks[1].id, testTasks[0].id); // B depends on A
      await createDependency(testTasks[2].id, testTasks[1].id); // C depends on B
      await createDependency(testTasks[3].id, testTasks[2].id); // D depends on C

      const impact = await service.analyzeTaskImpact(testTasks[0].id); // Analyze impact of A

      expect(impact.directDependents).toHaveLength(1);
      expect(impact.directDependents[0].title).toBe('Task B');
      expect(impact.indirectDependents).toHaveLength(2);
      expect(impact.indirectDependents.map(t => t.title)).toContain('Task C');
      expect(impact.indirectDependents.map(t => t.title)).toContain('Task D');
      expect(impact.totalImpact).toBe(3);
      expect(impact.wouldBlockCount).toBe(1);
    });

    test('should handle task with no impact', async () => {
      const impact = await service.analyzeTaskImpact(testTasks[0].id);

      expect(impact.directDependents).toHaveLength(0);
      expect(impact.indirectDependents).toHaveLength(0);
      expect(impact.totalImpact).toBe(0);
      expect(impact.wouldBlockCount).toBe(0);
    });

    test('should throw error for non-existent task', async () => {
      await expect(service.analyzeTaskImpact('non-existent-id')).rejects.toThrow('Task not found');
    });
  });

  // Helper function to create dependencies
  async function createDependency(taskId: string, dependsOnTaskId: string): Promise<void> {
    await dbConnection.execute(
      'INSERT INTO task_dependencies (id, task_id, depends_on_task_id, dependency_type, created_at) VALUES (?, ?, ?, ?, ?)',
      [
        `dep-${taskId}-${dependsOnTaskId}`,
        taskId,
        dependsOnTaskId,
        'blocks',
        new Date().toISOString(),
      ]
    );
  }
});
