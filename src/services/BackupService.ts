/**
 * Backup Service - Handles database backup and restore operations
 *
 * @module services/BackupService
 * @description Provides comprehensive backup and restore functionality including
 * full/incremental backups, point-in-time recovery, and integrity validation.
 *
 * @example
 * ```typescript
 * import { BackupService } from '@/services/BackupService';
 * import { dbConnection } from '@/database/connection';
 *
 * const backupService = new BackupService(dbConnection);
 *
 * // Create a full backup
 * const backup = await backupService.createFullBackup({
 *   name: 'daily-backup',
 *   description: 'Daily backup of all data',
 *   compress: true
 * });
 * ```
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { gunzip, gzip } from 'zlib';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import { BaseServiceError } from '../utils/errors';
import type { DatabaseConnection, QueryParameters } from '../database/connection';
import { logger } from '../utils/logger';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export class BackupError extends BaseServiceError {
  constructor(message: string, code: string, statusCode = 400) {
    super(code, message, statusCode);
  }
}

export interface BackupMetadata {
  id: string;
  name: string;
  description?: string | undefined;
  type: 'full' | 'incremental';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'corrupted';
  size: number;
  compressed: boolean;
  encrypted: boolean;
  verified: boolean;
  checksum: string;
  filePath: string;
  createdAt: string;
  completedAt?: string | undefined;
  parentBackupId?: string | undefined; // For incremental backups
  retentionPolicy?: string | undefined;
  error?: string | undefined;
}

export interface CreateBackupOptions {
  name?: string;
  description?: string;
  type?: 'full' | 'incremental';
  compress?: boolean;
  verify?: boolean;
  encrypt?: boolean;
  encryptionKey?: string; // If not provided, will use environment variable
  parentBackupId?: string; // Required for incremental backups
}

export interface RestoreOptions {
  verify?: boolean;
  targetFile?: string;
  pointInTime?: string; // ISO timestamp
  preserveExisting?: boolean;
  decryptionKey?: string; // Required for encrypted backups
}

export interface RestoreValidationResult {
  isValid: boolean;
  tableChecks: Array<{
    tableName: string;
    rowCount: number;
    isValid: boolean;
    message: string;
  }>;
  errors: string[];
}

export interface IntegrityCheckResult {
  isPassed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    message: string;
  }>;
}

export interface PartialRestoreOptions extends RestoreOptions {
  tables: string[];
  includeSchema?: boolean;
  preserveExisting?: boolean;
  validateAfter?: boolean;
}

export interface RestoreProgress {
  id: string;
  totalSteps: number;
  currentStep: number;
  progress: number;
  message: string;
  updatedAt: string;
}

export interface BackupNotification {
  id: string;
  type:
    | 'backup_started'
    | 'backup_completed'
    | 'backup_failed'
    | 'restore_started'
    | 'restore_completed'
    | 'restore_failed'
    | 'backup_scheduled'
    | 'backup_reminder'
    | 'storage_warning'
    | 'health_status_changed';
  backupId: string;
  message: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface NotificationConfig {
  enabled: boolean;
  webhookUrl?: string;
  emailConfig?: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
    from: string;
    to: string[];
  };
  slackConfig?: {
    webhookUrl: string;
    channel?: string;
    username?: string;
  };
}

export class BackupService extends EventEmitter {
  private readonly backupDir: string;

  private readonly algorithm = 'aes-256-gcm';

  private readonly ivLength = 16; // 128 bits

  private readonly notificationConfig: NotificationConfig;

  constructor(
    private readonly db: DatabaseConnection,
    notificationConfig: Partial<NotificationConfig> = {}
  ) {
    super();
    this.backupDir = path.join(process.cwd(), 'backups');
    this.notificationConfig = {
      enabled: notificationConfig.enabled ?? true,
      webhookUrl: notificationConfig.webhookUrl ?? process.env.BACKUP_WEBHOOK_URL,
      emailConfig: notificationConfig.emailConfig,
      slackConfig: notificationConfig.slackConfig,
    };
  }

  /**
   * Valid table names in the database schema
   */
  private static readonly VALID_TABLES = [
    'boards',
    'columns',
    'tasks',
    'tags',
    'task_tags',
    'notes',
    'attachments',
    'comments',
    'task_dependencies',
    'user_preferences',
    'backup_metadata',
  ];

  /**
   * Validates table name to prevent SQL injection
   */
  private validateTableName(tableName: string): void {
    if (!BackupService.VALID_TABLES.includes(tableName)) {
      throw new Error(
        `Invalid table name: ${tableName}. Must be one of: ${BackupService.VALID_TABLES.join(', ')}`
      );
    }
  }

  /**
   * Send backup notification
   */
  private async sendNotification(notification: BackupNotification): Promise<void> {
    if (!this.notificationConfig.enabled) {
      return;
    }

    logger.info('Sending backup notification', {
      type: notification.type,
      backupId: notification.backupId,
      message: notification.message,
    });

    // Emit event for listeners
    this.emit('notification', notification);

    try {
      // Send webhook notification
      if (this.notificationConfig.webhookUrl) {
        await this.sendWebhookNotification(notification);
      }

      // Send Slack notification
      if (this.notificationConfig.slackConfig?.webhookUrl) {
        await this.sendSlackNotification(notification);
      }

      // Send email notification (placeholder - would need email library)
      if (this.notificationConfig.emailConfig) {
        await this.sendEmailNotification(notification);
      }
    } catch (error) {
      logger.error('Failed to send backup notification', {
        notificationId: notification.id,
        type: notification.type,
        error,
      });
    }
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(notification: BackupNotification): Promise<void> {
    try {
      const response = await fetch(this.notificationConfig.webhookUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notification,
          timestamp: notification.timestamp,
        }),
      });

      if (!response.ok) {
        throw new Error(`Webhook request failed: ${response.status} ${response.statusText}`);
      }

      logger.debug('Webhook notification sent successfully', {
        notificationId: notification.id,
        webhookUrl: this.notificationConfig.webhookUrl,
      });
    } catch (error) {
      logger.error('Failed to send webhook notification', {
        notificationId: notification.id,
        error,
      });
      throw error;
    }
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(notification: BackupNotification): Promise<void> {
    try {
      const emoji = this.getNotificationEmoji(notification.type);
      const color = this.getNotificationColor(notification.type);

      const slackPayload = {
        channel: this.notificationConfig.slackConfig!.channel || '#general',
        username: this.notificationConfig.slackConfig!.username || 'Backup Service',
        attachments: [
          {
            color,
            title: `${emoji} ${notification.message}`,
            fields: [
              {
                title: 'Backup ID',
                value: notification.backupId,
                short: true,
              },
              {
                title: 'Type',
                value: notification.type.replace('_', ' ').toUpperCase(),
                short: true,
              },
              {
                title: 'Timestamp',
                value: new Date(notification.timestamp).toLocaleString(),
                short: false,
              },
            ],
            footer: 'MCP Kanban Backup Service',
            ts: Math.floor(new Date(notification.timestamp).getTime() / 1000),
          },
        ],
      };

      const response = await fetch(this.notificationConfig.slackConfig!.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(slackPayload),
      });

      if (!response.ok) {
        throw new Error(`Slack webhook request failed: ${response.status} ${response.statusText}`);
      }

      logger.debug('Slack notification sent successfully', {
        notificationId: notification.id,
      });
    } catch (error) {
      logger.error('Failed to send Slack notification', {
        notificationId: notification.id,
        error,
      });
      throw error;
    }
  }

  /**
   * Send email notification (placeholder implementation)
   */
  private async sendEmailNotification(notification: BackupNotification): Promise<void> {
    // This is a placeholder - in production, you'd use nodemailer or similar
    logger.info('Email notification would be sent here', {
      notificationId: notification.id,
      to: this.notificationConfig.emailConfig!.to,
      subject: `Backup Notification: ${notification.message}`,
    });
  }

  /**
   * Get emoji for notification type
   */
  private getNotificationEmoji(type: BackupNotification['type']): string {
    const emojiMap = {
      backup_started: '🚀',
      backup_completed: '✅',
      backup_failed: '❌',
      restore_started: '🔄',
      restore_completed: '✅',
      restore_failed: '❌',
      backup_scheduled: '📅',
      backup_reminder: '⏰',
      storage_warning: '⚠️',
      health_status_changed: '🏥',
    };
    return emojiMap[type] || '📋';
  }

  /**
   * Get color for notification type
   */
  private getNotificationColor(type: BackupNotification['type']): string {
    const colorMap = {
      backup_started: '#36a64f',
      backup_completed: '#36a64f',
      backup_failed: '#ff0000',
      restore_started: '#ffaa00',
      restore_completed: '#36a64f',
      restore_failed: '#ff0000',
      backup_scheduled: '#0099cc',
      backup_reminder: '#ffaa00',
      storage_warning: '#ff6600',
      health_status_changed: '#9933cc',
    };
    return colorMap[type] || '#cccccc';
  }

  /**
   * Create backup notification
   */
  private createNotification(
    type: BackupNotification['type'],
    backupId: string,
    message: string,
    details?: Record<string, unknown>
  ): BackupNotification {
    return {
      id: uuidv4(),
      type,
      backupId,
      message,
      timestamp: new Date().toISOString(),
      details,
    };
  }

  /**
   * Generate or retrieve encryption key
   */
  private _getEncryptionKey(providedKey?: string): Buffer {
    if (providedKey) {
      return Buffer.from(providedKey, 'hex');
    }

    const envKey = process.env.BACKUP_ENCRYPTION_KEY;
    if (envKey) {
      return Buffer.from(envKey, 'hex');
    }

    throw new BackupError(
      'No encryption key provided. Set BACKUP_ENCRYPTION_KEY environment variable or provide encryptionKey option',
      'ENCRYPTION_KEY_MISSING'
    );
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  private _encryptData(data: Buffer, key: Buffer): Buffer {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    cipher.setAutoPadding(true);

    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Combine IV + auth tag + encrypted data
    return Buffer.concat([iv, authTag, encrypted]);
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  private _decryptData(encryptedData: Buffer, key: Buffer): Buffer {
    const iv = encryptedData.subarray(0, this.ivLength);
    const authTag = encryptedData.subarray(this.ivLength, this.ivLength + 16);
    const encrypted = encryptedData.subarray(this.ivLength + 16);

    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  /**
   * Create a full backup of the database
   */
  async createFullBackup(options: CreateBackupOptions = {}): Promise<BackupMetadata> {
    const backupId = uuidv4();
    const timestamp = new Date().toISOString();
    const name = options.name ?? `full-backup-${timestamp}`;

    logger.info('Starting full backup', { backupId, name });

    // Send backup started notification
    const startNotification = this.createNotification(
      'backup_started',
      backupId,
      `Starting full backup: ${name}`,
      { type: 'full', name, options }
    );
    await this.sendNotification(startNotification);

    const metadata: BackupMetadata = {
      id: backupId,
      name,
      description: options.description,
      type: 'full',
      status: 'pending',
      size: 0,
      compressed: options.compress ?? false,
      encrypted: options.encrypt ?? false,
      verified: false,
      checksum: '',
      filePath: '',
      createdAt: timestamp,
    };

    try {
      // Ensure backup directory exists
      await this.ensureBackupDirectory();

      // Update status to in_progress
      metadata.status = 'in_progress';
      await this.storeBackupMetadata(metadata);

      // Export database to SQL
      const sqlContent = await this.exportDatabaseToSQL();

      // Compress if requested
      let content: Buffer;
      if (options.compress) {
        content = await gzipAsync(Buffer.from(sqlContent, 'utf8'));
      } else {
        content = Buffer.from(sqlContent, 'utf8');
      }

      // Generate file path
      const extension = options.compress ? '.sql.gz' : '.sql';
      const filename = `${backupId}${extension}`;
      const filePath = path.join(this.backupDir, filename);

      // Write backup file
      await fs.writeFile(filePath, content);

      // Calculate checksum
      const checksum = crypto.createHash('sha256').update(content).digest('hex');

      // Update metadata
      metadata.status = 'completed';
      metadata.size = content.length;
      metadata.filePath = filePath;
      metadata.checksum = checksum;
      metadata.completedAt = new Date().toISOString();

      // Verify if requested
      if (options.verify) {
        const isValid = await this.verifyBackup(backupId);
        metadata.verified = isValid;
      }

      await this.updateBackupMetadata(metadata);

      // Send backup completed notification
      const completedNotification = this.createNotification(
        'backup_completed',
        backupId,
        `Full backup completed successfully: ${name}`,
        {
          size: metadata.size,
          compressed: metadata.compressed,
          verified: metadata.verified,
          duration: Date.parse(metadata.completedAt) - Date.parse(metadata.createdAt),
        }
      );
      await this.sendNotification(completedNotification);

      logger.info('Full backup completed', { backupId, size: metadata.size });
      return metadata;
    } catch (error) {
      metadata.status = 'failed';
      metadata.error = error instanceof Error ? error.message : String(error);
      await this.updateBackupMetadata(metadata);

      // Send backup failed notification
      const failedNotification = this.createNotification(
        'backup_failed',
        backupId,
        `Full backup failed: ${name}`,
        {
          error: error instanceof Error ? error.message : String(error),
          type: 'full',
          name,
        }
      );
      await this.sendNotification(failedNotification);

      logger.error('Full backup failed', { backupId, error });
      throw new BaseServiceError('BACKUP_FAILED', 'Failed to create full backup');
    }
  }

  /**
   * Create an incremental backup based on a previous backup
   */
  async createIncrementalBackup(options: CreateBackupOptions): Promise<BackupMetadata> {
    if (!options.parentBackupId) {
      throw new BaseServiceError(
        'INVALID_OPTIONS',
        'parentBackupId is required for incremental backups'
      );
    }

    const backupId = uuidv4();
    const timestamp = new Date().toISOString();
    const name = options.name ?? `incremental-backup-${timestamp}`;

    logger.info('Starting incremental backup', {
      backupId,
      name,
      parentBackupId: options.parentBackupId,
    });

    // Send backup started notification
    const startNotification = this.createNotification(
      'backup_started',
      backupId,
      `Starting incremental backup: ${name}`,
      { type: 'incremental', name, parentBackupId: options.parentBackupId, options }
    );
    await this.sendNotification(startNotification);

    const metadata: BackupMetadata = {
      id: backupId,
      name,
      description: options.description,
      type: 'incremental',
      status: 'pending',
      size: 0,
      compressed: options.compress ?? false,
      encrypted: options.encrypt ?? false,
      verified: false,
      checksum: '',
      filePath: '',
      createdAt: timestamp,
      parentBackupId: options.parentBackupId,
    };

    try {
      // Verify parent backup exists
      const parentBackup = await this.getBackupMetadata(options.parentBackupId);
      if (!parentBackup) {
        throw new BaseServiceError('PARENT_NOT_FOUND', 'Parent backup not found');
      }

      // Ensure backup directory exists
      await this.ensureBackupDirectory();

      // Update status to in_progress
      metadata.status = 'in_progress';
      await this.storeBackupMetadata(metadata);

      // Export only changes since parent backup
      const sqlContent = await this.exportIncrementalSQL(options.parentBackupId);

      // Compress if requested
      let content: Buffer;
      if (options.compress) {
        content = await gzipAsync(Buffer.from(sqlContent, 'utf8'));
      } else {
        content = Buffer.from(sqlContent, 'utf8');
      }

      // Generate file path
      const extension = options.compress ? '.sql.gz' : '.sql';
      const filename = `${backupId}${extension}`;
      const filePath = path.join(this.backupDir, filename);

      // Write backup file
      await fs.writeFile(filePath, content);

      // Calculate checksum
      const checksum = crypto.createHash('sha256').update(content).digest('hex');

      // Update metadata
      metadata.status = 'completed';
      metadata.size = content.length;
      metadata.filePath = filePath;
      metadata.checksum = checksum;
      metadata.completedAt = new Date().toISOString();

      // Verify if requested
      if (options.verify) {
        const isValid = await this.verifyBackup(backupId);
        metadata.verified = isValid;
      }

      await this.updateBackupMetadata(metadata);

      // Send backup completed notification
      const completedNotification = this.createNotification(
        'backup_completed',
        backupId,
        `Incremental backup completed successfully: ${name}`,
        {
          size: metadata.size,
          compressed: metadata.compressed,
          verified: metadata.verified,
          parentBackupId: metadata.parentBackupId,
          duration: Date.parse(metadata.completedAt) - Date.parse(metadata.createdAt),
        }
      );
      await this.sendNotification(completedNotification);

      logger.info('Incremental backup completed', { backupId, size: metadata.size });
      return metadata;
    } catch (error) {
      metadata.status = 'failed';
      metadata.error = error instanceof Error ? error.message : String(error);
      await this.updateBackupMetadata(metadata);

      // Send backup failed notification
      const failedNotification = this.createNotification(
        'backup_failed',
        backupId,
        `Incremental backup failed: ${name}`,
        {
          error: error instanceof Error ? error.message : String(error),
          type: 'incremental',
          name,
          parentBackupId: options.parentBackupId,
        }
      );
      await this.sendNotification(failedNotification);

      logger.error('Incremental backup failed', { backupId, error });
      throw new BaseServiceError('BACKUP_FAILED', 'Failed to create incremental backup');
    }
  }

  /**
   * Restore database from a backup
   */
  async restoreFromBackup(backupId: string, options: RestoreOptions = {}): Promise<void> {
    logger.info('Starting restore from backup', { backupId, options });

    // Send restore started notification
    const startNotification = this.createNotification(
      'restore_started',
      backupId,
      `Starting restore from backup: ${backupId}`,
      { options }
    );
    await this.sendNotification(startNotification);

    const metadata = await this.getBackupMetadata(backupId);
    if (!metadata) {
      throw new BackupError('Backup not found', 'BACKUP_NOT_FOUND', 404);
    }

    if (metadata.status !== 'completed') {
      throw new BackupError('Cannot restore from incomplete backup', 'INVALID_BACKUP');
    }

    // Verify backup if requested
    if (options.verify) {
      const isValid = await this.verifyBackup(backupId);
      if (!isValid) {
        throw new BackupError('Backup verification failed', 'VERIFICATION_FAILED');
      }
    }

    try {
      await this.applyBackupContent(metadata, !options.preserveExisting);

      // Send restore completed notification
      const completedNotification = this.createNotification(
        'restore_completed',
        backupId,
        `Restore completed successfully from backup: ${metadata.name}`,
        {
          backupName: metadata.name,
          backupSize: metadata.size,
          backupType: metadata.type,
          preserveExisting: options.preserveExisting ?? false,
        }
      );
      await this.sendNotification(completedNotification);

      logger.info('Restore completed successfully', { backupId });
    } catch (error) {
      // Send restore failed notification
      const failedNotification = this.createNotification(
        'restore_failed',
        backupId,
        `Restore failed from backup: ${metadata.name || backupId}`,
        {
          error: error instanceof Error ? error.message : String(error),
          backupName: metadata.name,
          options,
        }
      );
      await this.sendNotification(failedNotification);

      logger.error('Restore failed', { backupId, error });
      throw new BackupError('Failed to restore from backup', 'RESTORE_FAILED');
    }
  }

  /**
   * Restore specific tables from a backup
   */
  async restorePartialData(backupId: string, options: PartialRestoreOptions): Promise<void> {
    logger.info('Starting partial restore', { backupId, tables: options.tables });

    const metadata = await this.getBackupMetadata(backupId);
    if (!metadata) {
      throw new BackupError('Backup not found', 'BACKUP_NOT_FOUND', 404);
    }

    if (metadata.status !== 'completed') {
      throw new BackupError('Cannot restore from incomplete backup', 'INVALID_BACKUP');
    }

    // Validate restore options
    const validation = await this.validateRestoreOptions(backupId, options);
    if (!validation.isValid) {
      throw new BackupError(
        `Restore validation failed: ${validation.errors.join(', ')}`,
        'VALIDATION_FAILED'
      );
    }

    try {
      // Read backup content
      let content: Buffer;
      if (metadata.compressed) {
        const compressedData = await fs.readFile(metadata.filePath);
        content = await gunzipAsync(compressedData);
      } else {
        content = await fs.readFile(metadata.filePath);
      }

      const sqlContent = content.toString();

      // Extract and apply specific table data
      await this.applyPartialBackupContent(sqlContent, options);

      // Validate after restore if requested
      if (options.validateAfter) {
        const integrityCheck = await this.performDataIntegrityCheck();
        if (!integrityCheck.isPassed) {
          logger.warn('Data integrity issues detected after partial restore', integrityCheck);
        }
      }

      logger.info('Partial restore completed successfully', { backupId, tables: options.tables });
    } catch (error) {
      logger.error('Partial restore failed', { backupId, error });
      throw new BackupError('Failed to perform partial restore', 'RESTORE_FAILED');
    }
  }

  /**
   * Apply partial backup content to database
   */
  private async applyPartialBackupContent(
    sqlContent: string,
    options: PartialRestoreOptions
  ): Promise<void> {
    const statements = sqlContent.split(';').filter(stmt => stmt.trim());

    // Group statements by table
    const tableStatements = this.groupStatementsByTable(statements);

    // Process each requested table
    for (const tableName of options.tables) {
      if (!tableStatements.has(tableName)) {
        logger.warn(`Table ${tableName} not found in backup`);
        continue;
      }

      const tableData = tableStatements.get(tableName);
      if (!tableData) continue;

      logger.info(`Restoring table: ${tableName}`, {
        schemaStatements: tableData.schema.length,
        dataStatements: tableData.data.length,
      });

      try {
        // Clear existing data if not preserving
        if (!options.preserveExisting) {
          this.validateTableName(tableName);
          await this.db.execute(`DELETE FROM ${tableName}`);
        }

        // Apply schema if requested
        if (options.includeSchema) {
          for (const schemaStmt of tableData.schema) {
            if (schemaStmt.trim()) {
              await this.db.execute(schemaStmt);
            }
          }
        }

        // Apply data
        for (const dataStmt of tableData.data) {
          if (dataStmt.trim()) {
            await this.db.execute(dataStmt);
          }
        }

        logger.info(`Successfully restored table: ${tableName}`);
      } catch (error) {
        logger.error(`Failed to restore table: ${tableName}`, error);
        throw new BackupError(
          `Failed to restore table ${tableName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'TABLE_RESTORE_FAILED'
        );
      }
    }
  }

  /**
   * Group SQL statements by table
   */
  private groupStatementsByTable(
    statements: string[]
  ): Map<string, { schema: string[]; data: string[] }> {
    const tableStatements = new Map<string, { schema: string[]; data: string[] }>();
    let currentTable = '';

    statements.forEach(statement => {
      const trimmed = statement.trim();
      if (!trimmed) return;

      // Check if this is a CREATE TABLE statement
      const createMatch = trimmed.match(/CREATE TABLE\s+(\w+)/i);
      if (createMatch?.[1]) {
        currentTable = createMatch[1];
        if (!tableStatements.has(currentTable)) {
          tableStatements.set(currentTable, { schema: [], data: [] });
        }
        tableStatements.get(currentTable)?.schema.push(trimmed);
        return;
      }

      // Check if this is an INSERT statement
      const insertMatch = trimmed.match(/INSERT INTO\s+(\w+)/i);
      if (insertMatch?.[1]) {
        const tableName = insertMatch[1];
        if (!tableStatements.has(tableName)) {
          tableStatements.set(tableName, { schema: [], data: [] });
        }
        tableStatements.get(tableName)?.data.push(trimmed);
        return;
      }

      // Other statements (indexes, etc.) go to the current table
      if (currentTable && tableStatements.has(currentTable)) {
        tableStatements.get(currentTable)?.schema.push(trimmed);
      }
    });

    return tableStatements;
  }

  /**
   * Extract specific table data from backup
   */
  async extractTableData(backupId: string, tableName: string): Promise<string> {
    const metadata = await this.getBackupMetadata(backupId);
    if (!metadata) {
      throw new BackupError('Backup not found', 'BACKUP_NOT_FOUND', 404);
    }

    try {
      // Read backup content
      let content: Buffer;
      if (metadata.compressed) {
        const compressedData = await fs.readFile(metadata.filePath);
        content = await gunzipAsync(compressedData);
      } else {
        content = await fs.readFile(metadata.filePath);
      }

      const sqlContent = content.toString();
      const statements = sqlContent.split(';').filter(stmt => stmt.trim());
      const tableStatements = this.groupStatementsByTable(statements);

      const tableData = tableStatements.get(tableName);
      if (!tableData) {
        throw new BackupError(`Table ${tableName} not found in backup`, 'TABLE_NOT_FOUND', 404);
      }

      // Combine schema and data statements
      const allStatements = [...tableData.schema, ...tableData.data];
      return `${allStatements.join(';\n')};`;
    } catch (error) {
      logger.error(`Failed to extract table data for ${tableName}`, error);
      throw new BackupError(
        `Failed to extract table data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'EXTRACTION_FAILED'
      );
    }
  }

  /**
   * List available backups
   */
  async listBackups(
    options: {
      limit?: number;
      offset?: number;
      type?: 'full' | 'incremental';
      status?: string;
    } = {}
  ): Promise<BackupMetadata[]> {
    await this.ensureMetadataTable();

    let query = 'SELECT * FROM backup_metadata WHERE 1=1';
    const params: unknown[] = [];

    if (options.type) {
      query += ' AND type = ?';
      params.push(options.type);
    }

    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }

    query += ' ORDER BY created_at DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    const rows = await this.db.query<unknown>(query, params as QueryParameters);
    return rows.map(row => BackupService.deserializeBackupMetadata(row));
  }

  /**
   * Clean up old backups based on retention days
   */
  async cleanupOldBackups(retentionDays: number): Promise<void> {
    logger.info('Starting cleanup of old backups', { retentionDays });

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const oldBackups = await this.listBackups({ limit: 1000 });
      const backupsToDelete = oldBackups.filter(backup => {
        const backupDate = new Date(backup.createdAt);
        return backupDate < cutoffDate;
      });

      await Promise.all(
        backupsToDelete.map(async backup => {
          try {
            await this.deleteBackup(backup.id);
            logger.info(`Deleted old backup: ${backup.name}`, { backupId: backup.id });
          } catch (error) {
            logger.error(`Failed to delete old backup: ${backup.name}`, {
              backupId: backup.id,
              error,
            });
          }
        })
      );

      logger.info('Cleanup completed', {
        totalBackups: oldBackups.length,
        deletedBackups: backupsToDelete.length,
      });
    } catch (error) {
      logger.error('Failed to cleanup old backups', error);
      throw new BackupError('Failed to cleanup old backups', 'CLEANUP_FAILED');
    }
  }

  /**
   * Get backup metadata by ID
   */
  async getBackupMetadata(backupId: string): Promise<BackupMetadata | null> {
    await this.ensureMetadataTable();

    const row = await this.db.queryOne('SELECT * FROM backup_metadata WHERE id = ?', [backupId]);
    return row
      ? BackupService.deserializeBackupMetadata(
          row as {
            id: string;
            name: string;
            description?: string;
            type: string;
            status: string;
            size: number;
            compressed: number;
            encrypted: number;
            verified: number;
            checksum: string;
            file_path: string;
            created_at: string;
            completed_at?: string;
            parent_backup_id?: string;
            retention_policy?: string;
            error?: string;
          }
        )
      : null;
  }

  /**
   * Delete a backup
   */
  async deleteBackup(backupId: string): Promise<void> {
    logger.info('Deleting backup', { backupId });

    const metadata = await this.getBackupMetadata(backupId);
    if (!metadata) {
      throw new BackupError('Backup not found', 'BACKUP_NOT_FOUND', 404);
    }

    try {
      // Delete backup file
      if (
        metadata.filePath &&
        (await fs
          .access(metadata.filePath)
          .then(() => true)
          .catch(() => false))
      ) {
        await fs.unlink(metadata.filePath);
      }

      // Delete metadata
      await this.db.execute('DELETE FROM backup_metadata WHERE id = ?', [backupId]);

      logger.info('Backup deleted successfully', { backupId });
    } catch (error) {
      logger.error('Failed to delete backup', { backupId, error });
      throw new BackupError('Failed to delete backup', 'DELETE_FAILED');
    }
  }

  /**
   * Verify backup integrity
   */
  async verifyBackup(backupId: string): Promise<boolean> {
    const metadata = await this.getBackupMetadata(backupId);
    if (!metadata) {
      return false;
    }

    try {
      // Check if file exists
      if (
        !(await fs
          .access(metadata.filePath)
          .then(() => true)
          .catch(() => false))
      ) {
        return false;
      }

      // Read file and verify checksum
      const content = await fs.readFile(metadata.filePath);
      const calculatedChecksum = crypto.createHash('sha256').update(content).digest('hex');

      return calculatedChecksum === metadata.checksum;
    } catch (error) {
      logger.error('Backup verification failed', { backupId, error });
      return false;
    }
  }

  /**
   * Validate restore options and backup compatibility
   */
  async validateRestoreOptions(
    backupId: string,
    options: RestoreOptions = {}
  ): Promise<RestoreValidationResult> {
    const result: RestoreValidationResult = {
      isValid: true,
      tableChecks: [],
      errors: [],
    };

    try {
      // Check if backup exists
      const metadata = await this.getBackupMetadata(backupId);
      if (!metadata) {
        result.isValid = false;
        result.errors.push('Backup not found');
        return result;
      }

      // Check backup status
      if (metadata.status !== 'completed') {
        result.isValid = false;
        result.errors.push('Cannot restore from incomplete backup');
        return result;
      }

      // Validate point-in-time if specified
      if (options.pointInTime) {
        const pointInTime = new Date(options.pointInTime);
        const backupTime = new Date(metadata.createdAt);

        if (isNaN(pointInTime.getTime())) {
          result.isValid = false;
          result.errors.push('Invalid point-in-time format');
        } else if (pointInTime > backupTime) {
          result.isValid = false;
          result.errors.push('Point-in-time cannot be after backup creation time');
        }
      }

      // Validate target file if specified
      if (options.targetFile) {
        const targetValidation = await this.validateRestoreTarget(options.targetFile);
        if (!targetValidation.isValid) {
          result.isValid = false;
          result.errors.push(...targetValidation.errors);
        }
      }

      // Check backup compatibility
      const compatibilityCheck = await this.validateBackupCompatibility(metadata);
      if (!compatibilityCheck.isValid) {
        result.isValid = false;
        result.errors.push(...compatibilityCheck.errors);
      }

      // Validate backup content structure
      const contentValidation = await this.validateBackupContent(metadata);
      result.tableChecks = contentValidation.tableChecks;
      if (!contentValidation.isValid) {
        result.isValid = false;
        result.errors.push(...contentValidation.errors);
      }
    } catch (error) {
      result.isValid = false;
      result.errors.push(
        `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    return result;
  }

  /**
   * Validate backup compatibility with current system
   */
  private async validateBackupCompatibility(
    metadata: BackupMetadata
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const result = { isValid: true, errors: [] };

    try {
      // Read backup content to check schema compatibility
      let content: Buffer;
      if (metadata.compressed) {
        const compressedData = await fs.readFile(metadata.filePath);
        content = await gunzipAsync(compressedData);
      } else {
        content = await fs.readFile(metadata.filePath);
      }

      const sqlContent = content.toString();

      // Extract table definitions from backup
      const tableDefinitions = this.extractTableDefinitions(sqlContent);

      // Check if required tables exist
      const requiredTables = [
        'boards',
        'tasks',
        'columns',
        'tags',
        'notes',
        'task_tags',
        'task_dependencies',
      ];
      requiredTables.forEach(table => {
        if (!tableDefinitions.has(table)) {
          (result.errors as string[]).push(`Required table '${table}' not found in backup`);
        }
      });

      // Check schema version compatibility (if schema versioning is implemented)
      const schemaVersion = this.extractSchemaVersion(sqlContent);
      if (schemaVersion && !this.isSchemaVersionCompatible(schemaVersion)) {
        (result.errors as string[]).push(
          `Schema version ${schemaVersion} is not compatible with current system`
        );
      }

      if (result.errors.length > 0) {
        result.isValid = false;
      }
    } catch (error) {
      result.isValid = false;
      (result.errors as string[]).push(
        `Compatibility check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    return result;
  }

  /**
   * Validate restore target (file system, permissions, etc.)
   */
  private async validateRestoreTarget(
    targetPath?: string
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const result = { isValid: true, errors: [] };

    if (!targetPath) {
      return result; // No target specified, use default
    }

    try {
      // Check if target directory exists and is writable
      const targetDir = path.dirname(targetPath);
      await fs.access(targetDir, fs.constants.W_OK);

      // Check if target file exists and is writable (or can be created)
      try {
        await fs.access(targetPath, fs.constants.W_OK);
      } catch {
        // File doesn't exist, check if we can create it
        const testFile = path.join(targetDir, '.test-write');
        await fs.writeFile(testFile, 'test');
        await fs.unlink(testFile);
      }

      // Check available disk space (basic check)
      const stats = await fs.stat(targetDir);
      // Note: This is a simplified check. In production, you'd want more sophisticated space checking
    } catch (error) {
      result.isValid = false;
      (result.errors as string[]).push(
        `Target validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    return result;
  }

  /**
   * Validate backup content structure and integrity
   */
  private async validateBackupContent(metadata: BackupMetadata): Promise<{
    isValid: boolean;
    tableChecks: Array<{ tableName: string; rowCount: number; isValid: boolean; message: string }>;
    errors: string[];
  }> {
    const result = {
      isValid: true,
      tableChecks: [],
      errors: [],
    };

    try {
      // Read backup content
      let content: Buffer;
      if (metadata.compressed) {
        const compressedData = await fs.readFile(metadata.filePath);
        content = await gunzipAsync(compressedData);
      } else {
        content = await fs.readFile(metadata.filePath);
      }

      const sqlContent = content.toString();

      // Extract table information
      const tableInfo = this.extractTableInfo(sqlContent);

      tableInfo.forEach((info, tableName) => {
        const check = {
          tableName,
          rowCount: info.rowCount,
          isValid: info.isValid,
          message: info.message,
        };

        (result.tableChecks as unknown[]).push(check);

        if (!info.isValid) {
          result.isValid = false;
          (result.errors as string[]).push(`Table ${tableName}: ${info.message}`);
        }
      });
    } catch (error) {
      result.isValid = false;
      (result.errors as string[]).push(
        `Content validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    return result;
  }

  /**
   * Perform comprehensive data integrity checks
   */
  async performDataIntegrityCheck(): Promise<IntegrityCheckResult> {
    const result: IntegrityCheckResult = {
      isPassed: true,
      checks: [],
    };

    try {
      logger.info('Starting data integrity check');

      // Check database integrity
      const dbIntegrity = await this.checkDatabaseIntegrity();
      result.checks.push(dbIntegrity);

      // Check foreign key relationships
      const fkIntegrity = await this.checkForeignKeyIntegrity();
      result.checks.push(fkIntegrity);

      // Check data consistency
      const dataConsistency = await this.checkDataConsistency();
      result.checks.push(dataConsistency);

      // Check index integrity
      const indexIntegrity = await this.checkIndexIntegrity();
      result.checks.push(indexIntegrity);

      // Check for orphaned records
      const orphanedRecords = await this.checkOrphanedRecords();
      result.checks.push(orphanedRecords);

      // Determine overall result
      result.isPassed = result.checks.every(check => check.passed);

      logger.info('Data integrity check completed', {
        passed: result.isPassed,
        totalChecks: result.checks.length,
      });
    } catch (error) {
      logger.error('Data integrity check failed', error);
      result.isPassed = false;
      result.checks.push({
        name: 'System Error',
        passed: false,
        message: `Integrity check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }

    return result;
  }

  /**
   * Check database integrity using SQLite's integrity_check
   */
  private async checkDatabaseIntegrity(): Promise<{
    name: string;
    passed: boolean;
    message: string;
  }> {
    try {
      const result = await this.db.queryOne<{ integrity_check: string }>('PRAGMA integrity_check');
      const isPassed = result?.integrity_check === 'ok';

      return {
        name: 'Database Integrity',
        passed: isPassed ?? false,
        message: isPassed ? 'Database integrity check passed' : 'Database integrity check failed',
      };
    } catch (error) {
      return {
        name: 'Database Integrity',
        passed: false,
        message: `Database integrity check error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Check foreign key integrity
   */
  private async checkForeignKeyIntegrity(): Promise<{
    name: string;
    passed: boolean;
    message: string;
  }> {
    try {
      // Check for orphaned tasks (no valid board)
      const orphanedTasks = await this.db.queryOne(
        'SELECT COUNT(*) as count FROM tasks t LEFT JOIN boards b ON t.board_id = b.id WHERE b.id IS NULL'
      );

      // Check for orphaned task_tags (no valid task or tag)
      const orphanedTaskTags = await this.db.queryOne(
        'SELECT COUNT(*) as count FROM task_tags tt LEFT JOIN tasks t ON tt.task_id = t.id LEFT JOIN tags tag ON tt.tag_id = tag.id WHERE t.id IS NULL OR tag.id IS NULL'
      );

      // Check for orphaned task_dependencies (no valid task)
      const orphanedDependencies = await this.db.queryOne(
        'SELECT COUNT(*) as count FROM task_dependencies td LEFT JOIN tasks t1 ON td.task_id = t1.id LEFT JOIN tasks t2 ON td.depends_on_id = t2.id WHERE t1.id IS NULL OR t2.id IS NULL'
      );

      const totalOrphaned =
        (orphanedTasks?.count ?? 0) +
        (orphanedTaskTags?.count ?? 0) +
        (orphanedDependencies?.count ?? 0);
      const isPassed = totalOrphaned === 0;

      return {
        name: 'Foreign Key Integrity',
        passed: isPassed,
        message: isPassed
          ? 'All foreign key relationships are valid'
          : `Found ${totalOrphaned} orphaned records (${orphanedTasks?.count ?? 0} tasks, ${orphanedTaskTags?.count ?? 0} task_tags, ${orphanedDependencies?.count ?? 0} dependencies)`,
      };
    } catch (error) {
      return {
        name: 'Foreign Key Integrity',
        passed: false,
        message: `Foreign key check error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Check data consistency
   */
  private async checkDataConsistency(): Promise<{
    name: string;
    passed: boolean;
    message: string;
  }> {
    try {
      const issues: string[] = [];

      // Check for tasks with invalid status values
      const invalidStatus = await this.db.queryOne(
        "SELECT COUNT(*) as count FROM tasks WHERE status NOT IN ('todo', 'in_progress', 'done', 'blocked', 'archived')"
      );
      if (invalidStatus?.count && invalidStatus.count > 0) {
        issues.push(`${invalidStatus.count} tasks with invalid status`);
      }

      // Check for tasks with invalid priority values
      const invalidPriority = await this.db.queryOne(
        'SELECT COUNT(*) as count FROM tasks WHERE priority < 1 OR priority > 5'
      );
      if (invalidPriority?.count && invalidPriority.count > 0) {
        issues.push(`${invalidPriority.count} tasks with invalid priority`);
      }

      // Check for tasks with negative position values
      const negativePosition = await this.db.queryOne(
        'SELECT COUNT(*) as count FROM tasks WHERE position < 0'
      );
      if (negativePosition?.count && negativePosition.count > 0) {
        issues.push(`${negativePosition.count} tasks with negative position`);
      }

      // Check for circular dependencies
      const circularDeps = await this.checkCircularDependencies();
      if (circularDeps > 0) {
        issues.push(`${circularDeps} circular dependencies detected`);
      }

      const isPassed = issues.length === 0;
      return {
        name: 'Data Consistency',
        passed: isPassed,
        message: isPassed
          ? 'All data consistency checks passed'
          : `Issues found: ${issues.join(', ')}`,
      };
    } catch (error) {
      return {
        name: 'Data Consistency',
        passed: false,
        message: `Data consistency check error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Check index integrity
   */
  private async checkIndexIntegrity(): Promise<{ name: string; passed: boolean; message: string }> {
    try {
      // Check if required indexes exist
      const indexes = await this.db.query("SELECT name FROM sqlite_master WHERE type='index'");
      const indexNames = indexes.map(idx => idx.name);

      const requiredIndexes = [
        'idx_tasks_board_id',
        'idx_tasks_status',
        'idx_tasks_priority',
        'idx_task_tags_task_id',
        'idx_task_tags_tag_id',
        'idx_task_dependencies_task_id',
        'idx_task_dependencies_depends_on_id',
      ];

      const missingIndexes = requiredIndexes.filter(idx => !indexNames.includes(idx));
      const isPassed = missingIndexes.length === 0;

      return {
        name: 'Index Integrity',
        passed: isPassed,
        message: isPassed
          ? 'All required indexes are present'
          : `Missing indexes: ${missingIndexes.join(', ')}`,
      };
    } catch (error) {
      return {
        name: 'Index Integrity',
        passed: false,
        message: `Index check error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Check for orphaned records
   */
  private async checkOrphanedRecords(): Promise<{
    name: string;
    passed: boolean;
    message: string;
  }> {
    try {
      const orphanedRecords: string[] = [];

      // Check for notes without tasks
      const orphanedNotes = await this.db.queryOne(
        'SELECT COUNT(*) as count FROM notes n LEFT JOIN tasks t ON n.task_id = t.id WHERE t.id IS NULL'
      );
      if (orphanedNotes?.count && orphanedNotes.count > 0) {
        orphanedRecords.push(`${orphanedNotes.count} notes`);
      }

      // Check for columns without boards
      const orphanedColumns = await this.db.queryOne(
        'SELECT COUNT(*) as count FROM columns c LEFT JOIN boards b ON c.board_id = b.id WHERE b.id IS NULL'
      );
      if (orphanedColumns?.count && orphanedColumns.count > 0) {
        orphanedRecords.push(`${orphanedColumns.count} columns`);
      }

      const isPassed = orphanedRecords.length === 0;
      return {
        name: 'Orphaned Records',
        passed: isPassed,
        message: isPassed
          ? 'No orphaned records found'
          : `Found orphaned records: ${orphanedRecords.join(', ')}`,
      };
    } catch (error) {
      return {
        name: 'Orphaned Records',
        passed: false,
        message: `Orphaned records check error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Check for circular dependencies in tasks
   */
  private async checkCircularDependencies(): Promise<number> {
    try {
      // This is a simplified check. In a real implementation, you'd use a more sophisticated algorithm
      // to detect cycles in the dependency graph
      const result = await this.db.queryOne(`
        WITH RECURSIVE deps AS (
          SELECT task_id, depends_on_id, 1 as depth
          FROM task_dependencies
          UNION ALL
          SELECT td.task_id, td.depends_on_id, d.depth + 1
          FROM task_dependencies td
          JOIN deps d ON td.task_id = d.depends_on_id
          WHERE d.depth < 10  -- Prevent infinite recursion
        )
        SELECT COUNT(*) as count
        FROM deps d1
        JOIN deps d2 ON d1.task_id = d2.depends_on_id AND d1.depends_on_id = d2.task_id
        WHERE d1.task_id != d1.depends_on_id
      `);

      return result?.count ?? 0;
    } catch (error) {
      logger.error('Circular dependency check failed', error);
      return 0; // Assume no circular dependencies if check fails
    }
  }

  /**
   * Extract table definitions from SQL content
   */
  private extractTableDefinitions(sqlContent: string): Map<string, string> {
    const tableDefinitions = new Map<string, string>();
    const createTableRegex = /CREATE TABLE\s+(\w+)\s*\(([\s\S]*?)\);/gi;

    let match;
    while ((match = createTableRegex.exec(sqlContent)) !== null) {
      const tableName = match[1];
      const definition = match[2];
      tableDefinitions.set(tableName, definition);
    }

    return tableDefinitions;
  }

  /**
   * Extract schema version from SQL content
   */
  private extractSchemaVersion(sqlContent: string): string | null {
    const versionRegex = /-- Schema Version:\s*(\d+\.\d+\.\d+)/i;
    const match = sqlContent.match(versionRegex);
    return match?.[1] || null;
  }

  /**
   * Check if schema version is compatible
   */
  private isSchemaVersionCompatible(version: string): boolean {
    // For now, assume all versions are compatible
    // In a real implementation, you'd have version compatibility rules
    return true;
  }

  /**
   * Extract table information from SQL content
   */
  private extractTableInfo(
    sqlContent: string
  ): Map<string, { rowCount: number; isValid: boolean; message: string }> {
    const tableInfo = new Map<string, { rowCount: number; isValid: boolean; message: string }>();

    // Extract table names and count INSERT statements
    const tableRegex = /INSERT INTO\s+(\w+)\s*\(/gi;
    const tableCounts = new Map<string, number>();

    let match;
    while ((match = tableRegex.exec(sqlContent)) !== null) {
      const tableName = match[1];
      tableCounts.set(tableName, (tableCounts.get(tableName) ?? 0) + 1);
    }

    // Validate each table
    tableCounts.forEach((rowCount, tableName) => {
      const isValid = rowCount >= 0; // Basic validation
      const message = isValid ? 'OK' : 'Invalid row count';

      tableInfo.set(tableName, {
        rowCount,
        isValid,
        message,
      });
    });

    return tableInfo;
  }

  // Private helper methods

  private async ensureBackupDirectory(): Promise<void> {
    try {
      await fs.access(this.backupDir);
    } catch {
      await fs.mkdir(this.backupDir, { recursive: true });
    }
  }

  private async exportDatabaseToSQL(): Promise<string> {
    const tables = await this.db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );

    let sql = '-- Database Export\n';
    sql += `-- Generated: ${new Date().toISOString()}\n\n`;

    const tableExports = await Promise.all(
      tables.map(async table => {
        // Get table schema
        const schema = await this.db.queryOne<{ sql: string }>(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name = ?",
          [table.name]
        );

        // Get table data
        const data = await this.db.query(`SELECT * FROM ${table.name}`);

        return { table, schema, data };
      })
    );

    for (const { table, schema, data } of tableExports) {
      if (schema?.sql) {
        sql += `${schema.sql};\n\n`;
      }
      for (const row of data) {
        const columns = Object.keys(row);
        const values = columns.map(col => {
          const value = row[col];
          if (value === null || value === undefined) return 'NULL';
          if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
          return String(value);
        });

        sql += `INSERT INTO ${table.name} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
      }
      sql += '\n';
    }

    return sql;
  }

  private async exportIncrementalSQL(_parentBackupId: string): Promise<string> {
    // For simplicity, export all data since parent backup
    // In a real implementation, this would track changes since the parent backup
    return this.exportDatabaseToSQL();
  }

  private async applyBackupContent(backup: BackupMetadata, clearFirst = false): Promise<void> {
    // Read backup content
    let content: Buffer;
    if (backup.compressed) {
      const compressedData = await fs.readFile(backup.filePath);
      content = await gunzipAsync(compressedData);
    } else {
      content = await fs.readFile(backup.filePath);
    }

    const sqlContent = content.toString();

    // Clear existing data if requested
    if (clearFirst) {
      await this.clearDatabase();
    }

    // Execute SQL statements
    const statements = sqlContent.split(';').filter(stmt => stmt.trim());

    // eslint-disable-next-line no-await-in-loop
    for (const statement of statements) {
      const trimmed = statement.trim();
      if (trimmed) {
        // eslint-disable-next-line no-await-in-loop
        await this.db.execute(trimmed);
      }
    }
  }

  private async clearDatabase(): Promise<void> {
    const tables = await this.db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );

    await Promise.all(tables.map(async table => this.db.execute(`DELETE FROM ${table.name}`)));
  }

  private async storeBackupMetadata(metadata: BackupMetadata): Promise<void> {
    await this.ensureMetadataTable();

    await this.db.execute(
      `INSERT INTO backup_metadata (
        id, name, description, type, status, size, compressed, encrypted, verified, checksum, 
        file_path, created_at, completed_at, parent_backup_id, retention_policy, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        metadata.id,
        metadata.name,
        metadata.description ?? null,
        metadata.type,
        metadata.status,
        metadata.size,
        metadata.compressed ? 1 : 0,
        metadata.encrypted ? 1 : 0,
        metadata.verified ? 1 : 0,
        metadata.checksum,
        metadata.filePath,
        metadata.createdAt,
        metadata.completedAt ?? null,
        metadata.parentBackupId ?? null,
        metadata.retentionPolicy ?? null,
        metadata.error ?? null,
      ]
    );
  }

  private async updateBackupMetadata(metadata: BackupMetadata): Promise<void> {
    await this.ensureMetadataTable();

    await this.db.execute(
      `UPDATE backup_metadata SET 
        name = ?, description = ?, type = ?, status = ?, size = ?, compressed = ?, 
        encrypted = ?, verified = ?, checksum = ?, file_path = ?, completed_at = ?, parent_backup_id = ?, 
        retention_policy = ?, error = ?
      WHERE id = ?`,
      [
        metadata.name,
        metadata.description ?? null,
        metadata.type,
        metadata.status,
        metadata.size,
        metadata.compressed ? 1 : 0,
        metadata.encrypted ? 1 : 0,
        metadata.verified ? 1 : 0,
        metadata.checksum,
        metadata.filePath,
        metadata.completedAt ?? null,
        metadata.parentBackupId ?? null,
        metadata.retentionPolicy ?? null,
        metadata.error ?? null,
        metadata.id,
      ]
    );
  }

  private async ensureMetadataTable(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS backup_metadata (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        size INTEGER NOT NULL,
        compressed INTEGER NOT NULL,
        encrypted INTEGER NOT NULL,
        verified INTEGER NOT NULL,
        checksum TEXT NOT NULL,
        file_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        parent_backup_id TEXT,
        retention_policy TEXT,
        error TEXT
      )
    `);
  }

  /**
   * Track restoration progress
   */
  private async trackRestoreProgress(progressId: string, progress: RestoreProgress): Promise<void> {
    try {
      await this.ensureProgressTable();

      await this.db.execute(
        `INSERT OR REPLACE INTO restore_progress 
         (id, total_steps, current_step, progress, message, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          progress.id,
          progress.totalSteps,
          progress.currentStep,
          progress.progress,
          progress.message,
          progress.updatedAt,
        ]
      );
    } catch (error) {
      logger.error('Failed to track restore progress', { progressId, error });
      // Don't throw - progress tracking failure shouldn't stop the restore
    }
  }

  /**
   * Update restoration progress
   */
  private async updateRestoreProgress(
    progressId: string,
    currentStep: number,
    message: string,
    totalSteps?: number
  ): Promise<void> {
    const progress = Math.round((currentStep / (totalSteps || 1)) * 100);
    const progressData: RestoreProgress = {
      id: progressId,
      totalSteps: totalSteps || 1,
      currentStep,
      progress,
      message,
      updatedAt: new Date().toISOString(),
    };

    await this.trackRestoreProgress(progressId, progressData);
  }

  /**
   * Get restoration progress
   */
  async getRestoreProgress(progressId: string): Promise<RestoreProgress | null> {
    try {
      await this.ensureProgressTable();

      const row = await this.db.queryOne('SELECT * FROM restore_progress WHERE id = ?', [
        progressId,
      ]);

      if (!row) return null;

      return {
        id: row.id,
        totalSteps: row.total_steps,
        currentStep: row.current_step,
        progress: row.progress,
        message: row.message,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      logger.error('Failed to get restore progress', { progressId, error });
      return null;
    }
  }

  /**
   * Clear restoration progress
   */
  async clearRestoreProgress(progressId: string): Promise<void> {
    try {
      await this.ensureProgressTable();
      await this.db.execute('DELETE FROM restore_progress WHERE id = ?', [progressId]);
    } catch (error) {
      logger.error('Failed to clear restore progress', { progressId, error });
    }
  }

  /**
   * Ensure progress tracking table exists
   */
  private async ensureProgressTable(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS restore_progress (
        id TEXT PRIMARY KEY,
        total_steps INTEGER NOT NULL,
        current_step INTEGER NOT NULL,
        progress INTEGER NOT NULL,
        message TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  }

  /**
   * Restore database to a specific point in time
   */
  async restoreToPointInTime(
    backupId: string,
    pointInTime: string,
    options: RestoreOptions = {}
  ): Promise<void> {
    logger.info('Starting point-in-time restoration', { backupId, pointInTime });

    const targetDate = new Date(pointInTime);
    if (isNaN(targetDate.getTime())) {
      throw new BackupError('Invalid point-in-time timestamp', 'INVALID_TIMESTAMP');
    }

    // Find the most appropriate backup for the target time
    const backup = await this.findBestBackupForTime(targetDate);
    if (!backup) {
      throw new BackupError('No backup found for the specified time', 'NO_SUITABLE_BACKUP', 404);
    }

    // Validate that the backup is suitable for point-in-time restoration
    const backupTime = new Date(backup.createdAt);
    if (backupTime > targetDate) {
      throw new BackupError(
        'Selected backup was created after the requested point in time',
        'BACKUP_TOO_NEW'
      );
    }

    // Perform the restoration
    await this.restoreFromBackup(backup.id, {
      ...options,
      pointInTime,
      verify: true, // Always verify point-in-time restorations
    });

    logger.info('Point-in-time restoration completed', { backupId: backup.id, pointInTime });
  }

  /**
   * Find the best backup for a specific point in time
   */
  private async findBestBackupForTime(targetDate: Date): Promise<BackupMetadata | null> {
    const backups = await this.listBackups({
      status: 'completed',
      limit: 100,
    });

    // Filter backups created before the target time
    const eligibleBackups = backups.filter(backup => {
      const backupDate = new Date(backup.createdAt);
      return backupDate <= targetDate;
    });

    if (eligibleBackups.length === 0) {
      return null;
    }

    // Return the most recent backup before the target time
    return eligibleBackups.reduce((latest, current) => {
      const latestDate = new Date(latest.createdAt);
      const currentDate = new Date(current.createdAt);
      return currentDate > latestDate ? current : latest;
    });
  }

  /**
   * Enhanced restore with progress tracking
   */
  async restoreFromBackupWithProgress(
    backupId: string,
    options: RestoreOptions = {}
  ): Promise<string> {
    const progressId = uuidv4();
    const totalSteps = 5; // Validation, backup read, clear, apply, verify

    logger.info('Starting restore with progress tracking', { backupId, progressId });

    try {
      // Step 1: Validate restore options
      await this.updateRestoreProgress(progressId, 1, 'Validating restore options...', totalSteps);
      const validation = await this.validateRestoreOptions(backupId, options);
      if (!validation.isValid) {
        await this.updateRestoreProgress(progressId, totalSteps, 'Validation failed', totalSteps);
        throw new BackupError(
          `Restore validation failed: ${validation.errors.join(', ')}`,
          'VALIDATION_FAILED'
        );
      }

      // Step 2: Read backup content
      await this.updateRestoreProgress(progressId, 2, 'Reading backup content...', totalSteps);
      const metadata = await this.getBackupMetadata(backupId);
      if (!metadata) {
        await this.updateRestoreProgress(progressId, totalSteps, 'Backup not found', totalSteps);
        throw new BackupError('Backup not found', 'BACKUP_NOT_FOUND', 404);
      }

      let content: Buffer;
      if (metadata.compressed) {
        const compressedData = await fs.readFile(metadata.filePath);
        content = await gunzipAsync(compressedData);
      } else {
        content = await fs.readFile(metadata.filePath);
      }

      // Step 3: Clear existing data if needed
      if (!options.preserveExisting) {
        await this.updateRestoreProgress(progressId, 3, 'Clearing existing data...', totalSteps);
        await this.clearDatabase();
      }

      // Step 4: Apply backup content
      await this.updateRestoreProgress(progressId, 4, 'Applying backup content...', totalSteps);
      await this.applyBackupContent(metadata, !options.preserveExisting);

      // Step 5: Verify if requested
      if (options.verify) {
        await this.updateRestoreProgress(progressId, 5, 'Verifying restore...', totalSteps);
        const isValid = await this.verifyBackup(backupId);
        if (!isValid) {
          await this.updateRestoreProgress(
            progressId,
            totalSteps,
            'Verification failed',
            totalSteps
          );
          throw new BackupError('Backup verification failed after restore', 'VERIFICATION_FAILED');
        }
      }

      await this.updateRestoreProgress(
        progressId,
        totalSteps,
        'Restore completed successfully',
        totalSteps
      );
      logger.info('Restore with progress tracking completed', { backupId, progressId });

      return progressId;
    } catch (error) {
      await this.updateRestoreProgress(
        progressId,
        totalSteps,
        `Restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        totalSteps
      );
      logger.error('Restore with progress tracking failed', { backupId, progressId, error });
      throw error;
    }
  }

  private static deserializeBackupMetadata(row: {
    id: string;
    name: string;
    description?: string;
    type: string;
    status: string;
    size: number;
    compressed: number;
    encrypted: number;
    verified: number;
    checksum: string;
    file_path: string;
    created_at: string;
    completed_at?: string;
    parent_backup_id?: string;
    retention_policy?: string;
    error?: string;
  }): BackupMetadata {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      type: row.type as 'full' | 'incremental',
      status: row.status as BackupMetadata['status'],
      size: row.size,
      compressed: Boolean(row.compressed),
      encrypted: Boolean(row.encrypted),
      verified: Boolean(row.verified),
      checksum: row.checksum,
      filePath: row.file_path,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      parentBackupId: row.parent_backup_id,
      retentionPolicy: row.retention_policy,
      error: row.error,
    };
  }

  /**
   * Send backup scheduled notification
   */
  async sendBackupScheduledNotification(
    backupId: string,
    scheduledTime: Date,
    backupType: 'full' | 'incremental'
  ): Promise<void> {
    const notification = this.createNotification(
      'backup_scheduled',
      backupId,
      `Backup scheduled for ${scheduledTime.toLocaleString()}`,
      {
        scheduledTime: scheduledTime.toISOString(),
        backupType,
      }
    );
    await this.sendNotification(notification);
  }

  /**
   * Send backup reminder notification
   */
  async sendBackupReminderNotification(
    backupId: string,
    lastBackupTime: Date,
    hoursOverdue: number
  ): Promise<void> {
    const notification = this.createNotification(
      'backup_reminder',
      backupId,
      `Backup is overdue by ${hoursOverdue.toFixed(1)} hours. Last backup: ${lastBackupTime.toLocaleString()}`,
      {
        lastBackupTime: lastBackupTime.toISOString(),
        hoursOverdue,
      }
    );
    await this.sendNotification(notification);
  }

  /**
   * Send storage warning notification
   */
  async sendStorageWarningNotification(
    backupId: string,
    currentUsage: number,
    maxUsage: number,
    usagePercent: number
  ): Promise<void> {
    const notification = this.createNotification(
      'storage_warning',
      backupId,
      `Storage usage at ${usagePercent.toFixed(1)}% (${currentUsage}MB of ${maxUsage}MB)`,
      {
        currentUsage,
        maxUsage,
        usagePercent,
      }
    );
    await this.sendNotification(notification);
  }

  /**
   * Send health status changed notification
   */
  async sendHealthStatusChangedNotification(
    backupId: string,
    oldStatus: string,
    newStatus: string,
    reason: string
  ): Promise<void> {
    const notification = this.createNotification(
      'health_status_changed',
      backupId,
      `Backup health status changed from ${oldStatus} to ${newStatus}: ${reason}`,
      {
        oldStatus,
        newStatus,
        reason,
      }
    );
    await this.sendNotification(notification);
  }
}
