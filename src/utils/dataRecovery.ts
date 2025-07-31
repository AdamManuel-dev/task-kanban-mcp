/**
 * @fileoverview Data corruption recovery utilities for database integrity
 * @lastmodified 2025-07-28T10:45:00Z
 *
 * Features: Corruption detection, data repair, integrity validation, backup restoration
 * Main APIs: detectCorruption(), repairData(), validateIntegrity(), recoverFromBackup()
 * Constraints: Requires SQLite database, backup system, transaction support
 * Patterns: Error recovery, data validation, automated repair, rollback strategies
 */

import type { Database } from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';
import { dbConnection } from '../database/connection';
import { logger } from './logger';

interface CorruptionReport {
  corrupted: boolean;
  issues: CorruptionIssue[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  repairRecommendations: string[];
}

interface CorruptionIssue {
  type:
    | 'missing_foreign_key'
    | 'invalid_data'
    | 'constraint_violation'
    | 'orphaned_record'
    | 'duplicate_key'
    | 'schema_mismatch';
  table: string;
  column?: string;
  recordId?: string | number;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  repairStrategy: string;
  canAutoRepair: boolean;
}

interface RecoveryOptions {
  attemptAutoRepair: boolean;
  createBackupBeforeRepair: boolean;
  validateAfterRepair: boolean;
  maxRepairAttempts: number;
}

interface ForeignKeyViolation {
  table: string;
  rowid: string | number;
  fkid: string | number;
  parent?: string;
}

export class DataRecoveryManager {
  private db: Database;

  private readonly backupDir: string;

  constructor(database: Database, backupDirectory = './backups') {
    this.db = database;
    this.backupDir = backupDirectory;
  }

  /**
   * Detect data corruption in the database
   */
  detectCorruption(): CorruptionReport {
    logger.info('Starting corruption detection scan...');

    const issues: CorruptionIssue[] = [];

    try {
      // Check database integrity using SQLite's built-in PRAGMA
      const integrityCheck = this.db.pragma('integrity_check') as Array<{
        integrity_check: string;
      }>;
      if (integrityCheck.length > 0 && integrityCheck[0].integrity_check !== 'ok') {
        issues.push({
          type: 'schema_mismatch',
          table: 'database',
          description: `SQLite integrity check failed: ${integrityCheck[0].integrity_check}`,
          severity: 'critical',
          repairStrategy: 'Requires database repair or restoration from backup',
          canAutoRepair: false,
        });
      }

      // Check foreign key constraints
      this.checkForeignKeyConstraints(issues);

      // Check for orphaned records
      this.checkOrphanedRecords(issues);

      // Check for duplicate primary keys
      this.checkDuplicateKeys(issues);

      // Check data validity
      this.checkDataValidity(issues);

      // Check table consistency
      this.checkTableConsistency(issues);
    } catch (error) {
      logger.error('Error during corruption detection', { error });
      issues.push({
        type: 'schema_mismatch',
        table: 'database',
        description: `Corruption detection failed: ${(error as Error).message}`,
        severity: 'critical',
        repairStrategy: 'Manual investigation required',
        canAutoRepair: false,
      });
    }

    const severity = this.calculateSeverity(issues);
    const recommendations = this.generateRepairRecommendations(issues);

    const report: CorruptionReport = {
      corrupted: issues.length > 0,
      issues,
      severity,
      repairRecommendations: recommendations,
    };

    logger.info(`Corruption scan complete: ${issues.length} issues found`, { severity });
    return report;
  }

  /**
   * Attempt to repair data corruption
   */
  async repairData(
    report: CorruptionReport,
    options: RecoveryOptions = {
      attemptAutoRepair: true,
      createBackupBeforeRepair: true,
      validateAfterRepair: true,
      maxRepairAttempts: 3,
    }
  ): Promise<{ success: boolean; repairedIssues: number; remainingIssues: CorruptionIssue[] }> {
    if (!report.corrupted) {
      return { success: true, repairedIssues: 0, remainingIssues: [] };
    }

    logger.info('Starting data repair process...', { totalIssues: report.issues.length });

    // Create backup before repair if requested
    if (options.createBackupBeforeRepair) {
      await this.createRecoveryBackup();
    }

    const repairableIssues = report.issues.filter(
      issue => issue.canAutoRepair && options.attemptAutoRepair
    );
    const unrepairedIssues = report.issues.filter(
      issue => !issue.canAutoRepair || !options.attemptAutoRepair
    );

    let repairedCount = 0;
    let attempts = 0;

    for (const issue of repairableIssues) {
      if (attempts >= options.maxRepairAttempts) {
        logger.warn('Maximum repair attempts reached');
        break;
      }

      try {
        const repaired = this.repairIssue(issue);
        if (repaired) {
          repairedCount++;
          logger.info(`Repaired issue: ${issue.description}`);
        } else {
          unrepairedIssues.push(issue);
        }
      } catch (error) {
        logger.error(`Failed to repair issue: ${issue.description}`, { error });
        unrepairedIssues.push(issue);
      }

      attempts++;
    }

    // Validate database after repair if requested
    if (options.validateAfterRepair && repairedCount > 0) {
      const postRepairReport = this.detectCorruption();
      if (postRepairReport.corrupted) {
        logger.warn('Database still has issues after repair', {
          remainingIssues: postRepairReport.issues.length,
        });
      }
    }

    const success = unrepairedIssues.length === 0;
    logger.info(
      `Repair process complete: ${repairedCount} repaired, ${unrepairedIssues.length} remaining`
    );

    return { success, repairedIssues: repairedCount, remainingIssues: unrepairedIssues };
  }

  /**
   * Validate database integrity
   */
  validateIntegrity(): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    try {
      // SQLite integrity check
      const integrityResult = this.db.pragma('integrity_check') as Array<{
        integrity_check: string;
      }>;
      if (integrityResult.length > 0 && integrityResult[0].integrity_check !== 'ok') {
        issues.push(`SQLite integrity check failed: ${integrityResult[0].integrity_check}`);
      }

      // Foreign key check
      const foreignKeyResult = this.db.pragma('foreign_key_check') as unknown[];
      if (foreignKeyResult.length > 0) {
        issues.push(`Foreign key violations found: ${foreignKeyResult.length} issues`);
      }

      // Quick count check
      const quickCountResult = this.db.pragma('quick_check') as Array<{ quick_check: string }>;
      if (quickCountResult.length > 0 && quickCountResult[0].quick_check !== 'ok') {
        issues.push(`Quick check failed: ${quickCountResult[0].quick_check}`);
      }
    } catch (error) {
      issues.push(`Integrity validation error: ${(error as Error).message}`);
    }

    return { valid: issues.length === 0, issues };
  }

  /**
   * Recover from backup
   */
  async recoverFromBackup(backupPath?: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Find the most recent backup if none specified
      if (!backupPath) {
        backupPath = (await this.findLatestBackup()) || undefined;
      }

      if (!backupPath) {
        return { success: false, error: 'No backup found' };
      }

      logger.info(`Recovering from backup: ${backupPath}`);

      // Create a recovery backup of current state
      await this.createRecoveryBackup();

      // Close current database connection
      this.db.close();

      // Replace current database with backup
      const currentDbPath = process.env.DATABASE_PATH ?? './data/kanban.db';
      await fs.copyFile(backupPath, currentDbPath);

      // Reconnect to database
      await dbConnection.initialize();
      this.db = dbConnection.getDatabase() as unknown as Database;

      // Validate recovered database
      const validation = this.validateIntegrity();
      if (!validation.valid) {
        logger.warn('Recovered database has integrity issues', { issues: validation.issues });
      }

      logger.info('Database recovery completed successfully');
      return { success: true };
    } catch (error) {
      logger.error('Database recovery failed', { error });
      return { success: false, error: (error as Error).message };
    }
  }

  private checkForeignKeyConstraints(issues: CorruptionIssue[]): void {
    // Enable foreign key checking temporarily
    this.db.pragma('foreign_keys = ON');

    const foreignKeyViolations = this.db.pragma('foreign_key_check') as ForeignKeyViolation[];

    for (const violation of foreignKeyViolations) {
      issues.push({
        type: 'missing_foreign_key',
        table: violation.table,
        recordId: violation.rowid,
        description: `Foreign key violation in table ${violation.table}: ${violation.fkid}`,
        severity: 'high',
        repairStrategy: 'Remove orphaned record or restore referenced record',
        canAutoRepair: true,
      });
    }
  }

  private checkOrphanedRecords(issues: CorruptionIssue[]): void {
    // Check for orphaned tasks (tasks without valid board)
    const orphanedTasks = this.db
      .prepare(
        `
      SELECT id FROM tasks
      WHERE board_id NOT IN (SELECT id FROM boards)
    `
      )
      .all();

    for (const task of orphanedTasks) {
      const taskRecord = task as { id: string };
      issues.push({
        type: 'orphaned_record',
        table: 'tasks',
        recordId: taskRecord.id,
        description: `Task ${taskRecord.id} references non-existent board`,
        severity: 'medium',
        repairStrategy: 'Remove orphaned task or restore referenced board',
        canAutoRepair: true,
      });
    }

    // Check for orphaned notes (notes without valid task)
    const orphanedNotes = this.db
      .prepare(
        `
      SELECT id FROM notes
      WHERE task_id NOT IN (SELECT id FROM tasks)
    `
      )
      .all();

    for (const note of orphanedNotes) {
      const noteRecord = note as { id: string };
      issues.push({
        type: 'orphaned_record',
        table: 'notes',
        recordId: noteRecord.id,
        description: `Note ${noteRecord.id} references non-existent task`,
        severity: 'low',
        repairStrategy: 'Remove orphaned note or restore referenced task',
        canAutoRepair: true,
      });
    }
  }

  private checkDuplicateKeys(issues: CorruptionIssue[]): void {
    const tables = ['boards', 'tasks', 'columns', 'notes', 'tags'];

    for (const table of tables) {
      const duplicates = this.db
        .prepare(
          `
        SELECT id, COUNT(*) as count
        FROM ${table}
        GROUP BY id
        HAVING count > 1
      `
        )
        .all();

      for (const duplicate of duplicates) {
        const duplicateRecord = duplicate as { id: string; count: number };
        issues.push({
          type: 'duplicate_key',
          table,
          recordId: duplicateRecord.id,
          description: `Duplicate primary key in ${table}: ${duplicateRecord.id} (${duplicateRecord.count} occurrences)`,
          severity: 'critical',
          repairStrategy: 'Remove duplicate records, keeping the most recent',
          canAutoRepair: true,
        });
      }
    }
  }

  private checkDataValidity(issues: CorruptionIssue[]): void {
    // Check for invalid dates
    const invalidDates = this.db
      .prepare(
        `
      SELECT 'tasks' as table_name, id, created_at
      FROM tasks
      WHERE created_at IS NULL OR created_at = '' OR datetime(created_at) IS NULL
      UNION ALL
      SELECT 'notes' as table_name, id, created_at
      FROM notes
      WHERE created_at IS NULL OR created_at = '' OR datetime(created_at) IS NULL
    `
      )
      .all();

    for (const invalid of invalidDates) {
      const invalidRecord = invalid as { table_name: string; id: string; created_at: string };
      issues.push({
        type: 'invalid_data',
        table: invalidRecord.table_name,
        column: 'created_at',
        recordId: invalidRecord.id,
        description: `Invalid date in ${invalidRecord.table_name}.created_at: ${invalidRecord.created_at}`,
        severity: 'medium',
        repairStrategy: 'Set to current timestamp or record creation time',
        canAutoRepair: true,
      });
    }

    // Check for empty required fields
    const emptyTitles = this.db
      .prepare(
        `
      SELECT id FROM tasks WHERE title IS NULL OR title = ''
    `
      )
      .all();

    for (const task of emptyTitles) {
      const taskRecord = task as { id: string };
      issues.push({
        type: 'invalid_data',
        table: 'tasks',
        column: 'title',
        recordId: taskRecord.id,
        description: `Task ${taskRecord.id} has empty title`,
        severity: 'medium',
        repairStrategy: 'Set default title based on task ID',
        canAutoRepair: true,
      });
    }
  }

  private checkTableConsistency(issues: CorruptionIssue[]): void {
    // Check for tasks in non-existent columns
    const invalidColumns = this.db
      .prepare(
        `
      SELECT t.id, t.column_id, t.board_id
      FROM tasks t
      LEFT JOIN columns c ON t.column_id = c.id
      WHERE c.id IS NULL AND t.column_id IS NOT NULL
    `
      )
      .all();

    for (const task of invalidColumns) {
      const taskRecord = task as { id: string; column_id: string; board_id: string };
      issues.push({
        type: 'missing_foreign_key',
        table: 'tasks',
        recordId: taskRecord.id,
        description: `Task ${taskRecord.id} references non-existent column ${taskRecord.column_id}`,
        severity: 'high',
        repairStrategy: 'Move task to default column of the board',
        canAutoRepair: true,
      });
    }
  }

  private repairIssue(issue: CorruptionIssue): boolean {
    const transaction = this.db.transaction(() => {
      switch (issue.type) {
        case 'orphaned_record':
          return this.repairOrphanedRecord(issue);
        case 'duplicate_key':
          return this.repairDuplicateKey(issue);
        case 'invalid_data':
          return this.repairInvalidData(issue);
        case 'missing_foreign_key':
          return this.repairMissingForeignKey(issue);
        default:
          return false;
      }
    });

    try {
      return transaction();
    } catch (error) {
      logger.error(`Failed to repair issue: ${issue.description}`, { error });
      return false;
    }
  }

  private repairOrphanedRecord(issue: CorruptionIssue): boolean {
    // Remove orphaned records
    const result = this.db.prepare(`DELETE FROM ${issue.table} WHERE id = ?`).run(issue.recordId);
    return result.changes > 0;
  }

  private repairDuplicateKey(issue: CorruptionIssue): boolean {
    // Keep the most recent record, remove duplicates
    const result = this.db
      .prepare(
        `
      DELETE FROM ${issue.table}
      WHERE id = ? AND rowid NOT IN (
        SELECT MAX(rowid) FROM ${issue.table} WHERE id = ?
      )
    `
      )
      .run(issue.recordId, issue.recordId);
    return result.changes > 0;
  }

  private repairInvalidData(issue: CorruptionIssue): boolean {
    if (issue.column === 'created_at') {
      const result = this.db
        .prepare(
          `
        UPDATE ${issue.table}
        SET created_at = datetime('now')
        WHERE id = ? AND (created_at IS NULL OR created_at = '')
      `
        )
        .run(issue.recordId);
      return result.changes > 0;
    }

    if (issue.column === 'title' && issue.table === 'tasks') {
      const result = this.db
        .prepare(
          `
        UPDATE tasks
        SET title = 'Untitled Task ' || id
        WHERE id = ? AND (title IS NULL OR title = '')
      `
        )
        .run(issue.recordId);
      return result.changes > 0;
    }

    return false;
  }

  private repairMissingForeignKey(issue: CorruptionIssue): boolean {
    if (issue.table === 'tasks' && issue.description.includes('column')) {
      // Move task to first column of its board
      const result = this.db
        .prepare(
          `
        UPDATE tasks
        SET column_id = (
          SELECT id FROM columns
          WHERE board_id = tasks.board_id
          ORDER BY position LIMIT 1
        )
        WHERE id = ?
      `
        )
        .run(issue.recordId);
      return result.changes > 0;
    }

    return false;
  }

  private calculateSeverity(issues: CorruptionIssue[]): 'low' | 'medium' | 'high' | 'critical' {
    if (issues.some(i => i.severity === 'critical')) return 'critical';
    if (issues.some(i => i.severity === 'high')) return 'high';
    if (issues.some(i => i.severity === 'medium')) return 'medium';
    return 'low';
  }

  private generateRepairRecommendations(issues: CorruptionIssue[]): string[] {
    const recommendations = new Set<string>();

    if (issues.some(i => i.severity === 'critical')) {
      recommendations.add('Consider restoring from backup due to critical issues');
    }

    if (issues.filter(i => i.canAutoRepair).length > 0) {
      recommendations.add('Run automatic repair for fixable issues');
    }

    if (issues.filter(i => !i.canAutoRepair).length > 0) {
      recommendations.add('Manual investigation required for complex issues');
    }

    recommendations.add('Create backup before attempting repairs');
    recommendations.add('Validate database integrity after repairs');

    return Array.from(recommendations);
  }

  private async createRecoveryBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.backupDir, `recovery-backup-${timestamp}.db`);

    await fs.mkdir(this.backupDir, { recursive: true });

    const currentDbPath = process.env.DATABASE_PATH ?? './data/kanban.db';
    await fs.copyFile(currentDbPath, backupPath);

    logger.info(`Recovery backup created: ${backupPath}`);
    return backupPath;
  }

  private async findLatestBackup(): Promise<string | null> {
    try {
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files
        .filter(f => f.endsWith('.db'))
        .map(f => path.join(this.backupDir, f));

      if (backupFiles.length === 0) return null;

      // Get file stats and sort by modification time (newest first)
      const filesWithStats = await Promise.all(
        backupFiles.map(async f => ({
          path: f,
          mtime: (await fs.stat(f)).mtime,
        }))
      );

      filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
      return filesWithStats[0].path;
    } catch (error) {
      logger.error('Error finding latest backup', { error });
      return null;
    }
  }
}

// Export a default instance
export const dataRecovery = new DataRecoveryManager(
  dbConnection.getDatabase() as unknown as Database
);

// Export utility functions
export function detectDatabaseCorruption(): CorruptionReport {
  return dataRecovery.detectCorruption();
}

export async function repairDatabaseCorruption(
  report: CorruptionReport,
  options?: RecoveryOptions
): Promise<{ success: boolean; repairedIssues: number; remainingIssues: CorruptionIssue[] }> {
  return dataRecovery.repairData(report, options);
}

export function validateDatabaseIntegrity(): { valid: boolean; issues: string[] } {
  return dataRecovery.validateIntegrity();
}

export async function recoverDatabaseFromBackup(
  backupPath?: string
): Promise<{ success: boolean; error?: string }> {
  return dataRecovery.recoverFromBackup(backupPath);
}
