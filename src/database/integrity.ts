/**
 * Database integrity check utilities
 * Provides comprehensive validation of database consistency, constraints, and data quality
 *
 * @module database/integrity
 * @description This module provides tools for validating database integrity including
 * foreign key constraints, data consistency, circular dependency detection, and
 * schema validation. Used for health checks and data quality monitoring.
 *
 * @example
 * ```typescript
 * import { DatabaseIntegrityChecker } from '@/database/integrity';
 *
 * const checker = new DatabaseIntegrityChecker(dbConnection);
 * const results = await checker.runFullIntegrityCheck();
 *
 * if (!results.isValid) {
 *   console.error('Database integrity issues found:', results.errors);
 * }
 * ```
 */

import { logger } from '../utils/logger';
import type { DatabaseConnection } from './connection';

/**
 * Configuration for integrity check operations
 */
export interface IntegrityCheckConfig {
  /** Check foreign key constraints */
  checkForeignKeys: boolean;
  /** Check for orphaned records */
  checkOrphans: boolean;
  /** Check for circular dependencies */
  checkCircularDependencies: boolean;
  /** Validate data types and constraints */
  checkDataTypes: boolean;
  /** Check full-text search consistency */
  checkFtsConsistency: boolean;
  /** Check index integrity */
  checkIndexes: boolean;
  /** Maximum depth for dependency checking */
  maxDependencyDepth: number;
}

/**
 * Result of an integrity check operation
 */
export interface IntegrityCheckResult {
  /** Whether the check passed */
  isValid: boolean;
  /** Array of error messages */
  errors: string[];
  /** Array of warning messages */
  warnings: string[];
  /** Check execution time in milliseconds */
  executionTime: number;
  /** Additional metadata about the check */
  metadata: Record<string, any>;
}

/**
 * Comprehensive database integrity check results
 */
export interface FullIntegrityCheckResult {
  /** Overall validity status */
  isValid: boolean;
  /** Individual check results */
  checks: {
    foreignKeys: IntegrityCheckResult;
    orphans: IntegrityCheckResult;
    circularDependencies: IntegrityCheckResult;
    dataTypes: IntegrityCheckResult;
    ftsConsistency: IntegrityCheckResult;
    indexes: IntegrityCheckResult;
  };
  /** Summary statistics */
  summary: {
    totalErrors: number;
    totalWarnings: number;
    totalExecutionTime: number;
    checksRun: number;
    checksPassed: number;
  };
}

/**
 * Database integrity checker providing comprehensive validation tools
 *
 * @class DatabaseIntegrityChecker
 * @description Provides methods for validating database consistency, constraints,
 * and data quality. Can run individual checks or comprehensive validation.
 *
 * @example
 * ```typescript
 * const checker = new DatabaseIntegrityChecker(dbConnection);
 *
 * // Run individual checks
 * const fkResult = await checker.checkForeignKeyConstraints();
 * const orphansResult = await checker.checkOrphanedRecords();
 *
 * // Run comprehensive check
 * const fullResult = await checker.runFullIntegrityCheck();
 * ```
 */
export class DatabaseIntegrityChecker {
  private readonly db: DatabaseConnection;

  private readonly config: IntegrityCheckConfig;

  constructor(database: DatabaseConnection, config: Partial<IntegrityCheckConfig> = {}) {
    this.db = database;
    this.config = {
      checkForeignKeys: true,
      checkOrphans: true,
      checkCircularDependencies: true,
      checkDataTypes: true,
      checkFtsConsistency: true,
      checkIndexes: true,
      maxDependencyDepth: 10,
      ...config,
    };
  }

  /**
   * Run a comprehensive integrity check covering all aspects
   *
   * @returns {Promise<FullIntegrityCheckResult>} Complete integrity check results
   *
   * @example
   * ```typescript
   * const results = await checker.runFullIntegrityCheck();
   *
   * console.log(`Overall valid: ${results.isValid}`);
   * console.log(`Total errors: ${results.summary.totalErrors}`);
   * console.log(`Execution time: ${results.summary.totalExecutionTime}ms`);
   *
   * // Check specific results
   * if (!results.checks.foreignKeys.isValid) {
   *   console.error('Foreign key violations:', results.checks.foreignKeys.errors);
   * }
   * ```
   */
  public async runFullIntegrityCheck(): Promise<FullIntegrityCheckResult> {
    const startTime = Date.now();
    logger.info('Starting comprehensive database integrity check');

    const checks = {
      foreignKeys: await this.checkForeignKeyConstraints(),
      orphans: await this.checkOrphanedRecords(),
      circularDependencies: await this.checkCircularDependencies(),
      dataTypes: await this.checkDataTypeConstraints(),
      ftsConsistency: await this.checkFullTextSearchConsistency(),
      indexes: await this.checkIndexIntegrity(),
    };

    const totalExecutionTime = Date.now() - startTime;
    const totalErrors = Object.values(checks).reduce((sum, check) => sum + check.errors.length, 0);
    const totalWarnings = Object.values(checks).reduce(
      (sum, check) => sum + check.warnings.length,
      0
    );
    const checksRun = Object.keys(checks).length;
    const checksPassed = Object.values(checks).filter(check => check.isValid).length;
    const isValid = totalErrors === 0;

    const result: FullIntegrityCheckResult = {
      isValid,
      checks,
      summary: {
        totalErrors,
        totalWarnings,
        totalExecutionTime,
        checksRun,
        checksPassed,
      },
    };

    logger.info('Database integrity check completed', {
      isValid,
      totalErrors,
      totalWarnings,
      executionTime: totalExecutionTime,
      checksPassed: `${checksPassed}/${checksRun}`,
    });

    return result;
  }

  /**
   * Check foreign key constraints across all tables
   *
   * @returns {Promise<IntegrityCheckResult>} Foreign key check results
   *
   * @example
   * ```typescript
   * const result = await checker.checkForeignKeyConstraints();
   * if (!result.isValid) {
   *   console.error('Foreign key violations found:', result.errors);
   * }
   * ```
   */
  public async checkForeignKeyConstraints(): Promise<IntegrityCheckResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    const metadata: Record<string, any> = {};

    try {
      logger.debug('Checking foreign key constraints');

      // Enable foreign key constraint checking
      await this.db.execute('PRAGMA foreign_key_check');

      // Check specific foreign key relationships
      const foreignKeyChecks = [
        {
          table: 'columns',
          column: 'board_id',
          reference: 'boards(id)',
          query: `
            SELECT 'columns' as table_name, id, board_id as foreign_key
            FROM columns 
            WHERE board_id NOT IN (SELECT id FROM boards)
          `,
        },
        {
          table: 'tasks',
          column: 'board_id',
          reference: 'boards(id)',
          query: `
            SELECT 'tasks' as table_name, id, board_id as foreign_key
            FROM tasks 
            WHERE board_id NOT IN (SELECT id FROM boards)
          `,
        },
        {
          table: 'tasks',
          column: 'column_id',
          reference: 'columns(id)',
          query: `
            SELECT 'tasks' as table_name, id, column_id as foreign_key
            FROM tasks 
            WHERE column_id NOT IN (SELECT id FROM columns)
          `,
        },
        {
          table: 'tasks',
          column: 'parent_task_id',
          reference: 'tasks(id)',
          query: `
            SELECT 'tasks' as table_name, id, parent_task_id as foreign_key
            FROM tasks 
            WHERE parent_task_id IS NOT NULL 
            AND parent_task_id NOT IN (SELECT id FROM tasks)
          `,
        },
        {
          table: 'task_dependencies',
          column: 'task_id',
          reference: 'tasks(id)',
          query: `
            SELECT 'task_dependencies' as table_name, id, task_id as foreign_key
            FROM task_dependencies 
            WHERE task_id NOT IN (SELECT id FROM tasks)
          `,
        },
        {
          table: 'task_dependencies',
          column: 'depends_on_task_id',
          reference: 'tasks(id)',
          query: `
            SELECT 'task_dependencies' as table_name, id, depends_on_task_id as foreign_key
            FROM task_dependencies 
            WHERE depends_on_task_id NOT IN (SELECT id FROM tasks)
          `,
        },
        {
          table: 'notes',
          column: 'task_id',
          reference: 'tasks(id)',
          query: `
            SELECT 'notes' as table_name, id, task_id as foreign_key
            FROM notes 
            WHERE task_id IS NOT NULL 
            AND task_id NOT IN (SELECT id FROM tasks)
          `,
        },

        {
          table: 'task_tags',
          column: 'task_id',
          reference: 'tasks(id)',
          query: `
            SELECT 'task_tags' as table_name, task_id || '-' || tag_id as id, task_id as foreign_key
            FROM task_tags 
            WHERE task_id NOT IN (SELECT id FROM tasks)
          `,
        },
        {
          table: 'task_tags',
          column: 'tag_id',
          reference: 'tags(id)',
          query: `
            SELECT 'task_tags' as table_name, task_id || '-' || tag_id as id, tag_id as foreign_key
            FROM task_tags 
            WHERE tag_id NOT IN (SELECT id FROM tags)
          `,
        },
      ];

      let totalViolations = 0;

      // Process all checks in parallel
      const checkResults = await Promise.all(
        foreignKeyChecks.map(async check => {
          const violations = await this.db.query(check.query);
          return { check, violations };
        })
      );

      // Process results
      for (const { check, violations } of checkResults) {
        if (violations.length > 0) {
          totalViolations += violations.length;
          errors.push(
            `${check.table}.${check.column} -> ${check.reference}: ` +
              `${violations.length} invalid references found`
          );

          // Log first few violations for debugging
          const sampleViolations = violations.slice(0, 3);
          metadata[`${check.table}_${check.column}_violations`] = sampleViolations;
        }
      }

      metadata.totalViolations = totalViolations;
      metadata.tablesChecked = foreignKeyChecks.length;

      logger.debug('Foreign key constraint check completed', {
        violations: totalViolations,
        tablesChecked: foreignKeyChecks.length,
      });
    } catch (error) {
      errors.push(`Foreign key check failed: ${(error as Error).message}`);
      logger.error('Foreign key constraint check failed', { error });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      executionTime: Date.now() - startTime,
      metadata,
    };
  }

  /**
   * Check for orphaned records that should have been cleaned up
   *
   * @returns {Promise<IntegrityCheckResult>} Orphaned records check results
   *
   * @example
   * ```typescript
   * const result = await checker.checkOrphanedRecords();
   * if (result.warnings.length > 0) {
   *   console.warn('Orphaned records found:', result.warnings);
   * }
   * ```
   */
  public async checkOrphanedRecords(): Promise<IntegrityCheckResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    const metadata: Record<string, any> = {};

    try {
      logger.debug('Checking for orphaned records');

      // Check for tasks with invalid parent relationships
      const invalidParentTasks = await this.db.query<{ count: number }>(`
        SELECT COUNT(*) as count
        FROM tasks t1
        WHERE t1.parent_task_id IS NOT NULL
        AND t1.parent_task_id NOT IN (SELECT id FROM tasks WHERE archived = FALSE)
      `);

      const invalidParentCount = invalidParentTasks[0]?.count ?? 0;
      if (invalidParentCount > 0) {
        warnings.push(`Found ${invalidParentCount} tasks with invalid parent references`);
        metadata.invalidParentTasks = invalidParentCount;
      }

      // Check for tags with zero usage but existing in task_tags
      const unusedTagsWithReferences = await this.db.query<{ count: number }>(`
        SELECT COUNT(*) as count
        FROM tags t
        WHERE t.id IN (SELECT DISTINCT tag_id FROM task_tags)
        AND t.id NOT IN (
          SELECT DISTINCT tag_id 
          FROM task_tags tt 
          JOIN tasks task ON tt['task_id'] = task['id'] 
          WHERE task['archived'] = FALSE
        )
      `);

      const unusedTagsCount = unusedTagsWithReferences[0]?.count ?? 0;
      if (unusedTagsCount > 0) {
        warnings.push(`Found ${unusedTagsCount} tags with zero usage count but active references`);
        metadata.unusedTagsWithReferences = unusedTagsCount;
      }

      // Check for columns without any tasks
      const emptyColumns = await this.db.query<{
        id: string;
        name: string;
        board_id: string;
        task_count: number;
      }>(`
        SELECT c.id, c.name, c.board_id, COUNT(t.id) as task_count
        FROM columns c
        LEFT JOIN tasks t ON c['id'] = t['column_id'] AND t['archived'] = FALSE
        GROUP BY c['id'], c['name'], c['board_id']
        HAVING task_count = 0
      `);

      if (emptyColumns.length > 0) {
        warnings.push(`Found ${emptyColumns.length} columns with no active tasks`);
        metadata.emptyColumns = emptyColumns.length;
        metadata.emptyColumnDetails = emptyColumns.slice(0, 5); // Sample for review
      }

      logger.debug('Orphaned records check completed', {
        invalidParentTasks: invalidParentTasks[0]?.count ?? 0,
        unusedTags: unusedTagsWithReferences[0]?.count ?? 0,
        emptyColumns: emptyColumns.length,
      });
    } catch (error) {
      errors.push(`Orphaned records check failed: ${(error as Error).message}`);
      logger.error('Orphaned records check failed', { error });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      executionTime: Date.now() - startTime,
      metadata,
    };
  }

  /**
   * Check for circular dependencies in task relationships
   *
   * @returns {Promise<IntegrityCheckResult>} Circular dependency check results
   *
   * @example
   * ```typescript
   * const result = await checker.checkCircularDependencies();
   * if (!result.isValid) {
   *   console.error('Circular dependencies detected:', result.errors);
   * }
   * ```
   */
  public async checkCircularDependencies(): Promise<IntegrityCheckResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    const metadata: Record<string, any> = {};

    try {
      logger.debug('Checking for circular dependencies');

      // Check for circular dependencies using recursive CTE
      interface CircularDependency {
        task_id: string;
        depends_on_task_id: string;
        depth: number;
        path: string;
        task_title: string;
        dependency_title: string;
      }
      const circularDependencies = await this.db.query<CircularDependency>(
        `
        WITH RECURSIVE dependency_cycle_check(task_id, depends_on_task_id, depth, path) AS (
          -- Start with direct dependencies
          SELECT task_id, depends_on_task_id, 0 as depth, task_id || ' -> ' || depends_on_task_id as path
          FROM task_dependencies
          
          UNION ALL
          
          -- Follow the dependency chain
          SELECT 
            dc.task_id,
            td.depends_on_task_id,
            dc.depth + 1,
            dc.path ?? ' -> ' || td.depends_on_task_id
          FROM dependency_cycle_check dc
          JOIN task_dependencies td ON dc['depends_on_task_id'] = td['task_id']
          WHERE dc.depth < ? -- Prevent infinite recursion
        )
        -- Find cycles where a task depends on itself through the chain
        SELECT DISTINCT 
          task_id,
          depends_on_task_id,
          depth,
          path,
          t1.title as task_title,
          t2.title as dependency_title
        FROM dependency_cycle_check dc
        JOIN tasks t1 ON dc['task_id'] = t1['id']
        JOIN tasks t2 ON dc['depends_on_task_id'] = t2['id']
        WHERE dc['task_id'] = dc['depends_on_task_id'] -- Circular dependency detected
        ORDER BY task_id, depth
      `,
        [this.config.maxDependencyDepth]
      );

      if (circularDependencies.length > 0) {
        errors.push(`Found ${circularDependencies.length} circular dependency chains`);
        metadata.circularDependencies = circularDependencies;

        // Group by task for better reporting
        const taskGroups = circularDependencies.reduce(
          (groups, dep) => {
            const taskId = dep.task_id;
            return {
              ...groups,
              [taskId]: [...(groups[taskId] || []), dep],
            };
          },
          {} as Record<string, CircularDependency[]>
        );

        metadata.affectedTasks = Object.keys(taskGroups).length;
        metadata.sampleCircularPaths = Object.values(taskGroups)
          .slice(0, 3)
          .map(group => (group as any[])[0].path);
      }

      // Check for self-referencing tasks (parent_task_id = id)
      const selfReferencingTasks = await this.db.query(`
        SELECT id, title, parent_task_id
        FROM tasks
        WHERE id = parent_task_id
      `);

      if (selfReferencingTasks.length > 0) {
        errors.push(
          `Found ${selfReferencingTasks.length} tasks that reference themselves as parent`
        );
        metadata.selfReferencingTasks = selfReferencingTasks;
      }

      // Check for potential cycles in parent-child relationships
      const parentChildCycles = await this.db.query(
        `
        WITH RECURSIVE parent_cycle_check(child_id, parent_id, depth, path) AS (
          -- Start with direct parent relationships
          SELECT id as child_id, parent_task_id as parent_id, 0 as depth, id ?? ' -> ' || parent_task_id as path
          FROM tasks
          WHERE parent_task_id IS NOT NULL
          
          UNION ALL
          
          -- Follow the parent chain
          SELECT 
            pc.child_id,
            t.parent_task_id as parent_id,
            pc.depth + 1,
            pc.path ?? ' -> ' || t.parent_task_id
          FROM parent_cycle_check pc
          JOIN tasks t ON pc['parent_id'] = t['id']
          WHERE t['parent_task_id'] IS NOT NULL
          AND pc.depth < ? -- Prevent infinite recursion
        )
        -- Find cycles where a child is its own ancestor
        SELECT DISTINCT 
          child_id,
          parent_id,
          depth,
          path,
          t1.title as child_title,
          t2.title as parent_title
        FROM parent_cycle_check pc
        JOIN tasks t1 ON pc['child_id'] = t1['id']
        JOIN tasks t2 ON pc['parent_id'] = t2['id']
        WHERE pc['child_id'] = pc['parent_id'] -- Parent-child cycle detected
        ORDER BY child_id, depth
      `,
        [this.config.maxDependencyDepth]
      );

      if (parentChildCycles.length > 0) {
        errors.push(`Found ${parentChildCycles.length} parent-child relationship cycles`);
        metadata.parentChildCycles = parentChildCycles;
      }

      logger.debug('Circular dependency check completed', {
        circularDependencies: circularDependencies.length,
        selfReferencingTasks: selfReferencingTasks.length,
        parentChildCycles: parentChildCycles.length,
      });
    } catch (error) {
      errors.push(`Circular dependency check failed: ${(error as Error).message}`);
      logger.error('Circular dependency check failed', { error });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      executionTime: Date.now() - startTime,
      metadata,
    };
  }

  /**
   * Check data type constraints and value validity
   *
   * @returns {Promise<IntegrityCheckResult>} Data type validation results
   *
   * @example
   * ```typescript
   * const result = await checker.checkDataTypeConstraints();
   * if (!result.isValid) {
   *   console.error('Data validation issues:', result.errors);
   * }
   * ```
   */
  public async checkDataTypeConstraints(): Promise<IntegrityCheckResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    const metadata: Record<string, any> = {};

    try {
      logger.debug('Checking data type constraints');

      // Check task priority values (should be integers)
      const invalidPriorities = await this.db.query(`
        SELECT COUNT(*) as count
        FROM tasks
        WHERE priority IS NOT NULL AND priority NOT BETWEEN 0 AND 10
      `);

      if (invalidPriorities[0]?.count > 0) {
        errors.push(`Found ${invalidPriorities[0].count} tasks with invalid priority values`);
        metadata.invalidPriorities = invalidPriorities[0].count;
      }

      // Check note category values
      const invalidNoteCategories = await this.db.query(`
        SELECT COUNT(*) as count
        FROM notes
        WHERE category NOT IN ('general', 'progress', 'blocker', 'decision', 'question')
      `);

      if (invalidNoteCategories[0]?.count > 0) {
        errors.push(`Found ${invalidNoteCategories[0].count} notes with invalid category values`);
        metadata.invalidNoteCategories = invalidNoteCategories[0].count;
      }

      // Check dependency types
      const invalidDependencyTypes = await this.db.query(`
        SELECT COUNT(*) as count
        FROM task_dependencies
        WHERE dependency_type NOT IN ('blocks', 'relates_to', 'duplicates')
      `);

      if (invalidDependencyTypes[0]?.count > 0) {
        errors.push(`Found ${invalidDependencyTypes[0].count} dependencies with invalid types`);
        metadata.invalidDependencyTypes = invalidDependencyTypes[0].count;
      }

      // Check for negative priority values
      const negativePriorities = await this.db.query(`
        SELECT COUNT(*) as count
        FROM tasks
        WHERE priority < 0
      `);

      if (negativePriorities[0]?.count > 0) {
        warnings.push(`Found ${negativePriorities[0].count} tasks with negative priority values`);
        metadata.negativePriorities = negativePriorities[0].count;
      }

      // Check for invalid JSON in metadata columns
      const jsonColumns = [{ table: 'tasks', column: 'metadata' }];

      const jsonCheckResults = await Promise.all(
        jsonColumns.map(async ({ table, column }) => {
          try {
            const invalidJson = await this.db.query(`
              SELECT COUNT(*) as count
              FROM ${table}
              WHERE json_valid(${column}) = 0
            `);
            return { table, column, invalidJson, error: null };
          } catch (error) {
            return { table, column, invalidJson: null, error };
          }
        })
      );

      for (const { table, column, invalidJson, error } of jsonCheckResults) {
        if (error) {
          // SQLite version might not support json_valid
          warnings.push(
            `Could not validate JSON in ${table}.${column}: ${(error as Error).message}`
          );
        } else if (invalidJson && invalidJson[0]?.count > 0) {
          errors.push(`Found ${invalidJson[0].count} invalid JSON values in ${table}.${column}`);
          metadata[`invalid_json_${table}_${column}`] = invalidJson[0].count;
        }
      }

      // Check for tasks with invalid progress percentages
      const invalidProgress = await this.db.query(`
        SELECT COUNT(*) as count
        FROM task_progress
        WHERE percent_complete < 0 OR percent_complete > 100
      `);

      if (invalidProgress[0]?.count > 0) {
        errors.push(`Found ${invalidProgress[0].count} tasks with invalid progress percentages`);
        metadata.invalidProgress = invalidProgress[0].count;
      }

      // Check for inconsistent subtask counts
      const inconsistentSubtaskCounts = await this.db.query(`
        SELECT COUNT(*) as count
        FROM task_progress tp
        WHERE tp['subtasks_completed'] > tp['subtasks_total']
      `);

      if (inconsistentSubtaskCounts[0]?.count > 0) {
        errors.push(
          `Found ${inconsistentSubtaskCounts[0].count} tasks with more completed than total subtasks`
        );
        metadata.inconsistentSubtaskCounts = inconsistentSubtaskCounts[0].count;
      }

      logger.debug('Data type constraint check completed', {
        invalidPriorities: invalidPriorities[0]?.count ?? 0,
        invalidNoteCategories: invalidNoteCategories[0]?.count ?? 0,
        invalidDependencyTypes: invalidDependencyTypes[0]?.count ?? 0,
        negativePriorities: negativePriorities[0]?.count ?? 0,
        invalidProgress: invalidProgress[0]?.count ?? 0,
      });
    } catch (error) {
      errors.push(`Data type constraint check failed: ${(error as Error).message}`);
      logger.error('Data type constraint check failed', { error });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      executionTime: Date.now() - startTime,
      metadata,
    };
  }

  /**
   * Check full-text search table consistency
   *
   * @returns {Promise<IntegrityCheckResult>} FTS consistency check results
   *
   * @example
   * ```typescript
   * const result = await checker.checkFullTextSearchConsistency();
   * if (!result.isValid) {
   *   console.error('FTS inconsistencies found:', result.errors);
   * }
   * ```
   */
  public async checkFullTextSearchConsistency(): Promise<IntegrityCheckResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    const metadata: Record<string, any> = {};

    try {
      logger.debug('Checking full-text search consistency');

      // Check tasks FTS table consistency
      const tasksCount = await this.db.queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM tasks'
      );
      const tasksFtsCount = await this.db.queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM tasks_fts'
      );

      if (tasksCount?.count !== tasksFtsCount?.count) {
        errors.push(
          `Tasks FTS table inconsistency: ${tasksCount?.count ?? 0} tasks vs ${tasksFtsCount?.count ?? 0} FTS entries`
        );
        metadata.tasksCountMismatch = {
          tasks: tasksCount?.count ?? 0,
          fts: tasksFtsCount?.count ?? 0,
        };
      }

      // Check notes FTS table consistency
      const notesCount = await this.db.queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM notes'
      );
      const notesFtsCount = await this.db.queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM notes_fts'
      );

      if (notesCount?.count !== notesFtsCount?.count) {
        errors.push(
          `Notes FTS table inconsistency: ${notesCount?.count ?? 0} notes vs ${notesFtsCount?.count ?? 0} FTS entries`
        );
        metadata.notesCountMismatch = {
          notes: notesCount?.count ?? 0,
          fts: notesFtsCount?.count ?? 0,
        };
      }

      // Check for orphaned FTS entries
      const orphanedTasksFts = await this.db.query(`
        SELECT COUNT(*) as count
        FROM tasks_fts
        WHERE rowid NOT IN (SELECT rowid FROM tasks)
      `);

      if (orphanedTasksFts[0]?.count > 0) {
        warnings.push(`Found ${orphanedTasksFts[0].count} orphaned entries in tasks FTS table`);
        metadata.orphanedTasksFts = orphanedTasksFts[0].count;
      }

      const orphanedNotesFts = await this.db.query(`
        SELECT COUNT(*) as count
        FROM notes_fts
        WHERE rowid NOT IN (SELECT rowid FROM notes)
      `);

      if (orphanedNotesFts[0]?.count > 0) {
        warnings.push(`Found ${orphanedNotesFts[0].count} orphaned entries in notes FTS table`);
        metadata.orphanedNotesFts = orphanedNotesFts[0].count;
      }

      // Check for missing FTS entries
      const missingTasksFts = await this.db.query(`
        SELECT COUNT(*) as count
        FROM tasks
        WHERE rowid NOT IN (SELECT rowid FROM tasks_fts)
      `);

      if (missingTasksFts[0]?.count > 0) {
        warnings.push(`Found ${missingTasksFts[0].count} tasks missing from FTS table`);
        metadata.missingTasksFts = missingTasksFts[0].count;
      }

      const missingNotesFts = await this.db.query(`
        SELECT COUNT(*) as count
        FROM notes
        WHERE rowid NOT IN (SELECT rowid FROM notes_fts)
      `);

      if (missingNotesFts[0]?.count > 0) {
        warnings.push(`Found ${missingNotesFts[0].count} notes missing from FTS table`);
        metadata.missingNotesFts = missingNotesFts[0].count;
      }

      logger.debug('Full-text search consistency check completed', {
        tasksCountMatch: tasksCount?.count === tasksFtsCount?.count,
        notesCountMatch: notesCount?.count === notesFtsCount?.count,
        orphanedTasksFts: orphanedTasksFts[0]?.count ?? 0,
        orphanedNotesFts: orphanedNotesFts[0]?.count ?? 0,
        missingTasksFts: missingTasksFts[0]?.count ?? 0,
        missingNotesFts: missingNotesFts[0]?.count ?? 0,
      });
    } catch (error) {
      errors.push(`Full-text search consistency check failed: ${(error as Error).message}`);
      logger.error('Full-text search consistency check failed', { error });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      executionTime: Date.now() - startTime,
      metadata,
    };
  }

  /**
   * Check database index integrity and effectiveness
   *
   * @returns {Promise<IntegrityCheckResult>} Index integrity check results
   *
   * @example
   * ```typescript
   * const result = await checker.checkIndexIntegrity();
   * if (result.warnings.length > 0) {
   *   console.warn('Index optimization recommended:', result.warnings);
   * }
   * ```
   */
  public async checkIndexIntegrity(): Promise<IntegrityCheckResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    const metadata: Record<string, any> = {};

    try {
      logger.debug('Checking index integrity');

      // Check for missing critical indexes
      const expectedIndexes = [
        'idx_tasks_board_id',
        'idx_tasks_column_id',
        'idx_tasks_parent_id',
        'idx_tasks_priority',
        'idx_columns_board_id',
        'idx_notes_task_id',
        'idx_task_deps_task_id',
        'idx_task_tags_tag_id',
      ];

      const existingIndexes = await this.db.query(`
        SELECT name FROM sqlite_master 
        WHERE type='index' AND name NOT LIKE 'sqlite_%'
      `);

      const existingIndexNames = existingIndexes.map(idx => idx.name);
      const missingIndexes = expectedIndexes.filter(idx => !existingIndexNames.includes(idx));

      if (missingIndexes.length > 0) {
        warnings.push(`Missing critical indexes: ${missingIndexes.join(', ')}`);
        metadata.missingIndexes = missingIndexes;
      }

      // Check for duplicate or redundant indexes
      const allIndexes = await this.db.query(`
        SELECT 
          name,
          tbl_name as table_name,
          sql
        FROM sqlite_master 
        WHERE type='index' AND name NOT LIKE 'sqlite_%'
        ORDER BY tbl_name, name
      `);

      metadata.totalIndexes = allIndexes.length;
      metadata.indexesByTable = allIndexes.reduce(
        (acc, idx) => {
          if (!acc[idx.table_name]) acc[idx.table_name] = [];
          acc[idx.table_name].push(idx.name);
          return acc;
        },
        {} as Record<string, string[]>
      );

      // Check index usage statistics (if available)
      try {
        const indexStats = await this.db.query(`
          SELECT 
            sm.name,
            sm.tbl_name as tbl,
            CASE WHEN s1.stat IS NOT NULL THEN 'has_stats' ELSE 'no_stats' END as stats_status
          FROM sqlite_master sm
          LEFT JOIN sqlite_stat1 s1 ON sm['name'] = s1['idx']
          WHERE sm.type = 'index' AND sm.name NOT LIKE 'sqlite_%'
        `);

        const indexesWithoutStats = indexStats.filter(idx => idx.stats_status === 'no_stats');
        if (indexesWithoutStats.length > 0) {
          warnings.push(
            `${indexesWithoutStats.length} indexes lack statistics (consider running ANALYZE)`
          );
          metadata.indexesWithoutStats = indexesWithoutStats.length;
        }

        metadata.indexesWithStats = indexStats.filter(
          idx => idx.stats_status === 'has_stats'
        ).length;
      } catch (error) {
        // sqlite_stat1 might not be available
        warnings.push('Could not check index statistics');
        metadata.indexesWithoutStats = 0;
        metadata.indexesWithStats = 0;
      }

      logger.debug('Index integrity check completed', {
        totalIndexes: allIndexes.length,
        missingCriticalIndexes: missingIndexes.length,
        indexesWithoutStats: metadata.indexesWithoutStats ?? 0,
      });
    } catch (error) {
      errors.push(`Index integrity check failed: ${(error as Error).message}`);
      logger.error('Index integrity check failed', { error });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      executionTime: Date.now() - startTime,
      metadata,
    };
  }

  /**
   * Get a quick health summary of the database
   *
   * @returns {Promise<{isHealthy: boolean, issues: string[], recommendations: string[]}>} Health summary
   *
   * @example
   * ```typescript
   * const health = await checker.getHealthSummary();
   * console.log(`Database healthy: ${health.isHealthy}`);
   * if (health.issues.length > 0) {
   *   console.error('Issues:', health.issues);
   * }
   * ```
   */
  public async getHealthSummary(): Promise<{
    isHealthy: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    try {
      // Quick checks for common issues
      const quickChecks = await Promise.all([
        this.db.queryOne<{ count: number }>(
          'SELECT COUNT(*) as count FROM sqlite_master WHERE type="table"'
        ),
        this.db.queryOne<{ integrity: string }>('PRAGMA integrity_check(5)'),
        this.db.queryOne<{ mode: string }>('PRAGMA journal_mode'),
      ]);

      const [tableCount, integrityResult, journalMode] = quickChecks;

      if ((tableCount?.count ?? 0) < 5) {
        issues.push('Database appears to be missing core tables');
      }

      if (integrityResult?.integrity !== 'ok') {
        issues.push(`Database integrity check failed: ${integrityResult?.integrity}`);
      }

      if (journalMode?.mode !== 'wal') {
        recommendations.push('Consider enabling WAL mode for better concurrency');
      }

      // Check database size and recommend maintenance
      const stats = await this.db.getStats();
      if (stats.size > 100 * 1024 * 1024) {
        // 100MB
        recommendations.push('Database is large, consider running VACUUM or incremental vacuum');
      }
    } catch (error) {
      issues.push(`Health check failed: ${(error as Error).message}`);
    }

    return {
      isHealthy: issues.length === 0,
      issues,
      recommendations,
    };
  }
}

/**
 * Convenience function to run a quick integrity check
 *
 * @param {DatabaseConnection} db - Database connection
 * @returns {Promise<boolean>} True if database integrity is valid
 *
 * @example
 * ```typescript
 * import { quickIntegrityCheck } from '@/database/integrity';
 *
 * const isValid = await quickIntegrityCheck(dbConnection);
 * if (!isValid) {
 *   console.error('Database integrity issues detected');
 * }
 * ```
 */
export async function quickIntegrityCheck(db: DatabaseConnection): Promise<boolean> {
  const checker = new DatabaseIntegrityChecker(db, {
    checkForeignKeys: true,
    checkOrphans: false,
    checkCircularDependencies: true,
    checkDataTypes: true,
    checkFtsConsistency: false,
    checkIndexes: false,
    maxDependencyDepth: 5,
  });

  try {
    const results = await checker.runFullIntegrityCheck();
    return results.isValid;
  } catch (error) {
    logger.error('Quick integrity check failed', { error });
    return false;
  }
}
