/**
 * Database statistics collection and monitoring utilities
 * 
 * @module database/stats
 * @description This module provides comprehensive database statistics collection,
 * performance monitoring, and health metrics for SQLite databases. It tracks
 * query performance, table statistics, index usage, and system metrics.
 * 
 * @example
 * ```typescript
 * import { StatisticsCollector } from '@/database/stats';
 * 
 * const stats = new StatisticsCollector(dbConnection);
 * 
 * // Get comprehensive stats
 * const summary = await stats.getStatsSummary();
 * console.log('Database health:', summary.health.score);
 * 
 * // Monitor query performance
 * stats.startQueryMonitoring();
 * ```
 */

import { logger } from '@/utils/logger';
import type { DatabaseConnection } from './connection';

/**
 * Database performance statistics
 */
export interface DatabaseStats {
  /** Database file information */
  database: {
    size: number;
    sizeFormatted: string;
    pageCount: number;
    pageSize: number;
    utilization: number;
  };
  /** Table statistics */
  tables: TableStats[];
  /** Index usage statistics */
  indexes: IndexStats[];
  /** Query performance metrics */
  queries: QueryStats;
  /** System health metrics */
  health: HealthMetrics;
  /** Timestamp when stats were collected */
  timestamp: Date;
}

/**
 * Statistics for a single table
 */
export interface TableStats {
  name: string;
  rowCount: number;
  size: number;
  sizeFormatted: string;
  averageRowSize: number;
  indexCount: number;
  lastModified?: Date;
}

/**
 * Index usage statistics
 */
export interface IndexStats {
  name: string;
  tableName: string;
  columns: string[];
  isUnique: boolean;
  usageCount: number;
  lastUsed?: Date;
  efficiency: number;
}

/**
 * Query performance statistics
 */
export interface QueryStats {
  totalQueries: number;
  averageExecutionTime: number;
  slowestQuery: {
    sql: string;
    duration: number;
    timestamp: Date;
  } | null;
  fastestQuery: {
    sql: string;
    duration: number;
    timestamp: Date;
  } | null;
  errorRate: number;
  queryTypes: {
    select: number;
    insert: number;
    update: number;
    delete: number;
    other: number;
  };
}

/**
 * System health metrics
 */
export interface HealthMetrics {
  score: number; // 0-100
  status: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  issues: string[];
  recommendations: string[];
  lastCheck: Date;
  responseTime: number;
  connectionStatus: 'connected' | 'disconnected' | 'error';
}

/**
 * Configuration for statistics collection
 */
export interface StatsConfig {
  /** Enable query performance monitoring */
  enableQueryMonitoring: boolean;
  /** Maximum number of queries to track */
  maxQueryHistory: number;
  /** Threshold for slow queries in milliseconds */
  slowQueryThreshold: number;
  /** Enable automatic statistics collection */
  autoCollect: boolean;
  /** Collection interval in milliseconds */
  collectionInterval: number;
  /** Enable detailed logging */
  enableLogging: boolean;
}

/**
 * Query execution record for monitoring
 */
interface QueryRecord {
  sql: string;
  duration: number;
  timestamp: Date;
  success: boolean;
  error?: string;
}

/**
 * Database statistics collector and monitor
 * 
 * @class StatisticsCollector
 * @description Collects comprehensive database statistics including performance
 * metrics, table information, index usage, and health indicators. Provides
 * real-time monitoring and historical tracking capabilities.
 */
export class StatisticsCollector {
  private readonly db: DatabaseConnection;
  private readonly config: StatsConfig;
  private queryHistory: QueryRecord[] = [];
  private monitoringActive = false;
  private collectionTimer?: NodeJS.Timeout;

  constructor(db: DatabaseConnection, config: Partial<StatsConfig> = {}) {
    this.db = db;
    this.config = {
      enableQueryMonitoring: true,
      maxQueryHistory: 1000,
      slowQueryThreshold: 1000, // 1 second
      autoCollect: false,
      collectionInterval: 300000, // 5 minutes
      enableLogging: true,
      ...config,
    };
  }

  /**
   * Get comprehensive database statistics summary
   * 
   * @returns {Promise<DatabaseStats>} Complete database statistics
   * 
   * @example
   * ```typescript
   * const stats = await collector.getStatsSummary();
   * console.log(`Database size: ${stats.database.sizeFormatted}`);
   * console.log(`Health score: ${stats.health.score}/100`);
   * console.log(`Total tables: ${stats.tables.length}`);
   * ```
   */
  public async getStatsSummary(): Promise<DatabaseStats> {
    const startTime = Date.now();

    try {
      if (this.config.enableLogging) {
        logger.debug('Collecting database statistics');
      }

      const [databaseStats, tableStats, indexStats, queryStats, healthMetrics] = await Promise.all([
        this.getDatabaseInfo(),
        this.getTableStatistics(),
        this.getIndexStatistics(),
        this.getQueryStatistics(),
        this.getHealthMetrics(),
      ]);

      const stats: DatabaseStats = {
        database: databaseStats,
        tables: tableStats,
        indexes: indexStats,
        queries: queryStats,
        health: healthMetrics,
        timestamp: new Date(),
      };

      const duration = Date.now() - startTime;
      if (this.config.enableLogging) {
        logger.debug('Database statistics collected', {
          duration: `${duration}ms`,
          tablesAnalyzed: tableStats.length,
          indexesAnalyzed: indexStats.length,
          healthScore: healthMetrics.score,
        });
      }

      return stats;
    } catch (error) {
      logger.error('Failed to collect database statistics', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Get basic database information
   * 
   * @returns {Promise<DatabaseStats['database']>} Database file information
   */
  public async getDatabaseInfo(): Promise<DatabaseStats['database']> {
    const stats = await this.db.getStats();
    const utilization = stats.pageCount > 0 ? (stats.size / (stats.pageCount * stats.pageSize)) * 100 : 0;

    return {
      size: stats.size,
      sizeFormatted: this.formatBytes(stats.size),
      pageCount: stats.pageCount,
      pageSize: stats.pageSize,
      utilization: Math.round(utilization * 100) / 100,
    };
  }

  /**
   * Get statistics for all tables
   * 
   * @returns {Promise<TableStats[]>} Array of table statistics
   */
  public async getTableStatistics(): Promise<TableStats[]> {
    const tables = await this.db.query<{ name: string }>(`
      SELECT name FROM sqlite_master 
      WHERE type = 'table' 
      AND name NOT LIKE 'sqlite_%'
      AND name NOT LIKE '%_migrations'
      ORDER BY name
    `);

    const tableStats: TableStats[] = [];

    for (const table of tables) {
      try {
        const [rowCountResult, sizeResult, indexCountResult] = await Promise.all([
          this.db.queryOne<{ count: number }>(`SELECT COUNT(*) as count FROM "${table.name}"`),
          this.db.queryOne<{ size: number }>(`
            SELECT SUM(pgsize) as size 
            FROM dbstat 
            WHERE name = ?
          `, [table.name]),
          this.db.queryOne<{ count: number }>(`
            SELECT COUNT(*) as count 
            FROM sqlite_master 
            WHERE type = 'index' 
            AND tbl_name = ?
            AND name NOT LIKE 'sqlite_%'
          `, [table.name]),
        ]);

        const rowCount = rowCountResult?.count || 0;
        const size = sizeResult?.size || 0;
        const indexCount = indexCountResult?.count || 0;
        const averageRowSize = rowCount > 0 ? Math.round(size / rowCount) : 0;

        // Try to get last modification time from a common timestamp column
        let lastModified: Date | undefined;
        try {
          const timestampColumns = ['updated_at', 'modified_at', 'created_at'];
          for (const col of timestampColumns) {
            const result = await this.db.queryOne<{ max_time: string }>(`
              SELECT MAX("${col}") as max_time 
              FROM "${table.name}"
            `).catch(() => null);
            
            if (result?.max_time) {
              lastModified = new Date(result.max_time);
              break;
            }
          }
        } catch {
          // Column doesn't exist or other error, skip timestamp
        }

        tableStats.push({
          name: table.name,
          rowCount,
          size,
          sizeFormatted: this.formatBytes(size),
          averageRowSize,
          indexCount,
          lastModified,
        });
      } catch (error) {
        logger.warn('Failed to get statistics for table', {
          table: table.name,
          error: (error as Error).message,
        });
      }
    }

    return tableStats.sort((a, b) => b.size - a.size);
  }

  /**
   * Get index usage statistics
   * 
   * @returns {Promise<IndexStats[]>} Array of index statistics
   */
  public async getIndexStatistics(): Promise<IndexStats[]> {
    const indexes = await this.db.query<{
      name: string;
      tbl_name: string;
      unique: number;
      sql: string;
    }>(`
      SELECT name, tbl_name, "unique", sql
      FROM sqlite_master 
      WHERE type = 'index' 
      AND name NOT LIKE 'sqlite_%'
      ORDER BY tbl_name, name
    `);

    const indexStats: IndexStats[] = [];

    for (const index of indexes) {
      try {
        // Parse columns from CREATE INDEX statement
        const columns = this.parseIndexColumns(index.sql);
        
        // Get index usage statistics (if available)
        let usageCount = 0;
        let efficiency = 0;
        
        try {
          // Try to get usage statistics from sqlite_stat1 if available
          const usageResult = await this.db.queryOne<{ stat: string }>(`
            SELECT stat FROM sqlite_stat1 WHERE tbl = ? AND idx = ?
          `, [index.tbl_name, index.name]);
          
          if (usageResult?.stat) {
            // Parse stat string to estimate efficiency
            const statParts = usageResult.stat.split(' ');
            if (statParts.length > 1) {
              efficiency = Math.min(100, Math.round((parseInt(statParts[0]) / parseInt(statParts[1])) * 100));
            }
          }
        } catch {
          // Statistics not available
        }

        indexStats.push({
          name: index.name,
          tableName: index.tbl_name,
          columns,
          isUnique: index.unique === 1,
          usageCount,
          efficiency,
        });
      } catch (error) {
        logger.warn('Failed to get statistics for index', {
          index: index.name,
          error: (error as Error).message,
        });
      }
    }

    return indexStats;
  }

  /**
   * Get query performance statistics
   * 
   * @returns {Promise<QueryStats>} Query performance metrics
   */
  public async getQueryStatistics(): Promise<QueryStats> {
    if (!this.config.enableQueryMonitoring || this.queryHistory.length === 0) {
      return {
        totalQueries: 0,
        averageExecutionTime: 0,
        slowestQuery: null,
        fastestQuery: null,
        errorRate: 0,
        queryTypes: {
          select: 0,
          insert: 0,
          update: 0,
          delete: 0,
          other: 0,
        },
      };
    }

    const successfulQueries = this.queryHistory.filter(q => q.success);
    const totalQueries = this.queryHistory.length;
    const totalDuration = successfulQueries.reduce((sum, q) => sum + q.duration, 0);
    const averageExecutionTime = successfulQueries.length > 0 ? totalDuration / successfulQueries.length : 0;

    // Find slowest and fastest queries
    const slowestQuery = successfulQueries.reduce((slowest, current) => 
      current.duration > slowest.duration ? current : slowest, successfulQueries[0]);
    
    const fastestQuery = successfulQueries.reduce((fastest, current) => 
      current.duration < fastest.duration ? current : fastest, successfulQueries[0]);

    // Calculate error rate
    const errorCount = this.queryHistory.filter(q => !q.success).length;
    const errorRate = totalQueries > 0 ? (errorCount / totalQueries) * 100 : 0;

    // Categorize query types
    const queryTypes = {
      select: 0,
      insert: 0,
      update: 0,
      delete: 0,
      other: 0,
    };

    this.queryHistory.forEach(query => {
      const sql = query.sql.trim().toLowerCase();
      if (sql.startsWith('select')) {
        queryTypes.select++;
      } else if (sql.startsWith('insert')) {
        queryTypes.insert++;
      } else if (sql.startsWith('update')) {
        queryTypes.update++;
      } else if (sql.startsWith('delete')) {
        queryTypes.delete++;
      } else {
        queryTypes.other++;
      }
    });

    return {
      totalQueries,
      averageExecutionTime: Math.round(averageExecutionTime * 100) / 100,
      slowestQuery: slowestQuery ? {
        sql: slowestQuery.sql.substring(0, 100) + (slowestQuery.sql.length > 100 ? '...' : ''),
        duration: slowestQuery.duration,
        timestamp: slowestQuery.timestamp,
      } : null,
      fastestQuery: fastestQuery ? {
        sql: fastestQuery.sql.substring(0, 100) + (fastestQuery.sql.length > 100 ? '...' : ''),
        duration: fastestQuery.duration,
        timestamp: fastestQuery.timestamp,
      } : null,
      errorRate: Math.round(errorRate * 100) / 100,
      queryTypes,
    };
  }

  /**
   * Get system health metrics
   * 
   * @returns {Promise<HealthMetrics>} Health assessment
   */
  public async getHealthMetrics(): Promise<HealthMetrics> {
    const startTime = Date.now();
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    try {
      // Test database responsiveness
      await this.db.queryOne('SELECT 1');
      const responseTime = Date.now() - startTime;

      // Check response time
      if (responseTime > 1000) {
        issues.push('Slow database response time');
        recommendations.push('Consider running VACUUM and ANALYZE');
        score -= 20;
      } else if (responseTime > 500) {
        issues.push('Moderately slow response time');
        score -= 10;
      }

      // Check database size and fragmentation
      const stats = await this.db.getStats();
      const sizeMB = stats.size / 1024 / 1024;
      
      if (sizeMB > 500) {
        issues.push('Large database size');
        recommendations.push('Consider archiving old data or partitioning');
        score -= 10;
      }

      // Check for potential fragmentation
      if (stats.pageCount > (stats.size / stats.pageSize) * 1.3) {
        issues.push('Database may be fragmented');
        recommendations.push('Run VACUUM to reclaim space and defragment');
        score -= 15;
      }

      // Check query performance
      if (this.config.enableQueryMonitoring && this.queryHistory.length > 0) {
        const queryStats = await this.getQueryStatistics();
        
        if (queryStats.errorRate > 5) {
          issues.push(`High query error rate: ${queryStats.errorRate}%`);
          recommendations.push('Review and fix failing queries');
          score -= 25;
        }

        if (queryStats.averageExecutionTime > this.config.slowQueryThreshold) {
          issues.push('Slow average query execution time');
          recommendations.push('Optimize slow queries and add indexes');
          score -= 15;
        }
      }

      // Determine status based on score
      let status: HealthMetrics['status'];
      if (score >= 90) status = 'excellent';
      else if (score >= 75) status = 'good';
      else if (score >= 50) status = 'fair';
      else if (score >= 25) status = 'poor';
      else status = 'critical';

      return {
        score: Math.max(0, score),
        status,
        issues,
        recommendations,
        lastCheck: new Date(),
        responseTime,
        connectionStatus: 'connected',
      };
    } catch (error) {
      return {
        score: 0,
        status: 'critical',
        issues: ['Database connection failed'],
        recommendations: ['Check database connection and restart if necessary'],
        lastCheck: new Date(),
        responseTime: Date.now() - startTime,
        connectionStatus: 'error',
      };
    }
  }

  /**
   * Start monitoring query performance
   * 
   * @example
   * ```typescript
   * // Start monitoring
   * collector.startQueryMonitoring();
   * 
   * // Run some queries...
   * await db.query('SELECT * FROM tasks');
   * 
   * // Get performance stats
   * const stats = await collector.getQueryStatistics();
   * ```
   */
  public startQueryMonitoring(): void {
    if (this.monitoringActive) return;

    this.monitoringActive = true;
    if (this.config.enableLogging) {
      logger.info('Started query performance monitoring');
    }

    // Hook into database query methods (this is a simplified example)
    // In a real implementation, you'd intercept queries at the database layer
  }

  /**
   * Stop monitoring query performance
   */
  public stopQueryMonitoring(): void {
    this.monitoringActive = false;
    if (this.config.enableLogging) {
      logger.info('Stopped query performance monitoring');
    }
  }

  /**
   * Record a query execution for monitoring
   * 
   * @param {string} sql - SQL query that was executed
   * @param {number} duration - Execution time in milliseconds
   * @param {boolean} success - Whether the query succeeded
   * @param {string} [error] - Error message if query failed
   */
  public recordQuery(sql: string, duration: number, success: boolean, error?: string): void {
    if (!this.config.enableQueryMonitoring) return;

    const record: QueryRecord = {
      sql,
      duration,
      timestamp: new Date(),
      success,
      error,
    };

    this.queryHistory.push(record);

    // Trim history if it exceeds max size
    if (this.queryHistory.length > this.config.maxQueryHistory) {
      this.queryHistory = this.queryHistory.slice(-this.config.maxQueryHistory);
    }

    // Log slow queries
    if (duration > this.config.slowQueryThreshold && this.config.enableLogging) {
      logger.warn('Slow query detected', {
        sql: sql.substring(0, 200) + (sql.length > 200 ? '...' : ''),
        duration: `${duration}ms`,
        success,
        error,
      });
    }
  }

  /**
   * Clear query history
   */
  public clearQueryHistory(): void {
    this.queryHistory = [];
    if (this.config.enableLogging) {
      logger.info('Query history cleared');
    }
  }

  /**
   * Export statistics to JSON
   * 
   * @returns {Promise<string>} JSON string of statistics
   */
  public async exportStats(): Promise<string> {
    const stats = await this.getStatsSummary();
    return JSON.stringify(stats, null, 2);
  }

  /**
   * Parse columns from CREATE INDEX SQL statement
   * 
   * @private
   * @param {string} sql - CREATE INDEX SQL statement
   * @returns {string[]} Array of column names
   */
  private parseIndexColumns(sql: string): string[] {
    if (!sql) return [];

    try {
      // Extract column list from CREATE INDEX statement
      const match = sql.match(/\((.*?)\)/);
      if (match && match[1]) {
        return match[1]
          .split(',')
          .map(col => col.trim().replace(/["`\[\]]/g, ''))
          .filter(col => col.length > 0);
      }
    } catch {
      // Parsing failed, return empty array
    }

    return [];
  }

  /**
   * Format bytes to human-readable string
   * 
   * @private
   * @param {number} bytes - Number of bytes
   * @returns {string} Formatted string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

/**
 * Create a statistics collector instance
 * 
 * @param {DatabaseConnection} db - Database connection
 * @param {Partial<StatsConfig>} [config] - Optional configuration
 * @returns {StatisticsCollector} Configured statistics collector
 * 
 * @example
 * ```typescript
 * import { dbConnection } from '@/database/connection';
 * import { createStatsCollector } from '@/database/stats';
 * 
 * const collector = createStatsCollector(dbConnection, {
 *   enableQueryMonitoring: true,
 *   slowQueryThreshold: 500
 * });
 * ```
 */
export function createStatsCollector(
  db: DatabaseConnection,
  config?: Partial<StatsConfig>
): StatisticsCollector {
  return new StatisticsCollector(db, config);
}