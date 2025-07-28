/**
 * Migration: Database Schema Enhancements for Phase 15.7
 * Adds priority scoring persistence, backup metadata tracking, and performance monitoring
 */

import type { Database } from 'sqlite3';
import { promisify } from 'util';

export async function up(db: Database): Promise<void> {
  const run = promisify(db.run.bind(db));

  try {
    // 1. Add priority scoring persistence table
    await run(`
      CREATE TABLE IF NOT EXISTS priority_scores (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        algorithm_version TEXT NOT NULL DEFAULT 'v1.2',
        base_priority INTEGER NOT NULL,
        calculated_score REAL NOT NULL,
        urgency_factor REAL DEFAULT 0,
        complexity_factor REAL DEFAULT 0,
        dependency_factor REAL DEFAULT 0,
        age_factor REAL DEFAULT 0,
        context_factors TEXT, -- JSON string with additional factors
        calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME DEFAULT (datetime('now', '+1 hour')),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);

    // 2. Add backup metadata tracking table
    await run(`
      CREATE TABLE IF NOT EXISTS backup_metadata (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        backup_type TEXT NOT NULL CHECK (backup_type IN ('full', 'incremental')),
        status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'corrupted')),
        file_path TEXT NOT NULL,
        file_size INTEGER DEFAULT 0,
        compressed BOOLEAN DEFAULT FALSE,
        encrypted BOOLEAN DEFAULT FALSE,
        verified BOOLEAN DEFAULT FALSE,
        checksum TEXT NOT NULL,
        parent_backup_id TEXT, -- For incremental backups
        retention_policy TEXT,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        verified_at DATETIME,
        FOREIGN KEY (parent_backup_id) REFERENCES backup_metadata(id) ON DELETE SET NULL
      )
    `);

    // 3. Add database performance monitoring table
    await run(`
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id TEXT PRIMARY KEY,
        metric_type TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        metric_value REAL NOT NULL,
        metric_unit TEXT DEFAULT '',
        context TEXT, -- JSON string with additional context
        recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4. Add database maintenance log table
    await run(`
      CREATE TABLE IF NOT EXISTS maintenance_log (
        id TEXT PRIMARY KEY,
        operation_type TEXT NOT NULL,
        operation_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        duration_ms INTEGER,
        records_affected INTEGER DEFAULT 0,
        error_message TEXT,
        context TEXT -- JSON string with operation details
      )
    `);

    // 5. Create indexes for performance
    await run('CREATE INDEX IF NOT EXISTS idx_priority_scores_task_id ON priority_scores(task_id)');
    await run(
      'CREATE INDEX IF NOT EXISTS idx_priority_scores_calculated_at ON priority_scores(calculated_at)'
    );
    await run(
      'CREATE INDEX IF NOT EXISTS idx_priority_scores_expires_at ON priority_scores(expires_at)'
    );

    await run(
      'CREATE INDEX IF NOT EXISTS idx_backup_metadata_created_at ON backup_metadata(created_at)'
    );
    await run('CREATE INDEX IF NOT EXISTS idx_backup_metadata_status ON backup_metadata(status)');
    await run(
      'CREATE INDEX IF NOT EXISTS idx_backup_metadata_type ON backup_metadata(backup_type)'
    );

    await run(
      'CREATE INDEX IF NOT EXISTS idx_performance_metrics_type ON performance_metrics(metric_type)'
    );
    await run(
      'CREATE INDEX IF NOT EXISTS idx_performance_metrics_recorded_at ON performance_metrics(recorded_at)'
    );

    await run(
      'CREATE INDEX IF NOT EXISTS idx_maintenance_log_operation_type ON maintenance_log(operation_type)'
    );
    await run(
      'CREATE INDEX IF NOT EXISTS idx_maintenance_log_started_at ON maintenance_log(started_at)'
    );

    // 6. Create view for active priority scores
    await run(`
      CREATE VIEW IF NOT EXISTS active_priority_scores AS
      SELECT 
        ps.*,
        t.title as task_title,
        t.status as task_status
      FROM priority_scores ps
      JOIN tasks t ON ps.task_id = t.id
      WHERE ps.expires_at > datetime('now')
      ORDER BY ps.calculated_score DESC
    `);

    // 7. Create view for backup summary
    await run(`
      CREATE VIEW IF NOT EXISTS backup_summary AS
      SELECT 
        backup_type,
        status,
        COUNT(*) as count,
        SUM(file_size) as total_size,
        AVG(file_size) as avg_size,
        MIN(created_at) as oldest_backup,
        MAX(created_at) as newest_backup
      FROM backup_metadata
      GROUP BY backup_type, status
    `);

    // 8. Add triggers for automatic priority score cleanup
    await run(`
      CREATE TRIGGER IF NOT EXISTS cleanup_expired_priority_scores
      AFTER INSERT ON priority_scores
      BEGIN
        DELETE FROM priority_scores 
        WHERE expires_at < datetime('now', '-1 day');
      END
    `);

    // 9. Add trigger for performance metrics cleanup (keep last 30 days)
    await run(`
      CREATE TRIGGER IF NOT EXISTS cleanup_old_performance_metrics
      AFTER INSERT ON performance_metrics
      BEGIN
        DELETE FROM performance_metrics 
        WHERE recorded_at < datetime('now', '-30 days');
      END
    `);

    // 10. Add trigger for maintenance log cleanup (keep last 90 days)
    await run(`
      CREATE TRIGGER IF NOT EXISTS cleanup_old_maintenance_log
      AFTER INSERT ON maintenance_log
      BEGIN
        DELETE FROM maintenance_log 
        WHERE started_at < datetime('now', '-90 days');
      END
    `);
  } catch (error) {
    throw error;
  }
}

export async function down(db: Database): Promise<void> {
  const run = promisify(db.run.bind(db));

  try {
    // Drop triggers first
    await run('DROP TRIGGER IF EXISTS cleanup_expired_priority_scores');
    await run('DROP TRIGGER IF EXISTS cleanup_old_performance_metrics');
    await run('DROP TRIGGER IF EXISTS cleanup_old_maintenance_log');

    // Drop views
    await run('DROP VIEW IF EXISTS active_priority_scores');
    await run('DROP VIEW IF EXISTS backup_summary');

    // Drop tables
    await run('DROP TABLE IF EXISTS priority_scores');
    await run('DROP TABLE IF EXISTS backup_metadata');
    await run('DROP TABLE IF EXISTS performance_metrics');
    await run('DROP TABLE IF EXISTS maintenance_log');
  } catch (error) {
    throw error;
  }
}
