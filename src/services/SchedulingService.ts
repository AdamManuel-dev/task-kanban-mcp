/**
 * Scheduling Service - Manages automated backup scheduling and execution
 *
 * @module services/SchedulingService
 * @description Provides cron-based scheduling for automated backups, manages backup schedules,
 * and handles retention policies. Integrates with BackupService to execute scheduled operations.
 *
 * @example
 * ```typescript
 * import { SchedulingService } from '@/services/SchedulingService';
 * import { BackupService } from '@/services/BackupService';
 * import { dbConnection } from '@/database/connection';
 *
 * const backupService = new BackupService(dbConnection);
 * const schedulingService = new SchedulingService(dbConnection, backupService);
 *
 * // Schedule daily backups at 2 AM
 * await schedulingService.createSchedule({
 *   name: 'daily-backup',
 *   cronExpression: '0 2 * * *',
 *   backupType: 'full',
 *   enabled: true
 * });
 *
 * // Start the scheduler
 * schedulingService.start();
 * ```
 */

import { v4 as uuidv4 } from 'uuid';
import * as cron from 'node-cron';
import { logger } from '@/utils/logger';
import type { DatabaseConnection } from '@/database/connection';
import type { BackupService } from './BackupService';

/**
 * Backup schedule configuration
 */
export interface BackupSchedule {
  id: string;
  name: string;
  description?: string;
  cronExpression: string;
  backupType: 'full' | 'incremental';
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  runCount: number;
  failureCount: number;
  retentionDays?: number;
  compressionEnabled: boolean;
  verificationEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Schedule creation options
 */
export interface CreateScheduleOptions {
  name: string;
  description?: string;
  cronExpression: string;
  backupType: 'full' | 'incremental';
  enabled?: boolean;
  retentionDays?: number;
  compressionEnabled?: boolean;
  verificationEnabled?: boolean;
}

/**
 * Schedule update options
 */
export interface UpdateScheduleOptions {
  name?: string;
  description?: string;
  cronExpression?: string;
  backupType?: 'full' | 'incremental';
  enabled?: boolean;
  retentionDays?: number;
  compressionEnabled?: boolean;
  verificationEnabled?: boolean;
}

/**
 * Scheduling Service - Manages automated backup operations
 *
 * @class SchedulingService
 * @description Provides comprehensive scheduling functionality for automated backups
 * including cron-based scheduling, retention policies, and failure handling.
 */
export class SchedulingService {
  private static readonly activeJobs = new Map<string, cron.ScheduledTask>();

  private isRunning = false;

  /**
   * Initialize SchedulingService
   *
   * @param {DatabaseConnection} db - Database connection instance
   * @param {BackupService} backupService - Backup service instance
   */
  constructor(
    private readonly db: DatabaseConnection,
    private readonly backupService: BackupService
  ) {
    this.ensureScheduleTable();
  }

  /**
   * Create a new backup schedule
   *
   * @param {CreateScheduleOptions} options - Schedule creation options
   * @returns {Promise<BackupSchedule>} Created schedule
   */
  async createSchedule(options: CreateScheduleOptions): Promise<BackupSchedule> {
    // Validate cron expression
    if (!cron.validate(options.cronExpression)) {
      throw new Error(`Invalid cron expression: ${options.cronExpression}`);
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    const schedule: BackupSchedule = {
      id,
      name: options.name,
      cronExpression: options.cronExpression,
      backupType: options.backupType,
      enabled: options.enabled ?? true,
      nextRunAt: SchedulingService.calculateNextRun(options.cronExpression),
      runCount: 0,
      failureCount: 0,
      retentionDays: options.retentionDays ?? 30,
      compressionEnabled: options.compressionEnabled ?? true,
      verificationEnabled: options.verificationEnabled ?? true,
      createdAt: now,
      updatedAt: now,
    };
    if (options.description) {
      schedule.description = options.description;
    }

    try {
      await this.storeSchedule(schedule);

      // Start the job if scheduler is running and schedule is enabled
      if (this.isRunning && schedule.enabled) {
        this.startJob(schedule);
      }

      logger.info(`Backup schedule created: ${schedule.name}`, { scheduleId: id });
      return schedule;
    } catch (error) {
      logger.error('Failed to create backup schedule', error);
      throw error;
    }
  }

  /**
   * Get all backup schedules
   *
   * @param {Object} options - Query options
   * @returns {Promise<BackupSchedule[]>} Array of schedules
   */
  async getSchedules(
    options: {
      enabled?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<BackupSchedule[]> {
    let query = 'SELECT * FROM backup_schedules WHERE 1=1';
    const params: any[] = [];

    if (options.enabled !== undefined) {
      query += ' AND enabled = ?';
      params.push(options.enabled ? 1 : 0);
    }

    query += ' ORDER BY created_at DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);

      if (options.offset) {
        query += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    const rows = await this.db.query(query, params);
    return rows.map(row => SchedulingService.deserializeSchedule(row));
  }

  /**
   * Get schedule by ID
   *
   * @param {string} id - Schedule ID
   * @returns {Promise<BackupSchedule | null>} Schedule or null if not found
   */
  async getScheduleById(id: string): Promise<BackupSchedule | null> {
    const row = await this.db.queryOne('SELECT * FROM backup_schedules WHERE id = ?', [id]);
    return row ? SchedulingService.deserializeSchedule(row) : null;
  }

  /**
   * Update a backup schedule
   *
   * @param {string} id - Schedule ID
   * @param {UpdateScheduleOptions} options - Update options
   * @returns {Promise<BackupSchedule>} Updated schedule
   */
  async updateSchedule(id: string, options: UpdateScheduleOptions): Promise<BackupSchedule> {
    const existingSchedule = await this.getScheduleById(id);
    if (!existingSchedule) {
      throw new Error(`Schedule not found: ${id}`);
    }

    // Validate cron expression if provided
    if (options.cronExpression && !cron.validate(options.cronExpression)) {
      throw new Error(`Invalid cron expression: ${options.cronExpression}`);
    }

    // Update fields
    const updatedSchedule: BackupSchedule = {
      ...existingSchedule,
      ...options,
      updatedAt: new Date().toISOString(),
    };

    // Recalculate next run if cron expression changed
    if (options.cronExpression) {
      updatedSchedule.nextRunAt = SchedulingService.calculateNextRun(options.cronExpression);
    }

    try {
      await this.storeSchedule(updatedSchedule);

      // Restart job if scheduler is running
      if (this.isRunning) {
        SchedulingService.stopJob(id);
        if (updatedSchedule.enabled) {
          this.startJob(updatedSchedule);
        }
      }

      logger.info(`Backup schedule updated: ${updatedSchedule.name}`, { scheduleId: id });
      return updatedSchedule;
    } catch (error) {
      logger.error('Failed to update backup schedule', error);
      throw error;
    }
  }

  /**
   * Delete a backup schedule
   *
   * @param {string} id - Schedule ID
   */
  async deleteSchedule(id: string): Promise<void> {
    const existingSchedule = await this.getScheduleById(id);
    if (!existingSchedule) {
      throw new Error(`Schedule not found: ${id}`);
    }

    try {
      // Stop the job if running
      SchedulingService.stopJob(id);

      // Delete from database
      await this.db.execute('DELETE FROM backup_schedules WHERE id = ?', [id]);

      logger.info(`Backup schedule deleted: ${existingSchedule.name}`, { scheduleId: id });
    } catch (error) {
      logger.error('Failed to delete backup schedule', error);
      throw error;
    }
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Scheduler is already running');
      return;
    }

    this.isRunning = true;
    this.loadAndStartSchedules();
    logger.info('Backup scheduler started');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      logger.warn('Scheduler is not running');
      return;
    }

    this.isRunning = false;

    // Stop all active jobs
    for (const [scheduleId, task] of SchedulingService.activeJobs) {
      task.stop();
      SchedulingService.activeJobs.delete(scheduleId);
    }

    logger.info('Backup scheduler stopped');
  }

  /**
   * Manually execute a schedule
   *
   * @param {string} id - Schedule ID
   */
  async executeSchedule(id: string): Promise<void> {
    const schedule = await this.getScheduleById(id);
    if (!schedule) {
      throw new Error(`Schedule not found: ${id}`);
    }

    if (!schedule.enabled) {
      throw new Error(`Schedule is disabled: ${id}`);
    }

    await this.executeBackup(schedule);
  }

  /**
   * Clean up old backups based on retention policies
   */
  async cleanupOldBackups(): Promise<void> {
    const schedules = await this.getSchedules({ enabled: true });

    await Promise.all(
      schedules
        .filter(schedule => schedule.retentionDays)
        .map(async schedule => {
          try {
            await this.backupService.cleanupOldBackups(schedule.retentionDays!);
            logger.info(`Cleaned up old backups for schedule: ${schedule.name}`);
          } catch (error) {
            logger.error(`Failed to cleanup backups for schedule: ${schedule.name}`, error);
          }
        })
    );
  }

  /**
   * Load and start all enabled schedules
   */
  private async loadAndStartSchedules(): Promise<void> {
    try {
      const schedules = await this.getSchedules({ enabled: true });

      await Promise.all(schedules.map(schedule => this.executeBackup(schedule)));
    } catch (error) {
      logger.error('Failed to load and start schedules:', error);
    }
  }

  /**
   * Stop a scheduled job
   *
   * @param {string} scheduleId - Schedule ID
   */
  private static stopJob(scheduleId: string): void {
    const task = SchedulingService.activeJobs.get(scheduleId);
    if (task) {
      task.stop();
      SchedulingService.activeJobs.delete(scheduleId);
      logger.info(`Stopped backup job for schedule: ${scheduleId}`);
    }
  }

  /**
   * Execute a backup for a schedule
   *
   * @param {BackupSchedule} schedule - Schedule configuration
   */
  private async executeBackup(schedule: BackupSchedule): Promise<void> {
    const startTime = Date.now();

    try {
      logger.info(`Executing scheduled backup: ${schedule.name}`, {
        scheduleId: schedule.id,
      });

      // Create backup name with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `${schedule.name}-${timestamp}`;

      // Execute backup based on type
      let backup;
      if (schedule.backupType === 'incremental') {
        // Find the latest full backup for this schedule
        const recentBackups = await this.backupService.listBackups({
          limit: 10,
          type: 'full',
        });

        const parentBackup = recentBackups.find(
          b => b.name.includes(schedule.name) && b.status === 'completed'
        );

        if (parentBackup) {
          backup = await this.backupService.createIncrementalBackup({
            name: backupName,
            description: `Scheduled incremental backup from ${schedule.name}`,
            compress: schedule.compressionEnabled,
            verify: schedule.verificationEnabled,
            parentBackupId: parentBackup.id,
          });
        } else {
          // Fall back to full backup if no parent found
          logger.warn(
            `No parent backup found for incremental backup, creating full backup instead`
          );
          backup = await this.backupService.createFullBackup({
            name: backupName,
            description: `Scheduled full backup from ${schedule.name} (fallback)`,
            compress: schedule.compressionEnabled,
            verify: schedule.verificationEnabled,
          });
        }
      } else {
        backup = await this.backupService.createFullBackup({
          name: backupName,
          description: `Scheduled full backup from ${schedule.name}`,
          compress: schedule.compressionEnabled,
          verify: schedule.verificationEnabled,
        });
      }

      // Update schedule statistics
      await this.updateScheduleStats(schedule.id, true);

      const duration = Date.now() - startTime;
      logger.info(`Scheduled backup completed: ${schedule.name}`, {
        scheduleId: schedule.id,
        backupId: backup.id,
        duration: `${duration}ms`,
        size: backup.size,
      });
    } catch (error) {
      // Update failure statistics
      await this.updateScheduleStats(schedule.id, false);

      const duration = Date.now() - startTime;
      logger.error(`Scheduled backup failed: ${schedule.name}`, {
        scheduleId: schedule.id,
        duration: `${duration}ms`,
        error,
      });
    }
  }

  /**
   * Update schedule execution statistics
   *
   * @param {string} scheduleId - Schedule ID
   * @param {boolean} success - Whether the execution was successful
   */
  private async updateScheduleStats(scheduleId: string, success: boolean): Promise<void> {
    const now = new Date().toISOString();
    const schedule = await this.getScheduleById(scheduleId);

    if (!schedule) return;

    const nextRun = SchedulingService.calculateNextRun(schedule.cronExpression);

    await this.db.execute(
      `
      UPDATE backup_schedules 
      SET 
        last_run_at = ?,
        next_run_at = ?,
        run_count = run_count + 1,
        failure_count = failure_count + ?,
        updated_at = ?
      WHERE id = ?
    `,
      [now, nextRun, success ? 0 : 1, now, scheduleId]
    );
  }

  /**
   * Calculate next run time for a cron expression
   *
   * @param {string} cronExpression - Cron expression
   * @returns {string} Next run time in ISO format
   */
  private static calculateNextRun(_cronExpression: string): string {
    try {
      // Use a simple approximation - in production you'd want a proper cron parser
      return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours from now
    } catch {
      return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }
  }

  /**
   * Ensure schedule table exists
   */
  private async ensureScheduleTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS backup_schedules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        cron_expression TEXT NOT NULL,
        backup_type TEXT NOT NULL CHECK (backup_type IN ('full', 'incremental')),
        enabled INTEGER DEFAULT 1,
        last_run_at TEXT,
        next_run_at TEXT,
        run_count INTEGER DEFAULT 0,
        failure_count INTEGER DEFAULT 0,
        retention_days INTEGER DEFAULT 30,
        compression_enabled INTEGER DEFAULT 1,
        verification_enabled INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `;

    await this.db.execute(query);
  }

  /**
   * Store schedule in database
   *
   * @param {BackupSchedule} schedule - Schedule to store
   */
  private async storeSchedule(schedule: BackupSchedule): Promise<void> {
    await this.ensureScheduleTable();

    const query = `
      INSERT INTO backup_schedules (
        id, name, description, cron_expression, backup_type, enabled,
        last_run_at, next_run_at, run_count, failure_count, retention_days,
        compression_enabled, verification_enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.db.execute(query, [
      schedule.id,
      schedule.name,
      schedule.description,
      schedule.cronExpression,
      schedule.backupType,
      schedule.enabled ? 1 : 0,
      schedule.lastRunAt,
      schedule.nextRunAt,
      schedule.runCount,
      schedule.failureCount,
      schedule.retentionDays,
      schedule.compressionEnabled ? 1 : 0,
      schedule.verificationEnabled ? 1 : 0,
      schedule.createdAt,
      schedule.updatedAt,
    ]);
  }

  /**
   * Deserialize schedule from database row
   *
   * @param {any} row - Database row
   * @returns {BackupSchedule} Deserialized schedule
   */
  private static deserializeSchedule(row: {
    id: string;
    name: string;
    description?: string;
    cron_expression: string;
    backup_type: string;
    enabled: number;
    last_run_at?: string;
    next_run_at?: string;
    run_count: number;
    failure_count: number;
    retention_days: number;
    compression_enabled: number;
    verification_enabled: number;
    created_at: string;
    updated_at: string;
  }): BackupSchedule {
    const schedule: BackupSchedule = {
      id: row.id,
      name: row.name,
      cronExpression: row.cron_expression,
      backupType: row.backup_type as 'full' | 'incremental',
      enabled: Boolean(row.enabled),
      runCount: row.run_count ?? 0,
      failureCount: row.failure_count ?? 0,
      retentionDays: row.retention_days,
      compressionEnabled: Boolean(row.compression_enabled),
      verificationEnabled: Boolean(row.verification_enabled),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    // Add optional properties only if they exist
    if (row.description) schedule.description = row.description;
    if (row.last_run_at) schedule.lastRunAt = row.last_run_at;
    if (row.next_run_at) schedule.nextRunAt = row.next_run_at;

    return schedule;
  }

  /**
   * Start a job for a schedule
   */
  private startJob(schedule: BackupSchedule): void {
    // Stop existing job if any
    SchedulingService.stopJob(schedule.id);

    // Create new cron job
    const task = cron.schedule(schedule.cronExpression, () => {
      this.executeBackup(schedule);
    });

    SchedulingService.activeJobs.set(schedule.id, task);
    logger.info(`Started backup job for schedule: ${schedule.name}`, { scheduleId: schedule.id });
  }
}
