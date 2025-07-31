/**
 * @fileoverview Task dependency handlers - separated for complexity reduction
 * @lastmodified 2025-07-31T12:00:00Z
 *
 * Features: Task dependency management, add/remove dependencies
 * Main APIs: getTaskDependencies(), addTaskDependency(), removeTaskDependency()
 * Constraints: Requires authentication, valid task IDs, no circular dependencies
 * Patterns: All handlers use try/catch, return Promise<void>
 */

import type { Request, Response, NextFunction } from 'express';
import type { TaskService } from '@/services/TaskService';
import { NotFoundError, ValidationError } from '@/utils/errors';
import { validateInput, TaskValidation } from '@/utils/validation';

export async function getTaskDependencies(
  req: Request,
  res: Response,
  next: NextFunction,
  taskService: TaskService
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      throw new NotFoundError('Task', 'ID is required');
    }
    const taskWithDeps = await taskService.getTaskWithDependencies(id);

    if (!taskWithDeps) {
      throw new NotFoundError('Task', id);
    }

    res.apiSuccess({
      dependencies: taskWithDeps.dependencies,
      dependents: taskWithDeps.dependents,
    });
  } catch (error) {
    next(error);
  }
}

export async function addTaskDependency(
  req: Request,
  res: Response,
  next: NextFunction,
  taskService: TaskService
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      throw new NotFoundError('Task', 'ID is required');
    }
    const dependencyData = validateInput(TaskValidation.dependency, {
      task_id: id,
      ...req.body,
    });

    const dependency = await taskService.addDependency(
      dependencyData.task_id,
      dependencyData.depends_on_task_id,
      dependencyData.dependency_type
    );

    res.status(201).apiSuccess(dependency);
  } catch (error) {
    next(error);
  }
}

export async function removeTaskDependency(
  req: Request,
  res: Response,
  next: NextFunction,
  taskService: TaskService
): Promise<void> {
  try {
    const { id, dependsOnId } = req.params;
    if (!id) {
      throw new NotFoundError('Task', 'ID is required');
    }
    if (!dependsOnId) {
      throw new NotFoundError('Dependency', 'Dependency ID is required');
    }
    await taskService.removeDependency(id, dependsOnId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function batchUpdateDependencies(
  req: Request,
  res: Response,
  next: NextFunction,
  taskService: TaskService
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      throw new NotFoundError('Task', 'ID is required');
    }

    const { add = [], remove = [], dependency_type = 'blocks' } = req.body;

    if (!Array.isArray(add) || !Array.isArray(remove)) {
      throw new ValidationError('add and remove must be arrays');
    }

    const results = {
      added: [] as string[],
      removed: [] as string[],
      errors: [] as string[],
    };

    // Remove dependencies first
    for (const dependsOnId of remove) {
      try {
        await taskService.removeDependency(id, dependsOnId);
        results.removed.push(dependsOnId);
      } catch (error) {
        results.errors.push(
          `Failed to remove dependency ${dependsOnId}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    // Add new dependencies
    for (const dependsOnId of add) {
      try {
        await taskService.addDependency(id, dependsOnId, dependency_type);
        results.added.push(dependsOnId);
      } catch (error) {
        results.errors.push(
          `Failed to add dependency ${dependsOnId}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    // Get updated dependencies
    const taskWithDeps = await taskService.getTaskWithDependencies(id);
    if (!taskWithDeps) {
      throw new NotFoundError('Task', id);
    }

    res.apiSuccess({
      dependencies: taskWithDeps.dependencies.map(d => d.depends_on_task_id),
      dependents: taskWithDeps.dependents.map(d => d.task_id),
      added: results.added,
      removed: results.removed,
      errors: results.errors.length > 0 ? results.errors : undefined,
    });
  } catch (error) {
    next(error);
  }
}

export async function getDependencyGraph(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { board_id } = req.query;

    // Import the DependencyVisualizationService
    const { DependencyVisualizationService } = await import(
      '@/services/DependencyVisualizationService'
    );
    const depService = DependencyVisualizationService.getInstance();

    const graph = await depService.getDependencyGraph(board_id as string);

    // Convert Map to Object for JSON serialization
    const nodes = Object.fromEntries(graph.nodes);

    res.apiSuccess({
      nodes,
      edges: graph.edges,
      roots: graph.roots,
      leaves: graph.leaves,
      summary: {
        totalNodes: graph.nodes.size,
        totalEdges: graph.edges.length,
        rootCount: graph.roots.length,
        leafCount: graph.leaves.length,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getCriticalPath(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { board_id } = req.query;

    // Import the DependencyVisualizationService
    const { DependencyVisualizationService } = await import(
      '@/services/DependencyVisualizationService'
    );
    const depService = DependencyVisualizationService.getInstance();

    const criticalPath = await depService.findCriticalPath(board_id as string);

    res.apiSuccess(criticalPath);
  } catch (error) {
    next(error);
  }
}
