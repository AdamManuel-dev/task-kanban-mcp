/**
 * Database maintenance utilities for SQLite optimization and cleanup
 * 
 * @module database/maintenance
 * @description This module provides utilities for database maintenance operations
 * including vacuum, analyze, integrity checks, and performance optimization.
 * These operations help maintain database performance and ensure data integrity.
 * 
 * @example
 * ```typescript
 * import { MaintenanceManager } from '@/database/maintenance';
 * 
 * const maintenance = new MaintenanceManager(dbConnection);
 * 
 * // Run full maintenance
 * await maintenance.performFullMaintenance();
 * 
 * // Run specific operations
 * await maintenance.vacuum();
 * await maintenance.analyze();
 * ```
 */

import { logger } from '@/utils/logger';
import type { DatabaseConnection } from './connection';

/**
 * Configuration options for maintenance operations
 */
export interface MaintenanceConfig {
  /** Enable auto-vacuum operations */
  autoVacuum: boolean;
  /** Enable auto-analyze operations */
  autoAnalyze: boolean;
  /** Vacuum threshold in MB of freed space */
  vacuumThreshold: number;
  /** Maximum time in seconds for each operation */
  operationTimeout: number;
  /** Enable maintenance logging */
  enableLogging: boolean;
}

/**
 * Result of a maintenance operation
 */
export interface MaintenanceResult {
  /** Operation that was performed */
  operation: string;
  /** Whether the operation succeeded */
  success: boolean;
  /** Duration in milliseconds */
  duration: number;
  /** Size before operation in bytes */
  sizeBefore?: number;
  /** Size after operation in bytes */
  sizeAfter?: number;
  /** Space reclaimed in bytes */
  spaceReclaimed?: number;
  /** Error message if operation failed */
  error?: string;
  /** Additional details */
  details?: Record<string, any>;
}

/**
 * Database maintenance manager for SQLite operations
 * 
 * @class MaintenanceManager
 * @description Provides comprehensive database maintenance capabilities including
 * vacuum operations, analyze statistics updates, integrity checks, and automated
 * maintenance scheduling.
 */
export class MaintenanceManager {
  private readonly db: DatabaseConnection;
  private readonly config: MaintenanceConfig;

  constructor(db: DatabaseConnection, config: Partial<MaintenanceConfig> = {}) {
    this.db = db;
    this.config = {
      autoVacuum: true,
      autoAnalyze: true,
      vacuumThreshold: 10, // 10MB
      operationTimeout: 300, // 5 minutes
      enableLogging: true,
      ...config,
    };
  }

  /**
   * Perform VACUUM operation to reclaim free space and optimize database
   * 
   * @param {Object} options - Vacuum options
   * @param {boolean} [options.incremental=false] - Use incremental vacuum
   * @param {number} [options.pages] - Number of pages to vacuum (incremental only)
   * @returns {Promise<MaintenanceResult>} Operation result
   * 
   * @example
   * ```typescript
   * // Full vacuum
   * const result = await maintenance.vacuum();
   * console.log(`Reclaimed ${result.spaceReclaimed} bytes`);
   * 
   * // Incremental vacuum
   * await maintenance.vacuum({ incremental: true, pages: 1000 });
   * ```
   */
  public async vacuum(options: {
    incremental?: boolean;
    pages?: number;
  } = {}): Promise<MaintenanceResult> {
    const startTime = Date.now();
    const operation = options.incremental ? 'incremental_vacuum' : 'vacuum';
    
    try {
      if (this.config.enableLogging) {
        logger.info('Starting vacuum operation', { operation, options });
      }

      // Get size before vacuum
      const statsBefore = await this.db.getStats();
      const sizeBefore = statsBefore.size;

      // Perform vacuum operation
      if (options.incremental) {
        const pages = options.pages || 1000;
        await this.db.getDatabase().exec(`PRAGMA incremental_vacuum(${pages})`);
      } else {
        await this.db.getDatabase().exec('VACUUM');
      }

      // Get size after vacuum
      const statsAfter = await this.db.getStats();
      const sizeAfter = statsAfter.size;
      const spaceReclaimed = sizeBefore - sizeAfter;
      const duration = Date.now() - startTime;

      const result: MaintenanceResult = {
        operation,
        success: true,
        duration,
        sizeBefore,
        sizeAfter,
        spaceReclaimed,
        details: {
          pagesFreed: Math.floor(spaceReclaimed / statsAfter.pageSize),
          percentageReduced: sizeBefore > 0 ? (spaceReclaimed / sizeBefore * 100).toFixed(2) : '0',
        },
      };

      if (this.config.enableLogging) {
        logger.info('Vacuum operation completed', {
          duration: `${duration}ms`,
          spaceReclaimed: `${(spaceReclaimed / 1024 / 1024).toFixed(2)}MB`,
          percentageReduced: `${result.details?.percentageReduced}%`,
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const result: MaintenanceResult = {
        operation,
        success: false,
        duration,
        error: (error as Error).message,
      };

      if (this.config.enableLogging) {
        logger.error('Vacuum operation failed', {
          operation,
          duration: `${duration}ms`,
          error: (error as Error).message,
        });
      }

      return result;
    }
  }

  /**
   * Perform ANALYZE operation to update query planner statistics
   * 
   * @param {Object} options - Analyze options
   * @param {string[]} [options.tables] - Specific tables to analyze (default: all)
   * @returns {Promise<MaintenanceResult>} Operation result
   * 
   * @example
   * ```typescript
   * // Analyze all tables
   * await maintenance.analyze();
   * 
   * // Analyze specific tables
   * await maintenance.analyze({ tables: ['tasks', 'boards'] });
   * ```
   */
  public async analyze(options: {
    tables?: string[];
  } = {}): Promise<MaintenanceResult> {
    const startTime = Date.now();
    const operation = 'analyze';

    try {
      if (this.config.enableLogging) {
        logger.info('Starting analyze operation', { options });
      }

      const tables = options.tables || await this.getAllTableNames();
      const analyzedTables: string[] = [];

      for (const table of tables) {
        try {
          await this.db.getDatabase().exec(`ANALYZE ${table}`);
          analyzedTables.push(table);
        } catch (error) {
          logger.warn('Failed to analyze table', {
            table,
            error: (error as Error).message,
          });
        }
      }

      // Update general statistics
      await this.db.getDatabase().exec('ANALYZE');

      const duration = Date.now() - startTime;
      const result: MaintenanceResult = {
        operation,
        success: true,
        duration,
        details: {
          tablesAnalyzed: analyzedTables,
          totalTables: tables.length,
          successRate: `${((analyzedTables.length / tables.length) * 100).toFixed(1)}%`,
        },
      };

      if (this.config.enableLogging) {
        logger.info('Analyze operation completed', {
          duration: `${duration}ms`,
          tablesAnalyzed: analyzedTables.length,
          totalTables: tables.length,
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const result: MaintenanceResult = {
        operation,
        success: false,
        duration,
        error: (error as Error).message,
      };

      if (this.config.enableLogging) {
        logger.error('Analyze operation failed', {
          duration: `${duration}ms`,
          error: (error as Error).message,
        });
      }

      return result;
    }
  }

  /**
   * Optimize database by running PRAGMA optimize
   * 
   * @returns {Promise<MaintenanceResult>} Operation result
   * 
   * @example
   * ```typescript
   * const result = await maintenance.optimize();
   * console.log('Optimization completed:', result.success);
   * ```
   */
  public async optimize(): Promise<MaintenanceResult> {
    const startTime = Date.now();
    const operation = 'optimize';

    try {
      if (this.config.enableLogging) {
        logger.info('Starting optimization operation');
      }

      // Run SQLite optimization
      await this.db.getDatabase().exec('PRAGMA optimize');

      const duration = Date.now() - startTime;
      const result: MaintenanceResult = {
        operation,
        success: true,
        duration,
        details: {
          optimizations: 'Query planner optimizations applied',
        },
      };

      if (this.config.enableLogging) {
        logger.info('Optimization operation completed', {
          duration: `${duration}ms`,
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const result: MaintenanceResult = {
        operation,
        success: false,
        duration,
        error: (error as Error).message,
      };

      if (this.config.enableLogging) {
        logger.error('Optimization operation failed', {
          duration: `${duration}ms`,
          error: (error as Error).message,
        });
      }

      return result;
    }
  }

  /**
   * Check and defragment WAL file if needed
   * 
   * @returns {Promise<MaintenanceResult>} Operation result
   * 
   * @example
   * ```typescript
   * const result = await maintenance.checkpointWal();
   * console.log('WAL checkpoint completed:', result.success);
   * ```
   */
  public async checkpointWal(): Promise<MaintenanceResult> {
    const startTime = Date.now();
    const operation = 'wal_checkpoint';

    try {
      if (this.config.enableLogging) {
        logger.info('Starting WAL checkpoint operation');
      }

      // Check if WAL mode is enabled
      const walMode = await this.db.queryOne<{ journal_mode: string }>('PRAGMA journal_mode');
      if (walMode?.journal_mode !== 'wal') {
        return {
          operation,
          success: true,
          duration: Date.now() - startTime,
          details: {
            message: 'WAL mode not enabled, checkpoint not needed',
          },
        };
      }

      // Perform WAL checkpoint
      const checkpointResult = await this.db.queryOne<{
        busy: number;
        log: number;
        checkpointed: number;
      }>('PRAGMA wal_checkpoint(TRUNCATE)');

      const duration = Date.now() - startTime;
      const result: MaintenanceResult = {
        operation,
        success: true,
        duration,
        details: {
          pagesCheckpointed: checkpointResult?.checkpointed || 0,
          logPages: checkpointResult?.log || 0,
          busyPages: checkpointResult?.busy || 0,
        },
      };

      if (this.config.enableLogging) {
        logger.info('WAL checkpoint completed', {
          duration: `${duration}ms`,
          pagesCheckpointed: checkpointResult?.checkpointed,
          logPages: checkpointResult?.log,
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const result: MaintenanceResult = {
        operation,
        success: false,
        duration,
        error: (error as Error).message,
      };

      if (this.config.enableLogging) {
        logger.error('WAL checkpoint failed', {
          duration: `${duration}ms`,
          error: (error as Error).message,
        });
      }

      return result;
    }
  }

  /**
   * Perform comprehensive database maintenance
   * 
   * @param {Object} options - Maintenance options
   * @param {boolean} [options.includeVacuum=true] - Include vacuum operation
   * @param {boolean} [options.includeAnalyze=true] - Include analyze operation
   * @param {boolean} [options.includeOptimize=true] - Include optimize operation
   * @param {boolean} [options.includeWalCheckpoint=true] - Include WAL checkpoint
   * @returns {Promise<MaintenanceResult[]>} Array of operation results
   * 
   * @example
   * ```typescript
   * // Full maintenance
   * const results = await maintenance.performFullMaintenance();
   * const successful = results.filter(r => r.success).length;
   * console.log(`${successful}/${results.length} operations successful`);
   * 
   * // Selective maintenance
   * const results = await maintenance.performFullMaintenance({
   *   includeVacuum: false,
   *   includeAnalyze: true
   * });
   * ```
   */
  public async performFullMaintenance(options: {
    includeVacuum?: boolean;
    includeAnalyze?: boolean;
    includeOptimize?: boolean;
    includeWalCheckpoint?: boolean;
  } = {}): Promise<MaintenanceResult[]> {
    const {
      includeVacuum = true,
      includeAnalyze = true,
      includeOptimize = true,
      includeWalCheckpoint = true,
    } = options;

    const results: MaintenanceResult[] = [];
    const startTime = Date.now();

    if (this.config.enableLogging) {
      logger.info('Starting full database maintenance', {
        includeVacuum,
        includeAnalyze,
        includeOptimize,
        includeWalCheckpoint,
      });
    }

    try {
      // WAL checkpoint first (if enabled)
      if (includeWalCheckpoint) {
        const walResult = await this.checkpointWal();
        results.push(walResult);
      }

      // Analyze statistics (before vacuum for better planning)
      if (includeAnalyze) {
        const analyzeResult = await this.analyze();
        results.push(analyzeResult);
      }

      // Vacuum (space reclamation)
      if (includeVacuum) {
        const vacuumResult = await this.vacuum();
        results.push(vacuumResult);
      }

      // Optimize (query planner updates)
      if (includeOptimize) {
        const optimizeResult = await this.optimize();
        results.push(optimizeResult);
      }

      const totalDuration = Date.now() - startTime;
      const successful = results.filter(r => r.success).length;
      const failed = results.length - successful;

      if (this.config.enableLogging) {
        logger.info('Full database maintenance completed', {
          totalDuration: `${totalDuration}ms`,
          operationsRun: results.length,
          successful,
          failed,
          operations: results.map(r => ({ operation: r.operation, success: r.success })),
        });
      }

      return results;
    } catch (error) {
      if (this.config.enableLogging) {
        logger.error('Full database maintenance failed', {
          error: (error as Error).message,
          completedOperations: results.length,
        });
      }
      throw error;
    }
  }

  /**
   * Get maintenance recommendations based on database statistics
   * 
   * @returns {Promise<{recommendations: string[], stats: any}>} Maintenance recommendations
   * 
   * @example
   * ```typescript
   * const { recommendations, stats } = await maintenance.getRecommendations();
   * recommendations.forEach(rec => console.log('Recommendation:', rec));
   * ```
   */
  public async getRecommendations(): Promise<{
    recommendations: string[];
    stats: any;
  }> {
    const stats = await this.db.getStats();
    const recommendations: string[] = [];

    // Check database size
    const sizeMB = stats.size / 1024 / 1024;
    if (sizeMB > 100) {
      recommendations.push('Database is large (>100MB). Consider running VACUUM to reclaim space.');
    }

    // Check page count vs optimal
    const optimalPages = Math.ceil(stats.size / 4096); // 4KB pages
    if (stats.pageCount > optimalPages * 1.2) {
      recommendations.push('Database may be fragmented. VACUUM recommended.');
    }

    // Check if WAL mode checkpoint is needed
    try {
      const walMode = await this.db.queryOne<{ journal_mode: string }>('PRAGMA journal_mode');
      if (walMode?.journal_mode === 'wal') {
        const walInfo = await this.db.queryOne<{ wal_size: number }>('PRAGMA wal_checkpoint(PASSIVE)');
        if (walInfo && walInfo.wal_size > 1000) {
          recommendations.push('WAL file is large. Consider running WAL checkpoint.');
        }
      }
    } catch {
      // WAL info not available, skip recommendation
    }

    // Check for missing analyze
    try {
      const lastAnalyze = await this.db.queryOne<{ value: string }>(`
        SELECT value FROM pragma_stats WHERE name = 'analyze_last_run'
      `);
      
      if (!lastAnalyze) {
        recommendations.push('Statistics may be outdated. Run ANALYZE to update query planner.');
      }
    } catch {
      recommendations.push('Statistics status unknown. Consider running ANALYZE.');
    }

    // General recommendations
    if (recommendations.length === 0) {
      recommendations.push('Database appears to be in good condition. Regular maintenance recommended.');
    }

    return {
      recommendations,
      stats: {
        sizeMB: parseFloat(sizeMB.toFixed(2)),
        pageCount: stats.pageCount,
        pageSize: stats.pageSize,
        walMode: stats.walMode,
        tables: stats.tables,
      },
    };
  }

  /**
   * Get all table names in the database
   * 
   * @private
   * @returns {Promise<string[]>} Array of table names
   */
  private async getAllTableNames(): Promise<string[]> {
    const tables = await this.db.query<{ name: string }>(`
      SELECT name FROM sqlite_master 
      WHERE type = 'table' 
      AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `);
    
    return tables.map(table => table.name);
  }
}

/**
 * Create a maintenance manager instance with database connection
 * 
 * @param {DatabaseConnection} db - Database connection instance
 * @param {Partial<MaintenanceConfig>} [config] - Optional configuration
 * @returns {MaintenanceManager} Configured maintenance manager
 * 
 * @example
 * ```typescript
 * import { dbConnection } from '@/database/connection';
 * import { createMaintenanceManager } from '@/database/maintenance';
 * 
 * const maintenance = createMaintenanceManager(dbConnection, {
 *   autoVacuum: true,
 *   vacuumThreshold: 20 // 20MB threshold
 * });
 * ```
 */
export function createMaintenanceManager(
  db: DatabaseConnection,
  config?: Partial<MaintenanceConfig>
): MaintenanceManager {
  return new MaintenanceManager(db, config);
}