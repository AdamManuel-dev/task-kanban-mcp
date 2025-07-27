import cron from 'node-cron';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '@/utils/logger';
import type { DatabaseConnection } from '@/database/connection';
import { BaseServiceError } from '@/utils/errors';
import { BackupService, type BackupMetadata, type CreateBackupOptions } from './BackupService';

export interface BackupSchedule {
  id: string;
  name: string;
  cronExpression: string;
  isActive: boolean;
  backupType: 'full' | 'incremental';
  retentionDays: number;
  compress: boolean;
  verify: boolean;
  lastRun?: string;
  nextRun?: string;
  successCount: number;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleOptions {
  compress?: boolean;
  verify?: boolean;
  retentionDays?: number;
  parentBackupId?: string;
}

export class BackupSchedulerService {
  private readonly backupService: BackupService;

  private readonly schedules = new Map<string, cron.ScheduledTask>();

  private readonly configFile: string;

  constructor(private readonly db: DatabaseConnection) {
    this.backupService = new BackupService(db);
    this.configFile = path.join(process.cwd(), 'backups', 'scheduler-config.json');
  }

  /**
   * Initialize the scheduler and load existing schedules
   */
  async initialize(): Promise<void> {
    logger.info('Initializing backup scheduler service');

    try {
      await this.ensureConfigDirectory();
      await this.ensureScheduleTable();
      await this.loadActiveSchedules();

      logger.info('Backup scheduler service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize backup scheduler service', error);
      throw new BaseServiceError('SCHEDULER_INIT_FAILED', 'Failed to initialize backup scheduler');
    }
  }

  /**
   * Create a new backup schedule
   */
  async createSchedule(
    name: string,
    cronExpression: string,
    backupType: 'full' | 'incremental',
    options: ScheduleOptions = {}
  ): Promise<BackupSchedule> {
    logger.info('Creating new backup schedule', { name, cronExpression, backupType });

    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      throw new BaseServiceError('INVALID_CRON', 'Invalid cron expression');
    }

    const scheduleId = `schedule_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    const schedule: BackupSchedule = {
      id: scheduleId,
      name,
      cronExpression,
      isActive: true,
      backupType,
      retentionDays: options.retentionDays ?? 30,
      compress: options.compress ?? true,
      verify: options.verify ?? true,
      successCount: 0,
      failureCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    // Calculate next run time
    const task = cron.schedule(cronExpression, () => {}, { scheduled: false });
    schedule.nextRun = this.getNextRunTime(cronExpression);

    // Store schedule in database
    await this.storeSchedule(schedule);

    // Start the scheduled task
    await this.startSchedule(scheduleId);

    logger.info('Backup schedule created successfully', { scheduleId, name });
    return schedule;
  }

  /**
   * Update an existing backup schedule
   */
  async updateSchedule(
    scheduleId: string,
    updates: Partial<
      Pick<
        BackupSchedule,
        'name' | 'cronExpression' | 'isActive' | 'retentionDays' | 'compress' | 'verify'
      >
    >
  ): Promise<BackupSchedule> {
    logger.info('Updating backup schedule', { scheduleId, updates });

    const existingSchedule = await this.getSchedule(scheduleId);
    if (!existingSchedule) {
      throw new BaseServiceError('SCHEDULE_NOT_FOUND', 'Schedule not found');
    }

    // Validate cron expression if updating
    if (updates.cronExpression && !cron.validate(updates.cronExpression)) {
      throw new BaseServiceError('INVALID_CRON', 'Invalid cron expression');
    }

    // Stop existing task if it's running
    await this.stopSchedule(scheduleId);

    // Update schedule
    const updatedSchedule: BackupSchedule = {
      ...existingSchedule,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Recalculate next run time if cron expression changed
    if (updates.cronExpression) {
      updatedSchedule.nextRun = this.getNextRunTime(updates.cronExpression);
    }

    // Store updated schedule
    await this.updateScheduleInDb(updatedSchedule);

    // Restart schedule if it's active
    if (updatedSchedule.isActive) {
      await this.startSchedule(scheduleId);
    }

    logger.info('Backup schedule updated successfully', { scheduleId });
    return updatedSchedule;
  }

  /**
   * Delete a backup schedule
   */
  async deleteSchedule(scheduleId: string): Promise<void> {
    logger.info('Deleting backup schedule', { scheduleId });

    const schedule = await this.getSchedule(scheduleId);
    if (!schedule) {
      throw new BaseServiceError('SCHEDULE_NOT_FOUND', 'Schedule not found');
    }

    // Stop the scheduled task
    await this.stopSchedule(scheduleId);

    // Remove from database
    await this.db.execute('DELETE FROM backup_schedules WHERE id = ?', [scheduleId]);

    logger.info('Backup schedule deleted successfully', { scheduleId });
  }

  /**
   * Get a schedule by ID
   */
  async getSchedule(scheduleId: string): Promise<BackupSchedule | null> {
    const row = await this.db.queryOne('SELECT * FROM backup_schedules WHERE id = ?', [scheduleId]);
    return row ? this.deserializeSchedule(row) : null;
  }

  /**
   * List all schedules
   */
  async listSchedules(): Promise<BackupSchedule[]> {
    const rows = await this.db.query('SELECT * FROM backup_schedules ORDER BY created_at DESC');
    return rows.map(row => this.deserializeSchedule(row));
  }

  /**
   * Start a specific schedule
   */
  async startSchedule(scheduleId: string): Promise<void> {
    const schedule = await this.getSchedule(scheduleId);
    if (!schedule) {
      throw new BaseServiceError('SCHEDULE_NOT_FOUND', 'Schedule not found');
    }

    if (!schedule.isActive) {
      throw new BaseServiceError('SCHEDULE_INACTIVE', 'Cannot start inactive schedule');
    }

    // Stop existing task if running
    await this.stopSchedule(scheduleId);

    // Create and start new task
    const task = cron.schedule(
      schedule.cronExpression,
      async () => {
        await this.executeScheduledBackup(scheduleId);
      },
      { scheduled: true }
    );

    this.schedules.set(scheduleId, task);
    logger.info('Backup schedule started', { scheduleId, cronExpression: schedule.cronExpression });
  }

  /**
   * Stop a specific schedule
   */
  stopSchedule(scheduleId: string): void {
    const task = this.schedules.get(scheduleId);
    if (task) {
      task.stop();
      task.destroy();
      this.schedules.delete(scheduleId);
      logger.info('Backup schedule stopped', { scheduleId });
    }
  }

  /**
   * Execute a scheduled backup
   */
  private async executeScheduledBackup(scheduleId: string): Promise<void> {
    const schedule = await this.getSchedule(scheduleId);
    if (!schedule) {
      logger.error('Schedule not found during execution', { scheduleId });
      return;
    }

    logger.info('Executing scheduled backup', { scheduleId, name: schedule.name });

    try {
      const backupOptions: CreateBackupOptions = {
        name: `${schedule.name}-${new Date().toISOString()}`,
        description: `Automated backup from schedule: ${schedule.name}`,
        type: schedule.backupType,
        compress: schedule.compress,
        verify: schedule.verify,
      };

      // For incremental backups, find the most recent full backup
      if (schedule.backupType === 'incremental') {
        const recentBackups = await this.backupService.listBackups({
          type: 'full',
          status: 'completed',
          limit: 1,
        });

        if (recentBackups.length > 0) {
          backupOptions.parentBackupId = recentBackups[0].id;
        } else {
          // No full backup found, create a full backup instead
          logger.warn('No full backup found for incremental backup, creating full backup instead', {
            scheduleId,
          });
          backupOptions.type = 'full';
        }
      }

      let backup: BackupMetadata;
      if (backupOptions.type === 'full') {
        backup = await this.backupService.createFullBackup(backupOptions);
      } else {
        backup = await this.backupService.createIncrementalBackup(backupOptions);
      }

      // Update schedule success count and last run time
      await this.updateScheduleStats(scheduleId, true);

      // Clean up old backups based on retention policy
      if (schedule.retentionDays > 0) {
        await this.backupService.cleanupOldBackups(schedule.retentionDays);
      }

      logger.info('Scheduled backup completed successfully', {
        scheduleId,
        backupId: backup.id,
        backupSize: backup.size,
      });
    } catch (error) {
      // Update schedule failure count
      await this.updateScheduleStats(scheduleId, false);

      logger.error('Scheduled backup failed', {
        scheduleId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Update schedule statistics
   */
  private async updateScheduleStats(scheduleId: string, success: boolean): Promise<void> {
    const now = new Date().toISOString();

    if (success) {
      await this.db.execute(
        'UPDATE backup_schedules SET success_count = success_count + 1, last_run = ?, updated_at = ? WHERE id = ?',
        [now, now, scheduleId]
      );
    } else {
      await this.db.execute(
        'UPDATE backup_schedules SET failure_count = failure_count + 1, last_run = ?, updated_at = ? WHERE id = ?',
        [now, now, scheduleId]
      );
    }
  }

  /**
   * Get next run time for a cron expression
   */
  private getNextRunTime(cronExpression: string): string {
    try {
      const task = cron.schedule(cronExpression, () => {}, { scheduled: false });
      const nextDates = task.nextDates(1);
      return nextDates[0].toISOString();
    } catch (error) {
      logger.error('Failed to calculate next run time', { cronExpression, error });
      return new Date().toISOString();
    }
  }

  /**
   * Load and start all active schedules
   */
  private async loadActiveSchedules(): Promise<void> {
    const schedules = await this.listSchedules();
    const activeSchedules = schedules.filter(schedule => schedule.isActive);

    logger.info(`Loading ${activeSchedules.length} active schedules`);

    for (const schedule of activeSchedules) {
      try {
        await this.startSchedule(schedule.id);
      } catch (error) {
        logger.error('Failed to start schedule during initialization', {
          scheduleId: schedule.id,
          error,
        });
      }
    }
  }

  /**
   * Ensure configuration directory exists
   */
  private async ensureConfigDirectory(): Promise<void> {
    const configDir = path.dirname(this.configFile);
    try {
      await fs.access(configDir);
    } catch {
      await fs.mkdir(configDir, { recursive: true });
    }
  }

  /**
   * Ensure schedule table exists
   */
  private async ensureScheduleTable(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS backup_schedules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        cron_expression TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        backup_type TEXT NOT NULL,
        retention_days INTEGER NOT NULL DEFAULT 30,
        compress INTEGER NOT NULL DEFAULT 1,
        verify INTEGER NOT NULL DEFAULT 1,
        last_run TEXT,
        next_run TEXT,
        success_count INTEGER NOT NULL DEFAULT 0,
        failure_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  }

  /**
   * Store schedule in database
   */
  private async storeSchedule(schedule: BackupSchedule): Promise<void> {
    await this.db.execute(
      `INSERT INTO backup_schedules (
        id, name, cron_expression, is_active, backup_type, retention_days,
        compress, verify, last_run, next_run, success_count, failure_count,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        schedule.id,
        schedule.name,
        schedule.cronExpression,
        schedule.isActive ? 1 : 0,
        schedule.backupType,
        schedule.retentionDays,
        schedule.compress ? 1 : 0,
        schedule.verify ? 1 : 0,
        schedule.lastRun,
        schedule.nextRun,
        schedule.successCount,
        schedule.failureCount,
        schedule.createdAt,
        schedule.updatedAt,
      ]
    );
  }

  /**
   * Update schedule in database
   */
  private async updateScheduleInDb(schedule: BackupSchedule): Promise<void> {
    await this.db.execute(
      `UPDATE backup_schedules SET 
        name = ?, cron_expression = ?, is_active = ?, backup_type = ?, retention_days = ?,
        compress = ?, verify = ?, next_run = ?, updated_at = ?
      WHERE id = ?`,
      [
        schedule.name,
        schedule.cronExpression,
        schedule.isActive ? 1 : 0,
        schedule.backupType,
        schedule.retentionDays,
        schedule.compress ? 1 : 0,
        schedule.verify ? 1 : 0,
        schedule.nextRun,
        schedule.updatedAt,
        schedule.id,
      ]
    );
  }

  /**
   * Deserialize schedule from database row
   */
  private deserializeSchedule(row: any): BackupSchedule {
    return {
      id: row.id,
      name: row.name,
      cronExpression: row.cron_expression,
      isActive: Boolean(row.is_active),
      backupType: row.backup_type,
      retentionDays: row.retention_days,
      compress: Boolean(row.compress),
      verify: Boolean(row.verify),
      lastRun: row.last_run,
      nextRun: row.next_run,
      successCount: row.success_count,
      failureCount: row.failure_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Shutdown the scheduler gracefully
   */
  shutdown(): void {
    logger.info('Shutting down backup scheduler service');

    for (const [scheduleId, task] of this.schedules.entries()) {
      try {
        task.stop();
        task.destroy();
        logger.info('Stopped scheduled task', { scheduleId });
      } catch (error) {
        logger.error('Error stopping scheduled task', { scheduleId, error });
      }
    }

    this.schedules.clear();
    logger.info('Backup scheduler service shutdown complete');
  }
}
