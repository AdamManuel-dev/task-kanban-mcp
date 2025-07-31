/**
 * Dependency Visualization Service
 * Provides ASCII art and graph visualization of task dependencies
 */

import { dbConnection } from '@/database/connection';
import { logger } from '@/utils/logger';
import type { Task, TaskDependency, CriticalPathResult } from '@/types';

export interface DependencyNode {
  task: Task;
  dependencies: string[]; // task IDs this task depends on
  dependents: string[]; // task IDs that depend on this task
  depth: number;
  x?: number;
  y?: number;
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  edges: TaskDependency[];
  roots: string[]; // tasks with no dependencies
  leaves: string[]; // tasks with no dependents
}

export interface GraphFormatOptions {
  format: 'tree' | 'dot' | 'ascii';
  direction?: 'horizontal' | 'vertical';
  includeBlockedOnly?: boolean;
  maxDepth?: number;
  showTaskDetails?: boolean;
}

interface TaskDependencyWithTitles {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: string;
  created_at: string;
  task_title: string;
  depends_on_title: string;
}

export class DependencyVisualizationService {
  private static instance: DependencyVisualizationService;

  public static getInstance(): DependencyVisualizationService {
    if (!DependencyVisualizationService.instance) {
      DependencyVisualizationService.instance = new DependencyVisualizationService();
    }
    return DependencyVisualizationService.instance;
  }

  /**
   * Get all dependencies for a board
   */
  async getDependencyGraph(boardId?: string): Promise<DependencyGraph> {
    try {
      // Get all tasks and dependencies
      let tasksQuery = 'SELECT * FROM tasks WHERE archived = 0';
      let dependenciesQuery = `
        SELECT td.*, t1.title as task_title, t2.title as depends_on_title
        FROM task_dependencies td
        JOIN tasks t1 ON td.task_id = t1.id
        JOIN tasks t2 ON td.depends_on_task_id = t2.id
      `;

      const params: unknown[] = [];
      if (boardId) {
        tasksQuery += ' AND board_id = ?';
        dependenciesQuery += ' WHERE t1.board_id = ? AND t2.board_id = ?';
        params.push(boardId);
      }

      const [tasks, dependencies] = await Promise.all([
        dbConnection.query<Task>(tasksQuery, boardId ? [boardId] : []),
        dbConnection.query<TaskDependencyWithTitles>(
          dependenciesQuery,
          boardId ? [boardId, boardId] : []
        ),
      ]);

      // Build the graph
      const nodes = new Map<string, DependencyNode>();
      const edges: TaskDependency[] = dependencies.map(dep => ({
        id: dep.id,
        task_id: dep.task_id,
        depends_on_task_id: dep.depends_on_task_id,
        dependency_type: dep.dependency_type,
        created_at: new Date(dep.created_at),
      }));

      // Initialize nodes
      for (const task of tasks) {
        nodes.set(task.id, {
          task: {
            id: task.id,
            title: task.title,
            description: task.description,
            board_id: task.board_id,
            column_id: task.column_id,
            position: task.position,
            priority: task.priority,
            status: task.status,
            assignee: task.assignee,
            due_date: task.due_date ? new Date(task.due_date) : undefined,
            estimated_hours: task.estimated_hours,
            actual_hours: task.actual_hours,
            parent_task_id: task.parent_task_id,
            created_at: new Date(task.created_at),
            updated_at: new Date(task.updated_at),
            completed_at: task.completed_at ? new Date(task.completed_at) : undefined,
            archived: !!task.archived,
            metadata: task.metadata ? JSON.parse(task.metadata) : null,
          },
          dependencies: [],
          dependents: [],
          depth: 0,
        });
      }

      // Build dependency relationships
      for (const edge of edges) {
        const taskNode = nodes.get(edge.task_id);
        const dependsOnNode = nodes.get(edge.depends_on_task_id);

        if (taskNode && dependsOnNode) {
          taskNode.dependencies.push(edge.depends_on_task_id);
          dependsOnNode.dependents.push(edge.task_id);
        }
      }

      // Calculate depths and find roots/leaves
      const roots = Array.from(nodes.values())
        .filter(node => node.dependencies.length === 0)
        .map(node => node.task.id);

      const leaves = Array.from(nodes.values())
        .filter(node => node.dependents.length === 0)
        .map(node => node.task.id);

      // Calculate depths using BFS
      this.calculateDepths(nodes, roots);

      return { nodes, edges, roots, leaves };
    } catch (error) {
      logger.error('Failed to get dependency graph:', error);
      throw new Error(
        `Failed to get dependency graph: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate ASCII art visualization of dependencies
   */
  async generateAsciiVisualization(
    boardId?: string,
    options: GraphFormatOptions = { format: 'tree' }
  ): Promise<string> {
    try {
      const graph = await this.getDependencyGraph(boardId);

      if (graph.nodes.size === 0) {
        return 'No tasks found.';
      }

      if (graph.edges.length === 0) {
        return 'No dependencies found.';
      }

      switch (options.format) {
        case 'tree':
          return this.generateTreeView(graph, options);
        case 'dot':
          return this.generateDotFormat(graph, options);
        case 'ascii':
        default:
          return this.generateAsciiGrid(graph, options);
      }
    } catch (error) {
      logger.error('Failed to generate ASCII visualization:', error);
      throw error;
    }
  }

  /**
   * Find the critical path in the dependency graph
   */
  async findCriticalPath(boardId?: string): Promise<CriticalPathResult> {
    try {
      const graph = await this.getDependencyGraph(boardId);

      if (graph.nodes.size === 0) {
        return {
          critical_path: [],
          total_duration: 0,
          starting_tasks: [],
          ending_tasks: [],
          bottlenecks: [],
          dependency_count: 0,
        };
      }

      // Use topological sort and find longest path
      const { longestPaths } = this.calculateLongestPaths(graph);

      // Find the path with maximum duration
      let maxDuration = 0;
      let criticalEndTask: string | null = null;

      for (const [taskId, duration] of longestPaths.entries()) {
        if (duration > maxDuration) {
          maxDuration = duration;
          criticalEndTask = taskId;
        }
      }

      // Reconstruct the critical path
      const criticalPath: Task[] = [];
      if (criticalEndTask) {
        criticalPath.push(...this.reconstructPath(graph, criticalEndTask, longestPaths));
      }

      // Find bottlenecks (tasks with many dependents)
      const bottlenecks = Array.from(graph.nodes.values())
        .filter(node => node.dependents.length >= 3)
        .map(node => node.task);

      return {
        critical_path: criticalPath,
        total_duration: maxDuration,
        starting_tasks: graph.roots.map(id => graph.nodes.get(id)!.task),
        ending_tasks: graph.leaves.map(id => graph.nodes.get(id)!.task),
        bottlenecks,
        dependency_count: graph.edges.length,
      };
    } catch (error) {
      logger.error('Failed to find critical path:', error);
      throw error;
    }
  }

  /**
   * Analyze the impact of a specific task on the dependency chain
   */
  async analyzeTaskImpact(taskId: string): Promise<{
    directDependents: Task[];
    indirectDependents: Task[];
    totalImpact: number;
    wouldBlockCount: number;
  }> {
    try {
      const graph = await this.getDependencyGraph();
      const node = graph.nodes.get(taskId);

      if (!node) {
        throw new Error('Task not found');
      }

      const directDependents = node.dependents.map(id => graph.nodes.get(id)!.task);
      const indirectDependents: Task[] = [];
      const visited = new Set<string>();

      // Find all indirect dependents using DFS
      const findIndirectDependents = (nodeId: string): void => {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);

        const currentNode = graph.nodes.get(nodeId);
        if (currentNode) {
          for (const dependentId of currentNode.dependents) {
            if (!node.dependents.includes(dependentId)) {
              const dependentTask = graph.nodes.get(dependentId)!.task;
              if (!indirectDependents.some(t => t.id === dependentTask.id)) {
                indirectDependents.push(dependentTask);
              }
            }
            findIndirectDependents(dependentId);
          }
        }
      };

      for (const dependentId of node.dependents) {
        findIndirectDependents(dependentId);
      }

      return {
        directDependents,
        indirectDependents,
        totalImpact: directDependents.length + indirectDependents.length,
        wouldBlockCount: directDependents.length,
      };
    } catch (error) {
      logger.error('Failed to analyze task impact:', error);
      throw error;
    }
  }

  // Private methods

  private calculateDepths(nodes: Map<string, DependencyNode>, roots: string[]): void {
    const visited = new Set<string>();
    const queue: string[] = [...roots];

    // BFS to calculate depths
    while (queue.length > 0) {
      const taskId = queue.shift()!;
      if (visited.has(taskId)) continue;
      visited.add(taskId);

      const node = nodes.get(taskId)!;

      // Calculate depth as max of dependency depths + 1
      node.depth = Math.max(...node.dependencies.map(depId => nodes.get(depId)?.depth ?? -1)) + 1;

      // Add dependents to queue
      for (const dependentId of node.dependents) {
        if (!visited.has(dependentId)) {
          queue.push(dependentId);
        }
      }
    }
  }

  private generateTreeView(graph: DependencyGraph, options: GraphFormatOptions): string {
    let output = '🌳 Task Dependency Tree\n\n';

    // Group by depth
    const levels = new Map<number, DependencyNode[]>();
    for (const node of graph.nodes.values()) {
      if (!levels.has(node.depth)) {
        levels.set(node.depth, []);
      }
      levels.get(node.depth)!.push(node);
    }

    // Generate tree representation
    for (let depth = 0; depth <= Math.max(...levels.keys()); depth++) {
      const nodesAtDepth = levels.get(depth) ?? [];
      if (nodesAtDepth.length === 0) continue;

      output += `Level ${depth}:\n`;

      for (const node of nodesAtDepth) {
        const indent = '  '.repeat(depth);
        const statusIcon = this.getStatusIcon(node.task.status);
        const priorityIcon = this.getPriorityIcon(node.task.priority);

        output += `${indent}${statusIcon} ${priorityIcon} ${node.task.title} (${node.task.id})\n`;

        if (options.showTaskDetails) {
          if (node.task.assignee) {
            output += `${indent}    👤 Assigned to: ${node.task.assignee}\n`;
          }
          if (node.task.due_date) {
            output += `${indent}    📅 Due: ${node.task.due_date.toLocaleDateString()}\n`;
          }
          if (node.dependencies.length > 0) {
            output += `${indent}    🔗 Depends on: ${node.dependencies.length} task(s)\n`;
          }
          if (node.dependents.length > 0) {
            output += `${indent}    📤 Blocks: ${node.dependents.length} task(s)\n`;
          }
        }
      }
      output += '\n';
    }

    // Add summary
    output += `📊 Summary:\n`;
    output += `   Total tasks: ${graph.nodes.size}\n`;
    output += `   Dependencies: ${graph.edges.length}\n`;
    output += `   Root tasks: ${graph.roots.length}\n`;
    output += `   Leaf tasks: ${graph.leaves.length}\n`;
    output += `   Max depth: ${Math.max(...levels.keys())}\n`;

    return output;
  }

  private generateDotFormat(graph: DependencyGraph, options: GraphFormatOptions): string {
    let output = 'digraph TaskDependencies {\n';
    output += '  rankdir=TB;\n';
    output += '  node [shape=box, style=rounded];\n\n';

    // Add nodes
    for (const node of graph.nodes.values()) {
      const statusColor = this.getStatusColor(node.task.status);
      const label = options.showTaskDetails
        ? `"${node.task.title}\n${node.task.status}\nPriority: ${node.task.priority}"`
        : `"${node.task.title}"`;

      output += `  "${node.task.id}" [label=${label}, fillcolor="${statusColor}", style=filled];\n`;
    }

    output += '\n';

    // Add edges
    for (const edge of graph.edges) {
      const style = edge.dependency_type === 'blocks' ? 'solid' : 'dashed';
      const color = edge.dependency_type === 'blocks' ? 'red' : 'blue';

      output += `  "${edge.depends_on_task_id}" -> "${edge.task_id}" [style=${style}, color=${color}];\n`;
    }

    output += '}\n';
    return output;
  }

  private generateAsciiGrid(graph: DependencyGraph, _options: GraphFormatOptions): string {
    let output = '📊 Task Dependencies (ASCII Grid)\n\n';

    // Simple linear representation showing blocking relationships
    for (const node of graph.nodes.values()) {
      if (graph.roots.includes(node.task.id)) {
        output += this.generateSubtree(graph, node.task.id, '', new Set());
      }
    }

    return output;
  }

  private generateSubtree(
    graph: DependencyGraph,
    taskId: string,
    prefix: string,
    visited: Set<string>
  ): string {
    if (visited.has(taskId)) {
      return `${prefix}🔄 [CYCLE] ${taskId}\n`;
    }

    visited.add(taskId);
    const node = graph.nodes.get(taskId)!;
    const statusIcon = this.getStatusIcon(node.task.status);
    const priorityIcon = this.getPriorityIcon(node.task.priority);

    let output = `${prefix}${statusIcon} ${priorityIcon} ${node.task.title}\n`;

    const { dependents } = node;
    dependents.forEach((dependentId, index) => {
      const isLast = index === dependents.length - 1;
      const newPrefix = prefix + (isLast ? '    ' : '│   ');
      const connector = isLast ? '└── ' : '├── ';

      output += `${prefix}${connector}`;
      output += this.generateSubtree(graph, dependentId, newPrefix, new Set(visited));
    });

    visited.delete(taskId);
    return output;
  }

  private calculateLongestPaths(graph: DependencyGraph): {
    sortedNodes: string[];
    longestPaths: Map<string, number>;
  } {
    const inDegree = new Map<string, number>();
    const longestPaths = new Map<string, number>();

    // Initialize in-degrees and paths
    for (const node of graph.nodes.values()) {
      inDegree.set(node.task.id, node.dependencies.length);
      longestPaths.set(node.task.id, node.task.estimated_hours || 1);
    }

    // Topological sort with longest path calculation
    const queue: string[] = [];
    const sortedNodes: string[] = [];

    // Start with nodes that have no dependencies
    for (const [taskId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(taskId);
      }
    }

    while (queue.length > 0) {
      const taskId = queue.shift()!;
      sortedNodes.push(taskId);

      const node = graph.nodes.get(taskId)!;

      for (const dependentId of node.dependents) {
        const currentPath = longestPaths.get(dependentId)!;
        const newPath =
          longestPaths.get(taskId)! + (graph.nodes.get(dependentId)!.task.estimated_hours || 1);

        if (newPath > currentPath) {
          longestPaths.set(dependentId, newPath);
        }

        const newInDegree = inDegree.get(dependentId)! - 1;
        inDegree.set(dependentId, newInDegree);

        if (newInDegree === 0) {
          queue.push(dependentId);
        }
      }
    }

    return { sortedNodes, longestPaths };
  }

  private reconstructPath(
    graph: DependencyGraph,
    endTaskId: string,
    longestPaths: Map<string, number>
  ): Task[] {
    const path: Task[] = [];
    let currentId = endTaskId;

    while (currentId) {
      const node = graph.nodes.get(currentId)!;
      path.unshift(node.task);

      // Find the dependency that contributed to the longest path
      let maxDependency: string | null = null;
      let maxPath = -1;

      for (const depId of node.dependencies) {
        const depPath = longestPaths.get(depId)!;
        if (depPath > maxPath) {
          maxPath = depPath;
          maxDependency = depId;
        }
      }

      currentId = maxDependency!;
    }

    return path;
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case 'todo':
        return '⭕';
      case 'in_progress':
        return '🔄';
      case 'done':
        return '✅';
      case 'blocked':
        return '🚫';
      case 'archived':
        return '📦';
      default:
        return '❓';
    }
  }

  private getPriorityIcon(priority?: number): string {
    if (!priority) return '📝';
    if (priority >= 8) return '🔥';
    if (priority >= 6) return '⚡';
    if (priority >= 4) return '📈';
    return '📝';
  }

  private getStatusColor(status: string): string {
    switch (status) {
      case 'todo':
        return 'lightblue';
      case 'in_progress':
        return 'yellow';
      case 'done':
        return 'lightgreen';
      case 'blocked':
        return 'red';
      case 'archived':
        return 'gray';
      default:
        return 'white';
    }
  }
}
