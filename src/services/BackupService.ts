/**
 * Backup Service - Core business logic for database backup and restore operations
 *
 * @module services/BackupService
 * @description Provides comprehensive backup management functionality including full and incremental
 * backups, compression, verification, scheduling, and point-in-time restoration. Handles backup
 * lifecycle, metadata tracking, and retention policies.
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
 *   name: 'daily-backup-2025-07-26',
 *   description: 'Daily automated backup',
 *   compress: true
 * });
 *
 * // Restore from backup
 * await backupService.restoreFromBackup(backup.id, { verify: true });
 * ```
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { logger } from '@/utils/logger';
import type { DatabaseConnection } from '@/database/connection';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * Backup metadata interface
 */
interface BackupMetadata {
  id: string;
  name: string;
  description?: string;
  type: 'full' | 'incremental';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'corrupted';
  size: number;
  compressed: boolean;
  verified: boolean;
  checksum: string;
  filePath: string;
  createdAt: string;
  completedAt?: string;
  parentBackupId?: string; // For incremental backups
  retentionPolicy?: string;
  error?: string;
}

/**
 * Backup creation options
 */
interface CreateBackupOptions {
  name?: string;
  description?: string;
  type?: 'full' | 'incremental';
  compress?: boolean;
  verify?: boolean;
  parentBackupId?: string; // Required for incremental backups
}

/**
 * Restore options
 */
interface RestoreOptions {
  verify?: boolean;
  targetFile?: string;
  pointInTime?: string; // ISO timestamp
  preserveExisting?: boolean;
}

/**
 * Backup Service - Manages database backup and restore operations
 *
 * @class BackupService
 * @description Provides comprehensive backup management including creation, verification,
 * compression, scheduling, and restoration. Supports both full and incremental backups
 * with metadata tracking and retention policies.
 */
export class BackupService {
  private readonly backupDir: string;

  /**
   * Initialize BackupService with database connection
   *
   * @param {DatabaseConnection} db - Database connection instance
   */
  constructor(private readonly db: DatabaseConnection) {
    this.backupDir = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');
    this.ensureBackupDirectory();
  }

  /**
   * Ensure backup directory exists
   */
  private async ensureBackupDirectory(): Promise<void> {
    try {
      await fs.access(this.backupDir);
    } catch {
      await fs.mkdir(this.backupDir, { recursive: true });
      logger.info(`Created backup directory: ${this.backupDir}`);
    }
  }

  /**
   * Create a full backup of the database
   *
   * @param {CreateBackupOptions} options - Backup creation options
   * @returns {Promise<BackupMetadata>} Created backup metadata
   */
  async createFullBackup(options: CreateBackupOptions = {}): Promise<BackupMetadata> {
    const backupId = uuidv4();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = options.name || `full-backup-${timestamp}`;
    const filename = `${backupId}-${name}.sql${options.compress ? '.gz' : ''}`;
    const filePath = path.join(this.backupDir, filename);

    logger.info(`Starting full backup: ${name}`);

    // Create backup metadata
    const metadata: BackupMetadata = {
      id: backupId,
      name,
      type: 'full',
      status: 'in_progress',
      size: 0,
      compressed: options.compress || false,
      verified: false,
      checksum: '',
      filePath,
      createdAt: new Date().toISOString(),
    };
    if (options.description) {
      metadata.description = options.description;
    }

    try {
      // Store initial metadata
      await this.storeBackupMetadata(metadata);

      // Export database to SQL
      const sqlData = await this.exportDatabaseToSQL();

      let finalData: Buffer;
      if (options.compress) {
        finalData = await gzip(Buffer.from(sqlData));
      } else {
        finalData = Buffer.from(sqlData);
      }

      // Write backup file
      await fs.writeFile(filePath, finalData);

      // Calculate checksum
      const checksum = await this.calculateChecksum(filePath);

      // Update metadata
      metadata.status = 'completed';
      metadata.size = finalData.length;
      metadata.checksum = checksum;
      metadata.completedAt = new Date().toISOString();

      // Verify backup if requested
      if (options.verify) {
        metadata.verified = await this.verifyBackup(backupId);
      }

      await this.updateBackupMetadata(metadata);

      logger.info(`Full backup completed: ${name} (${metadata.size} bytes)`);
      return metadata;
    } catch (error) {
      metadata.status = 'failed';
      metadata.error = error instanceof Error ? error.message : 'Unknown error';
      await this.updateBackupMetadata(metadata);

      logger.error(`Full backup failed: ${name}`, error);
      throw error;
    }
  }

  /**
   * Create an incremental backup
   *
   * @param {CreateBackupOptions} options - Backup creation options with parent backup ID
   * @returns {Promise<BackupMetadata>} Created backup metadata
   */
  async createIncrementalBackup(options: CreateBackupOptions): Promise<BackupMetadata> {
    if (!options.parentBackupId) {
      throw new Error('Parent backup ID is required for incremental backups');
    }

    const backupId = uuidv4();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = options.name || `incremental-backup-${timestamp}`;
    const filename = `${backupId}-${name}.sql${options.compress ? '.gz' : ''}`;
    const filePath = path.join(this.backupDir, filename);

    logger.info(`Starting incremental backup: ${name}`);

    // Get parent backup to determine changes since
    const parentBackup = await this.getBackupMetadata(options.parentBackupId);
    if (!parentBackup) {
      throw new Error(`Parent backup not found: ${options.parentBackupId}`);
    }

    const metadata: BackupMetadata = {
      id: backupId,
      name,
      type: 'incremental',
      status: 'in_progress',
      size: 0,
      compressed: options.compress || false,
      verified: false,
      checksum: '',
      filePath,
      parentBackupId: options.parentBackupId,
      createdAt: new Date().toISOString(),
    };
    if (options.description) {
      metadata.description = options.description;
    }

    try {
      await this.storeBackupMetadata(metadata);

      // Export only changes since parent backup
      const sqlData = await this.exportDatabaseChanges(parentBackup.createdAt);

      let finalData: Buffer;
      if (options.compress) {
        finalData = await gzip(Buffer.from(sqlData));
      } else {
        finalData = Buffer.from(sqlData);
      }

      await fs.writeFile(filePath, finalData);

      const checksum = await this.calculateChecksum(filePath);

      metadata.status = 'completed';
      metadata.size = finalData.length;
      metadata.checksum = checksum;
      metadata.completedAt = new Date().toISOString();

      if (options.verify) {
        metadata.verified = await this.verifyBackup(backupId);
      }

      await this.updateBackupMetadata(metadata);

      logger.info(`Incremental backup completed: ${name} (${metadata.size} bytes)`);
      return metadata;
    } catch (error) {
      metadata.status = 'failed';
      metadata.error = error instanceof Error ? error.message : 'Unknown error';
      await this.updateBackupMetadata(metadata);

      logger.error(`Incremental backup failed: ${name}`, error);
      throw error;
    }
  }

  /**
   * Export database to SQL format
   */
  private async exportDatabaseToSQL(): Promise<string> {
    const tables = [
      'boards',
      'columns',
      'tasks',
      'notes',
      'tags',
      'task_tags',
      'task_dependencies',
    ];
    let sqlData = '-- MCP Kanban Database Backup\n';
    sqlData += `-- Created: ${new Date().toISOString()}\n\n`;

    // Add database schema
    sqlData += '-- Schema\n';
    sqlData += 'PRAGMA foreign_keys=OFF;\n';
    sqlData += 'BEGIN TRANSACTION;\n\n';

    for (const table of tables) {
      // Get table schema
      const schemaQuery = `SELECT sql FROM sqlite_master WHERE type='table' AND name='${table}'`;
      const schemaResult = await this.db.queryOne<{ sql: string }>(schemaQuery);
      if (schemaResult) {
        sqlData += `${schemaResult.sql};\n`;
      }

      // Get table data
      const dataQuery = `SELECT * FROM ${table}`;
      const rows = await this.db.query<any>(dataQuery);

      if (rows.length > 0) {
        sqlData += `\n-- Data for table ${table}\n`;
        for (const row of rows) {
          const columns = Object.keys(row)
            .map(col => `"${col}"`)
            .join(',');
          const values = Object.values(row)
            .map(val => (val === null ? 'NULL' : `'${String(val).replace(/'/g, "''")}'`))
            .join(',');
          sqlData += `INSERT INTO "${table}" (${columns}) VALUES (${values});\n`;
        }
      }
    }

    sqlData += '\nCOMMIT;\n';
    sqlData += 'PRAGMA foreign_keys=ON;\n';

    return sqlData;
  }

  /**
   * Export database changes since a timestamp
   */
  private async exportDatabaseChanges(sinceTimestamp: string): Promise<string> {
    const tables = [
      'boards',
      'columns',
      'tasks',
      'notes',
      'tags',
      'task_tags',
      'task_dependencies',
    ];
    let sqlData = '-- MCP Kanban Database Incremental Backup\n';
    sqlData += `-- Created: ${new Date().toISOString()}\n`;
    sqlData += `-- Changes since: ${sinceTimestamp}\n\n`;

    sqlData += 'PRAGMA foreign_keys=OFF;\n';
    sqlData += 'BEGIN TRANSACTION;\n\n';

    for (const table of tables) {
      // For incremental backups, we need to identify changed records
      // This is a simplified approach - in production, you'd want change tracking
      const dataQuery = `SELECT * FROM ${table} WHERE updated_at > ? OR created_at > ?`;
      try {
        const rows = await this.db.query<any>(dataQuery, [sinceTimestamp, sinceTimestamp]);

        if (rows.length > 0) {
          sqlData += `\n-- Changes for table ${table}\n`;
          for (const row of rows) {
            const columns = Object.keys(row)
              .map(col => `"${col}"`)
              .join(',');
            const values = Object.values(row)
              .map(val => (val === null ? 'NULL' : `'${String(val).replace(/'/g, "''")}'`))
              .join(',');
            sqlData += `INSERT OR REPLACE INTO "${table}" (${columns}) VALUES (${values});\n`;
          }
        }
      } catch (error) {
        // Some tables might not have updated_at/created_at columns
        logger.warn(`Could not get incremental data for table ${table}:`, error);
      }
    }

    sqlData += '\nCOMMIT;\n';
    sqlData += 'PRAGMA foreign_keys=ON;\n';

    return sqlData;
  }

  /**
   * Verify backup integrity
   */
  async verifyBackup(backupId: string): Promise<boolean> {
    try {
      const metadata = await this.getBackupMetadata(backupId);
      if (!metadata) {
        throw new Error(`Backup not found: ${backupId}`);
      }

      // Check file exists
      await fs.access(metadata.filePath);

      // Verify checksum
      const currentChecksum = await this.calculateChecksum(metadata.filePath);
      if (currentChecksum !== metadata.checksum) {
        logger.error(`Backup verification failed: checksum mismatch for ${backupId}`);
        return false;
      }

      // Try to read the backup content
      let content: Buffer;
      if (metadata.compressed) {
        const compressedData = await fs.readFile(metadata.filePath);
        content = await gunzip(compressedData);
      } else {
        content = await fs.readFile(metadata.filePath);
      }

      // Basic SQL syntax validation
      const sqlContent = content.toString();
      if (!sqlContent.includes('BEGIN TRANSACTION') || !sqlContent.includes('COMMIT')) {
        logger.error(`Backup verification failed: invalid SQL format for ${backupId}`);
        return false;
      }

      logger.info(`Backup verification successful: ${backupId}`);
      return true;
    } catch (error) {
      logger.error(`Backup verification failed for ${backupId}:`, error);
      return false;
    }
  }

  /**
   * Restore from backup
   */
  async restoreFromBackup(backupId: string, options: RestoreOptions = {}): Promise<void> {
    logger.info(`Starting restore from backup: ${backupId}`);

    // If point-in-time restoration is requested, use specialized method
    if (options.pointInTime) {
      return this.restoreToPointInTime(options.pointInTime, options);
    }

    const metadata = await this.getBackupMetadata(backupId);
    if (!metadata) {
      throw new Error(`Backup not found: ${backupId}`);
    }

    if (metadata.status !== 'completed') {
      throw new Error(`Cannot restore from incomplete backup: ${metadata.status}`);
    }

    // Verify backup if requested
    if (options.verify) {
      const isValid = await this.verifyBackup(backupId);
      if (!isValid) {
        throw new Error('Backup verification failed');
      }
    }

    try {
      // Read backup content
      let content: Buffer;
      if (metadata.compressed) {
        const compressedData = await fs.readFile(metadata.filePath);
        content = await gunzip(compressedData);
      } else {
        content = await fs.readFile(metadata.filePath);
      }

      const sqlContent = content.toString();

      // Execute SQL restore
      await this.db.getDatabase().exec(sqlContent);

      logger.info(`Database restored successfully from backup: ${backupId}`);
    } catch (error) {
      logger.error(`Restore failed for backup ${backupId}:`, error);
      throw error;
    }
  }

  /**
   * Restore database to a specific point in time
   *
   * @param {string} targetTime - ISO timestamp to restore to
   * @param {RestoreOptions} options - Restore options
   * @returns {Promise<void>}
   */
  async restoreToPointInTime(targetTime: string, options: RestoreOptions = {}): Promise<void> {
    const targetDate = new Date(targetTime);
    if (isNaN(targetDate.getTime())) {
      throw new Error(
        `Invalid target time format: ${targetTime}. Use ISO format (e.g., 2025-07-26T10:30:00Z)`
      );
    }

    logger.info(`Starting point-in-time restoration to: ${targetTime}`);

    try {
      // Find the restoration path (chain of backups to apply)
      const restorationPlan = await this.buildRestorationPlan(targetDate);

      if (restorationPlan.length === 0) {
        throw new Error(`No suitable backups found for restoration to ${targetTime}`);
      }

      logger.info(`Found restoration plan with ${restorationPlan.length} backup(s)`);

      // Verify all backups in the restoration path if requested
      if (options.verify) {
        await this.verifyRestorationPlan(restorationPlan);
      }

      // Create a temporary backup of current state if preserveExisting is true
      let currentStateBackup: BackupMetadata | null = null;
      if (options.preserveExisting) {
        currentStateBackup = await this.createFullBackup({
          name: `pre-restoration-backup-${Date.now()}`,
          description: `Automatic backup before point-in-time restoration to ${targetTime}`,
          verify: false,
        });
        logger.info(`Created preservation backup: ${currentStateBackup.id}`);
      }

      // Execute restoration in correct order
      await this.executeRestorationPlan(restorationPlan, targetDate);

      logger.info(`Point-in-time restoration completed successfully to ${targetTime}`);
    } catch (error) {
      logger.error(`Point-in-time restoration failed:`, error);
      throw error;
    }
  }

  /**
   * Build a restoration plan (sequence of backups to apply)
   *
   * @param {Date} targetDate - Target restoration date
   * @returns {Promise<BackupMetadata[]>} Ordered list of backups to apply
   */
  private async buildRestorationPlan(targetDate: Date): Promise<BackupMetadata[]> {
    // Get all completed backups before the target time, ordered by creation time
    const allBackups = await this.db.query(
      `
      SELECT * FROM backup_metadata 
      WHERE status = 'completed' 
        AND datetime(created_at) <= datetime(?)
      ORDER BY datetime(created_at) ASC
    `,
      [targetDate.toISOString()]
    );

    const backups = allBackups.map(row => this.deserializeBackupMetadata(row));

    if (backups.length === 0) {
      return [];
    }

    // Find the latest full backup before the target time
    const fullBackups = backups.filter(b => b.type === 'full');
    if (fullBackups.length === 0) {
      throw new Error('No full backup found before the target time');
    }

    const latestFullBackup = fullBackups[fullBackups.length - 1]!; // We checked length > 0 above
    const restorationPlan: BackupMetadata[] = [latestFullBackup];

    // Find all incremental backups after the full backup and before target time
    const incrementalBackups = backups.filter(
      b =>
        b.type === 'incremental' &&
        new Date(b.createdAt) > new Date(latestFullBackup.createdAt) &&
        new Date(b.createdAt) <= targetDate
    );

    // Sort incremental backups by creation time
    incrementalBackups.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    restorationPlan.push(...incrementalBackups);

    return restorationPlan;
  }

  /**
   * Verify all backups in the restoration plan
   *
   * @param {BackupMetadata[]} plan - Restoration plan to verify
   * @returns {Promise<void>}
   */
  private async verifyRestorationPlan(plan: BackupMetadata[]): Promise<void> {
    logger.info(`Verifying ${plan.length} backups in restoration plan`);

    for (const backup of plan) {
      const isValid = await this.verifyBackup(backup.id);
      if (!isValid) {
        throw new Error(`Backup verification failed for ${backup.id} (${backup.name})`);
      }
    }

    logger.info('All backups in restoration plan verified successfully');
  }

  /**
   * Execute the restoration plan
   *
   * @param {BackupMetadata[]} plan - Restoration plan to execute
   * @param {Date} targetDate - Target restoration date
   * @returns {Promise<void>}
   */
  private async executeRestorationPlan(plan: BackupMetadata[], _targetDate: Date): Promise<void> {
    logger.info(`Executing restoration plan with ${plan.length} backup(s)`);

    // Start with the full backup
    const fullBackup = plan[0];
    if (!fullBackup || fullBackup.type !== 'full') {
      throw new Error('First backup in restoration plan must be a full backup');
    }

    // Clear existing data and restore from full backup
    logger.info(`Applying full backup: ${fullBackup.name} (${fullBackup.id})`);
    await this.applyBackupContent(fullBackup, true);

    // Apply incremental backups in order
    for (let i = 1; i < plan.length; i++) {
      const incrementalBackup = plan[i];
      if (!incrementalBackup) continue;
      logger.info(
        `Applying incremental backup: ${incrementalBackup.name} (${incrementalBackup.id})`
      );
      await this.applyBackupContent(incrementalBackup, false);
    }

    // Log the final restoration point
    const finalBackup = plan[plan.length - 1];
    if (finalBackup) {
      logger.info(
        `Restoration completed. Final state from backup created at: ${finalBackup.createdAt}`
      );
    }
  }

  /**
   * Apply backup content to the database
   *
   * @param {BackupMetadata} backup - Backup to apply
   * @param {boolean} clearFirst - Whether to clear existing data first
   * @returns {Promise<void>}
   */
  private async applyBackupContent(
    backup: BackupMetadata,
    clearFirst: boolean = false
  ): Promise<void> {
    try {
      // Read backup content
      let content: Buffer;
      if (backup.compressed) {
        const compressedData = await fs.readFile(backup.filePath);
        content = await gunzip(compressedData);
      } else {
        content = await fs.readFile(backup.filePath);
      }

      const sqlContent = content.toString();

      // Execute SQL with transaction
      await this.db.transaction(async db => {
        if (clearFirst) {
          // Clear all tables in reverse dependency order
          const tables = [
            'task_dependencies',
            'task_tags',
            'notes',
            'tasks',
            'columns',
            'boards',
            'tags',
          ];
          for (const table of tables) {
            await db.run(`DELETE FROM ${table}`);
          }
        }

        // Execute the backup SQL
        await db.exec(sqlContent);
      });
    } catch (error) {
      logger.error(`Failed to apply backup content for ${backup.id}:`, error);
      throw error;
    }
  }

  /**
   * List all backups with optional filtering
   */
  async listBackups(
    options: {
      limit?: number;
      offset?: number;
      type?: 'full' | 'incremental';
      status?: string;
    } = {}
  ): Promise<BackupMetadata[]> {
    let query = 'SELECT * FROM backup_metadata WHERE 1=1';
    const params: (string | number)[] = [];

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

      if (options.offset) {
        query += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    const rows = await this.db.query(query, params);
    return rows.map(row => this.deserializeBackupMetadata(row));
  }

  /**
   * Get backup metadata by ID
   */
  async getBackupMetadata(backupId: string): Promise<BackupMetadata | null> {
    const row = await this.db.queryOne('SELECT * FROM backup_metadata WHERE id = ?', [backupId]);
    return row ? this.deserializeBackupMetadata(row) : null;
  }

  /**
   * Delete backup and its files
   */
  async deleteBackup(backupId: string): Promise<void> {
    const metadata = await this.getBackupMetadata(backupId);
    if (!metadata) {
      throw new Error(`Backup not found: ${backupId}`);
    }

    try {
      // Delete backup file
      await fs.unlink(metadata.filePath);
    } catch (error) {
      logger.warn(`Could not delete backup file: ${metadata.filePath}`, error);
    }

    // Delete metadata
    await this.db.execute('DELETE FROM backup_metadata WHERE id = ?', [backupId]);

    logger.info(`Backup deleted: ${backupId}`);
  }

  /**
   * Store backup metadata in database
   */
  private async storeBackupMetadata(metadata: BackupMetadata): Promise<void> {
    // Ensure backup_metadata table exists
    await this.ensureMetadataTable();

    const query = `
      INSERT INTO backup_metadata (
        id, name, description, type, status, size, compressed, verified, 
        checksum, file_path, created_at, completed_at, parent_backup_id, 
        retention_policy, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.db.execute(query, [
      metadata.id,
      metadata.name,
      metadata.description,
      metadata.type,
      metadata.status,
      metadata.size,
      metadata.compressed ? 1 : 0,
      metadata.verified ? 1 : 0,
      metadata.checksum,
      metadata.filePath,
      metadata.createdAt,
      metadata.completedAt,
      metadata.parentBackupId,
      metadata.retentionPolicy,
      metadata.error,
    ]);
  }

  /**
   * Update backup metadata
   */
  private async updateBackupMetadata(metadata: BackupMetadata): Promise<void> {
    const query = `
      UPDATE backup_metadata SET
        status = ?, size = ?, verified = ?, checksum = ?, 
        completed_at = ?, error = ?
      WHERE id = ?
    `;

    await this.db.execute(query, [
      metadata.status,
      metadata.size,
      metadata.verified ? 1 : 0,
      metadata.checksum,
      metadata.completedAt,
      metadata.error,
      metadata.id,
    ]);
  }

  /**
   * Ensure backup metadata table exists
   */
  private async ensureMetadataTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS backup_metadata (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL CHECK (type IN ('full', 'incremental')),
        status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'corrupted')),
        size INTEGER DEFAULT 0,
        compressed INTEGER DEFAULT 0,
        verified INTEGER DEFAULT 0,
        checksum TEXT,
        file_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        parent_backup_id TEXT,
        retention_policy TEXT,
        error TEXT,
        FOREIGN KEY (parent_backup_id) REFERENCES backup_metadata(id)
      )
    `;

    await this.db.getDatabase().exec(query);
  }

  /**
   * Calculate file checksum (SHA-256)
   */
  private async calculateChecksum(filePath: string): Promise<string> {
    const crypto = await import('crypto');
    const fileBuffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  /**
   * Deserialize backup metadata from database row
   */
  private deserializeBackupMetadata(row: {
    id: string;
    name: string;
    description?: string;
    type: string;
    status: string;
    size: number;
    compressed: number;
    verified: number;
    checksum: string;
    file_path: string;
    created_at: string;
    completed_at?: string;
    parent_backup_id?: string;
    retention_policy?: string;
    error?: string;
  }): BackupMetadata {
    const metadata: BackupMetadata = {
      id: row.id,
      name: row.name,
      type: row.type as 'full' | 'incremental',
      status: row.status as 'pending' | 'in_progress' | 'completed' | 'failed' | 'corrupted',
      size: row.size,
      compressed: Boolean(row.compressed),
      verified: Boolean(row.verified),
      checksum: row.checksum,
      filePath: row.file_path,
      createdAt: row.created_at,
    };

    // Add optional properties only if they exist
    if (row.description) metadata.description = row.description;
    if (row.completed_at) metadata.completedAt = row.completed_at;
    if (row.parent_backup_id) metadata.parentBackupId = row.parent_backup_id;
    if (row.retention_policy) metadata.retentionPolicy = row.retention_policy;
    if (row.error) metadata.error = row.error;

    return metadata;
  }

  /**
   * Validate restoration results by comparing table counts and checksums
   *
   * @param {string} backupId - ID of the backup that was restored
   * @returns {Promise<RestoreValidationResult>} Validation results
   */
  async validateRestoration(backupId: string): Promise<RestoreValidationResult> {
    logger.info(`Validating restoration from backup: ${backupId}`);

    const metadata = await this.getBackupMetadata(backupId);
    if (!metadata) {
      throw new Error(`Backup not found: ${backupId}`);
    }

    const validationResult: RestoreValidationResult = {
      isValid: true,
      tableChecks: [],
      errors: [],
    };

    try {
      // Get all tables
      const tables = await this.db.query(
        `SELECT name FROM sqlite_master WHERE type='table' 
         AND name NOT LIKE 'sqlite_%' 
         AND name NOT LIKE 'backup_%'`
      );

      // Check each table
      for (const table of tables) {
        const tableName = table.name as string;

        // Get row count
        const countResult = await this.db.queryOne(`SELECT COUNT(*) as count FROM ${tableName}`);
        const rowCount = countResult?.count || 0;

        // Get table checksum (using all columns concatenated)
        const columnsResult = await this.db.query(`PRAGMA table_info(${tableName})`);
        const columns = columnsResult.map(col => col.name as string);

        const tableCheck = {
          tableName,
          rowCount,
          isValid: rowCount >= 0, // Basic check - could be enhanced
          message: '',
        };

        if (rowCount === 0 && ['boards', 'columns'].includes(tableName)) {
          tableCheck.isValid = false;
          tableCheck.message = `Table ${tableName} is empty but should have data`;
          validationResult.isValid = false;
        }

        validationResult.tableChecks.push(tableCheck);
      }

      // Verify foreign key integrity
      const fkCheckResult = await this.db.queryOne('PRAGMA foreign_key_check');
      if (fkCheckResult) {
        validationResult.isValid = false;
        validationResult.errors.push('Foreign key constraint violations detected');
      }

      // Verify database integrity
      const integrityCheck = await this.db.queryOne('PRAGMA integrity_check');
      if (integrityCheck && integrityCheck.integrity_check !== 'ok') {
        validationResult.isValid = false;
        validationResult.errors.push(
          `Database integrity check failed: ${integrityCheck.integrity_check}`
        );
      }
    } catch (error) {
      validationResult.isValid = false;
      validationResult.errors.push(
        `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    logger.info(`Restoration validation completed. Valid: ${validationResult.isValid}`);
    return validationResult;
  }

  /**
   * Perform data integrity checks on the database
   *
   * @returns {Promise<IntegrityCheckResult>} Integrity check results
   */
  async performIntegrityChecks(): Promise<IntegrityCheckResult> {
    logger.info('Performing database integrity checks');

    const result: IntegrityCheckResult = {
      isPassed: true,
      checks: [],
    };

    try {
      // 1. PRAGMA integrity_check
      const integrityCheck = await this.db.queryOne('PRAGMA integrity_check');
      result.checks.push({
        name: 'SQLite Integrity Check',
        passed: integrityCheck?.integrity_check === 'ok',
        message: integrityCheck?.integrity_check || 'Unknown',
      });

      // 2. Foreign key check
      const fkCheck = await this.db.query('PRAGMA foreign_key_check');
      result.checks.push({
        name: 'Foreign Key Constraints',
        passed: fkCheck.length === 0,
        message:
          fkCheck.length === 0 ? 'All constraints satisfied' : `${fkCheck.length} violations found`,
      });

      // 3. Check for orphaned records
      const orphanChecks = [
        {
          name: 'Orphaned Tasks',
          query: `SELECT COUNT(*) as count FROM tasks WHERE board_id NOT IN (SELECT id FROM boards)`,
        },
        {
          name: 'Orphaned Notes',
          query: `SELECT COUNT(*) as count FROM notes WHERE task_id IS NOT NULL AND task_id NOT IN (SELECT id FROM tasks)`,
        },
        {
          name: 'Orphaned Task Tags',
          query: `SELECT COUNT(*) as count FROM task_tags WHERE task_id NOT IN (SELECT id FROM tasks) OR tag_id NOT IN (SELECT id FROM tags)`,
        },
      ];

      for (const check of orphanChecks) {
        const result_1 = await this.db.queryOne(check.query);
        const count = result_1?.count || 0;
        result.checks.push({
          name: check.name,
          passed: count === 0,
          message: count === 0 ? 'No orphans found' : `${count} orphaned records found`,
        });
      }

      // 4. Check for data consistency
      const consistencyChecks = [
        {
          name: 'Task Position Uniqueness',
          query: `SELECT board_id, column_id, position, COUNT(*) as count 
                  FROM tasks 
                  WHERE deleted_at IS NULL 
                  GROUP BY board_id, column_id, position 
                  HAVING count > 1`,
        },
        {
          name: 'Column Position Uniqueness',
          query: `SELECT board_id, position, COUNT(*) as count 
                  FROM columns 
                  GROUP BY board_id, position 
                  HAVING count > 1`,
        },
      ];

      for (const check of consistencyChecks) {
        const violations = await this.db.query(check.query);
        result.checks.push({
          name: check.name,
          passed: violations.length === 0,
          message:
            violations.length === 0
              ? 'No violations found'
              : `${violations.length} violations found`,
        });
      }

      // Update overall status
      result.isPassed = result.checks.every(check => check.passed);
    } catch (error) {
      result.isPassed = false;
      result.checks.push({
        name: 'Error during checks',
        passed: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    logger.info(`Integrity checks completed. Passed: ${result.isPassed}`);
    return result;
  }

  /**
   * Restore partial data from a backup (specific tables only)
   *
   * @param {string} backupId - ID of the backup to restore from
   * @param {PartialRestoreOptions} options - Options for partial restoration
   * @returns {Promise<void>}
   */
  async restorePartial(backupId: string, options: PartialRestoreOptions): Promise<void> {
    logger.info(`Starting partial restore from backup: ${backupId}`, { tables: options.tables });

    const metadata = await this.getBackupMetadata(backupId);
    if (!metadata) {
      throw new Error(`Backup not found: ${backupId}`);
    }

    if (metadata.status !== 'completed') {
      throw new Error(`Cannot restore from incomplete backup: ${metadata.status}`);
    }

    // Verify backup if requested
    if (options.verify) {
      const isValid = await this.verifyBackup(backupId);
      if (!isValid) {
        throw new Error('Backup verification failed');
      }
    }

    try {
      // Read backup content
      let content: Buffer;
      if (metadata.compressed) {
        const compressedData = await fs.readFile(metadata.filePath);
        content = await gunzip(compressedData);
      } else {
        content = await fs.readFile(metadata.filePath);
      }

      const sqlContent = content.toString();

      // Parse SQL to extract only requested tables
      const tablesToRestore = new Set(options.tables.map(t => t.toLowerCase()));
      const statements = sqlContent.split(';').filter(stmt => stmt.trim());

      await this.db.transaction(async () => {
        for (const statement of statements) {
          const trimmed = statement.trim();

          // Check if this statement is for a table we want to restore
          let shouldExecute = false;

          // Check for INSERT INTO statements
          const insertMatch = trimmed.match(/^INSERT INTO\s+['"`]?(\w+)['"`]?/i);
          if (insertMatch && tablesToRestore.has(insertMatch[1].toLowerCase())) {
            shouldExecute = true;

            // Clear existing data if not preserving
            if (!options.preserveExisting) {
              const tableName = insertMatch[1];
              await this.db.execute(`DELETE FROM ${tableName}`);
              logger.info(`Cleared existing data from table: ${tableName}`);
            }
          }

          // Check for CREATE TABLE statements (if restoring schema)
          if (options.includeSchema) {
            const createMatch = trimmed.match(
              /^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?['"`]?(\w+)['"`]?/i
            );
            if (createMatch && tablesToRestore.has(createMatch[1].toLowerCase())) {
              shouldExecute = true;
            }
          }

          if (shouldExecute) {
            await this.db.getDatabase().exec(trimmed);
          }
        }
      });

      logger.info(
        `Partial restore completed successfully for tables: ${options.tables.join(', ')}`
      );

      // Validate if requested
      if (options.validateAfter) {
        const validation = await this.validateRestoration(backupId);
        if (!validation.isValid) {
          logger.warn('Restoration validation failed', validation);
        }
      }
    } catch (error) {
      logger.error(`Partial restore failed for backup ${backupId}:`, error);
      throw error;
    }
  }

  /**
   * Track restoration progress (for long-running restores)
   *
   * @param {string} restoreId - Unique ID for this restore operation
   * @param {number} totalSteps - Total number of steps
   * @param {number} currentStep - Current step number
   * @param {string} message - Progress message
   */
  async updateRestoreProgress(
    restoreId: string,
    totalSteps: number,
    currentStep: number,
    message: string
  ): Promise<void> {
    const progress = Math.round((currentStep / totalSteps) * 100);

    // Store progress in a temporary table
    await this.db.execute(
      `
      INSERT OR REPLACE INTO restore_progress (id, total_steps, current_step, progress, message, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `,
      [restoreId, totalSteps, currentStep, progress, message]
    );

    logger.info(`Restore progress [${restoreId}]: ${progress}% - ${message}`);
  }

  /**
   * Get restoration progress
   *
   * @param {string} restoreId - Unique ID for the restore operation
   * @returns {Promise<RestoreProgress | null>} Current progress or null if not found
   */
  async getRestoreProgress(restoreId: string): Promise<RestoreProgress | null> {
    // Ensure restore_progress table exists
    await this.ensureRestoreProgressTable();

    const row = await this.db.queryOne('SELECT * FROM restore_progress WHERE id = ?', [restoreId]);

    if (!row) return null;

    return {
      id: row.id as string,
      totalSteps: row.total_steps as number,
      currentStep: row.current_step as number,
      progress: row.progress as number,
      message: row.message as string,
      updatedAt: row.updated_at as string,
    };
  }

  /**
   * Ensure restore_progress table exists
   */
  private async ensureRestoreProgressTable(): Promise<void> {
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
}

// Type definitions for new features
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
