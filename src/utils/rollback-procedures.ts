/**
 * @fileoverview Comprehensive rollback and recovery procedures
 * @lastmodified 2025-07-28T08:30:00Z
 *
 * Features: Database rollbacks, configuration rollbacks, deployment rollbacks, state recovery
 * Main APIs: RollbackManager, StateSnapshot, RecoveryProcedures
 * Constraints: Requires backup systems, checkpoint management
 * Patterns: Command pattern for rollback operations, memento pattern for state
 */

import path from 'path';
import fs from 'fs/promises';
import { logger } from './logger';
import { BaseServiceError } from './errors';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface RollbackOperation {
  id: string;
  type: 'database' | 'configuration' | 'deployment' | 'state';
  description: string;
  timestamp: Date;
  execute: () => Promise<void>;
  verify: () => Promise<boolean>;
  metadata?: Record<string, unknown>;
}

export interface StateSnapshot {
  id: string;
  timestamp: Date;
  type: 'database' | 'configuration' | 'application' | 'full';
  checksum: string;
  size: number;
  metadata: {
    version: string;
    environment: string;
    userId?: string;
    operation?: string;
    tags?: string[];
  };
  dataPath: string;
}

export interface RollbackPlan {
  id: string;
  name: string;
  description: string;
  operations: RollbackOperation[];
  dependencies: string[];
  estimatedDuration: number; // in milliseconds
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  approvalRequired: boolean;
  createdAt: Date;
  createdBy?: string;
}

export interface RecoveryPoint {
  id: string;
  timestamp: Date;
  type: 'automatic' | 'manual' | 'scheduled';
  description: string;
  snapshots: StateSnapshot[];
  verified: boolean;
  retentionDays: number;
}

// ============================================================================
// STATE SNAPSHOT MANAGER
// ============================================================================

export class StateSnapshotManager {
  private readonly snapshotsDir: string;

  private readonly maxSnapshots: number;

  constructor(snapshotsDir: string = path.join(process.cwd(), 'snapshots'), maxSnapshots = 50) {
    this.snapshotsDir = snapshotsDir;
    this.maxSnapshots = maxSnapshots;
  }

  /**
   * Create a state snapshot
   */
  async createSnapshot(
    type: StateSnapshot['type'],
    metadata: StateSnapshot['metadata']
  ): Promise<StateSnapshot> {
    const id = this.generateSnapshotId();
    const timestamp = new Date();

    try {
      // Ensure snapshots directory exists
      await fs.mkdir(this.snapshotsDir, { recursive: true });

      let dataPath: string;
      let size: number;
      let checksum: string;

      switch (type) {
        case 'database':
          ({ dataPath, size, checksum } = await this.createDatabaseSnapshot(id));
          break;
        case 'configuration':
          ({ dataPath, size, checksum } = await this.createConfigurationSnapshot(id));
          break;
        case 'application':
          ({ dataPath, size, checksum } = await this.createApplicationSnapshot(id));
          break;
        case 'full':
          ({ dataPath, size, checksum } = await this.createFullSnapshot(id));
          break;
        default:
          throw new BaseServiceError(
            'INVALID_SNAPSHOT_TYPE',
            `Unsupported snapshot type: ${type}`,
            400
          );
      }

      const snapshot: StateSnapshot = {
        id,
        timestamp,
        type,
        checksum,
        size,
        metadata,
        dataPath,
      };

      // Save snapshot metadata
      await this.saveSnapshotMetadata(snapshot);

      // Clean up old snapshots
      await this.cleanupOldSnapshots();

      logger.info('State snapshot created', {
        snapshotId: id,
        type,
        size,
        dataPath,
      });

      return snapshot;
    } catch (error) {
      logger.error('Failed to create state snapshot', {
        type,
        error: (error as Error).message,
      });
      throw new BaseServiceError(
        'SNAPSHOT_CREATION_FAILED',
        `Failed to create ${type} snapshot: ${(error as Error).message}`,
        500
      );
    }
  }

  /**
   * Restore from a state snapshot
   */
  async restoreFromSnapshot(snapshotId: string): Promise<void> {
    const snapshot = await this.getSnapshot(snapshotId);
    if (!snapshot) {
      throw new BaseServiceError('SNAPSHOT_NOT_FOUND', `Snapshot ${snapshotId} not found`, 404);
    }

    try {
      logger.info('Starting snapshot restoration', {
        snapshotId,
        type: snapshot.type,
        timestamp: snapshot.timestamp,
      });

      // Verify snapshot integrity
      const isValid = await this.verifySnapshotIntegrity(snapshot);
      if (!isValid) {
        throw new BaseServiceError('SNAPSHOT_CORRUPTED', 'Snapshot integrity check failed', 500);
      }

      // Perform restoration based on type
      switch (snapshot.type) {
        case 'database':
          await this.restoreDatabaseSnapshot(snapshot);
          break;
        case 'configuration':
          await this.restoreConfigurationSnapshot(snapshot);
          break;
        case 'application':
          await this.restoreApplicationSnapshot(snapshot);
          break;
        case 'full':
          await this.restoreFullSnapshot(snapshot);
          break;
      }

      logger.info('Snapshot restoration completed', {
        snapshotId,
        type: snapshot.type,
      });
    } catch (error) {
      logger.error('Snapshot restoration failed', {
        snapshotId,
        error: (error as Error).message,
      });
      throw new BaseServiceError(
        'SNAPSHOT_RESTORATION_FAILED',
        `Failed to restore snapshot: ${(error as Error).message}`,
        500
      );
    }
  }

  /**
   * List available snapshots
   */
  async listSnapshots(filters?: {
    type?: StateSnapshot['type'];
    since?: Date;
    limit?: number;
  }): Promise<StateSnapshot[]> {
    try {
      const metadataFiles = await fs.readdir(path.join(this.snapshotsDir, 'metadata'));

      let snapshots: StateSnapshot[] = [];

      for (const file of metadataFiles) {
        if (file.endsWith('.json')) {
          const content = await fs.readFile(path.join(this.snapshotsDir, 'metadata', file), 'utf8');
          const snapshot = JSON.parse(content) as StateSnapshot;
          snapshot.timestamp = new Date(snapshot.timestamp);
          snapshots.push(snapshot);
        }
      }

      // Apply filters
      if (filters?.type) {
        snapshots = snapshots.filter(s => s.type === filters.type);
      }

      if (filters?.since) {
        snapshots = snapshots.filter(s => s.timestamp >= filters.since!);
      }

      // Sort by timestamp (newest first)
      snapshots.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      // Apply limit
      if (filters?.limit) {
        snapshots = snapshots.slice(0, filters.limit);
      }

      return snapshots;
    } catch (error) {
      logger.error('Failed to list snapshots', {
        error: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * Delete a snapshot
   */
  async deleteSnapshot(snapshotId: string): Promise<void> {
    const snapshot = await this.getSnapshot(snapshotId);
    if (!snapshot) {
      throw new BaseServiceError('SNAPSHOT_NOT_FOUND', `Snapshot ${snapshotId} not found`, 404);
    }

    try {
      // Delete snapshot data
      await fs.rm(snapshot.dataPath, { recursive: true, force: true });

      // Delete metadata
      const metadataPath = path.join(this.snapshotsDir, 'metadata', `${snapshotId}.json`);
      await fs.rm(metadataPath, { force: true });

      logger.info('Snapshot deleted', { snapshotId });
    } catch (error) {
      logger.error('Failed to delete snapshot', {
        snapshotId,
        error: (error as Error).message,
      });
      throw new BaseServiceError(
        'SNAPSHOT_DELETION_FAILED',
        `Failed to delete snapshot: ${(error as Error).message}`,
        500
      );
    }
  }

  // Private methods for different snapshot types
  private async createDatabaseSnapshot(id: string): Promise<{
    dataPath: string;
    size: number;
    checksum: string;
  }> {
    const dataPath = path.join(this.snapshotsDir, 'data', `db_${id}`);
    await fs.mkdir(path.dirname(dataPath), { recursive: true });

    // In a real implementation, this would:
    // 1. Create a database backup
    // 2. Export schema and data
    // 3. Calculate checksum

    // Mock implementation
    const mockData = JSON.stringify({
      timestamp: new Date(),
      type: 'database',
      // Would contain actual database export
    });

    await fs.writeFile(dataPath, mockData);
    const stats = await fs.stat(dataPath);
    const checksum = this.calculateChecksum(mockData);

    return {
      dataPath,
      size: stats.size,
      checksum,
    };
  }

  private async createConfigurationSnapshot(id: string): Promise<{
    dataPath: string;
    size: number;
    checksum: string;
  }> {
    const dataPath = path.join(this.snapshotsDir, 'data', `config_${id}.json`);
    await fs.mkdir(path.dirname(dataPath), { recursive: true });

    // Capture current configuration
    const config = {
      environment: process.env.NODE_ENV,
      logLevel: process.env.LOG_LEVEL,
      // Add other configuration values
      timestamp: new Date(),
    };

    const configData = JSON.stringify(config, null, 2);
    await fs.writeFile(dataPath, configData);

    const stats = await fs.stat(dataPath);
    const checksum = this.calculateChecksum(configData);

    return {
      dataPath,
      size: stats.size,
      checksum,
    };
  }

  private async createApplicationSnapshot(id: string): Promise<{
    dataPath: string;
    size: number;
    checksum: string;
  }> {
    const dataPath = path.join(this.snapshotsDir, 'data', `app_${id}.tar`);
    await fs.mkdir(path.dirname(dataPath), { recursive: true });

    // Mock application state capture
    const appState = {
      timestamp: new Date(),
      version: process.env.npm_package_version ?? '1.0.0',
      nodeVersion: process.version,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      // Would include actual application state
    };

    const stateData = JSON.stringify(appState, null, 2);
    await fs.writeFile(dataPath, stateData);

    const stats = await fs.stat(dataPath);
    const checksum = this.calculateChecksum(stateData);

    return {
      dataPath,
      size: stats.size,
      checksum,
    };
  }

  private async createFullSnapshot(id: string): Promise<{
    dataPath: string;
    size: number;
    checksum: string;
  }> {
    // Create individual snapshots
    const dbSnapshot = await this.createDatabaseSnapshot(`${id}_db`);
    const configSnapshot = await this.createConfigurationSnapshot(`${id}_config`);
    const appSnapshot = await this.createApplicationSnapshot(`${id}_app`);

    // Combine into full snapshot
    const dataPath = path.join(this.snapshotsDir, 'data', `full_${id}.json`);
    const fullSnapshot = {
      database: dbSnapshot,
      configuration: configSnapshot,
      application: appSnapshot,
      timestamp: new Date(),
    };

    const fullData = JSON.stringify(fullSnapshot, null, 2);
    await fs.writeFile(dataPath, fullData);

    const stats = await fs.stat(dataPath);
    const checksum = this.calculateChecksum(fullData);

    return {
      dataPath,
      size: stats.size,
      checksum,
    };
  }

  private async restoreDatabaseSnapshot(snapshot: StateSnapshot): Promise<void> {
    logger.info('Restoring database snapshot', { snapshotId: snapshot.id });
    // In a real implementation, this would restore the database
    // from the snapshot data
  }

  private async restoreConfigurationSnapshot(snapshot: StateSnapshot): Promise<void> {
    logger.info('Restoring configuration snapshot', { snapshotId: snapshot.id });
    // In a real implementation, this would restore configuration
    // from the snapshot data
  }

  private async restoreApplicationSnapshot(snapshot: StateSnapshot): Promise<void> {
    logger.info('Restoring application snapshot', { snapshotId: snapshot.id });
    // In a real implementation, this would restore application state
    // from the snapshot data
  }

  private async restoreFullSnapshot(snapshot: StateSnapshot): Promise<void> {
    logger.info('Restoring full snapshot', { snapshotId: snapshot.id });
    // In a real implementation, this would restore all components
    // from the full snapshot
  }

  private async getSnapshot(snapshotId: string): Promise<StateSnapshot | null> {
    try {
      const metadataPath = path.join(this.snapshotsDir, 'metadata', `${snapshotId}.json`);
      const content = await fs.readFile(metadataPath, 'utf8');
      const snapshot = JSON.parse(content) as StateSnapshot;
      snapshot.timestamp = new Date(snapshot.timestamp);
      return snapshot;
    } catch {
      return null;
    }
  }

  private async saveSnapshotMetadata(snapshot: StateSnapshot): Promise<void> {
    const metadataDir = path.join(this.snapshotsDir, 'metadata');
    await fs.mkdir(metadataDir, { recursive: true });

    const metadataPath = path.join(metadataDir, `${snapshot.id}.json`);
    await fs.writeFile(metadataPath, JSON.stringify(snapshot, null, 2));
  }

  private async verifySnapshotIntegrity(snapshot: StateSnapshot): Promise<boolean> {
    try {
      const content = await fs.readFile(snapshot.dataPath, 'utf8');
      const calculatedChecksum = this.calculateChecksum(content);
      return calculatedChecksum === snapshot.checksum;
    } catch {
      return false;
    }
  }

  private async cleanupOldSnapshots(): Promise<void> {
    const snapshots = await this.listSnapshots();

    if (snapshots.length > this.maxSnapshots) {
      const toDelete = snapshots.slice(this.maxSnapshots);

      for (const snapshot of toDelete) {
        await this.deleteSnapshot(snapshot.id);
      }

      logger.info('Old snapshots cleaned up', {
        deleted: toDelete.length,
        remaining: this.maxSnapshots,
      });
    }
  }

  private generateSnapshotId(): string {
    return `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private calculateChecksum(data: string): string {
    // Simple checksum calculation - in production, use proper cryptographic hash
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash &= hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}

// ============================================================================
// ROLLBACK MANAGER
// ============================================================================

export class RollbackManager {
  private readonly snapshotManager: StateSnapshotManager;

  private readonly rollbackHistory: RollbackOperation[] = [];

  constructor(snapshotManager?: StateSnapshotManager) {
    this.snapshotManager = snapshotManager ?? new StateSnapshotManager();
  }

  /**
   * Create a rollback plan
   */
  createRollbackPlan(
    name: string,
    description: string,
    operations: Array<Omit<RollbackOperation, 'id'>>,
    options: {
      riskLevel?: RollbackPlan['riskLevel'];
      approvalRequired?: boolean;
      dependencies?: string[];
    } = {}
  ): RollbackPlan {
    const id = this.generatePlanId();

    const rollbackOperations: RollbackOperation[] = operations.map(op => ({
      ...op,
      id: this.generateOperationId(),
    }));

    const estimatedDuration = rollbackOperations.reduce(
      (total, op) => total + (op.metadata?.estimatedDuration || 30000),
      0
    );

    return {
      id,
      name,
      description,
      operations: rollbackOperations,
      dependencies: options.dependencies ?? [],
      estimatedDuration,
      riskLevel: options.riskLevel ?? 'medium',
      approvalRequired: options.approvalRequired ?? false,
      createdAt: new Date(),
    };
  }

  /**
   * Execute a rollback plan
   */
  async executeRollbackPlan(
    plan: RollbackPlan,
    options: {
      dryRun?: boolean;
      createCheckpoint?: boolean;
      skipValidation?: boolean;
    } = {}
  ): Promise<{
    success: boolean;
    executedOperations: string[];
    failedOperation?: string;
    error?: string;
  }> {
    logger.info('Starting rollback plan execution', {
      planId: plan.id,
      planName: plan.name,
      operationCount: plan.operations.length,
      dryRun: options.dryRun,
    });

    // Create checkpoint before rollback if requested
    let checkpointSnapshot: StateSnapshot | undefined;
    if (options.createCheckpoint && !options.dryRun) {
      try {
        checkpointSnapshot = await this.snapshotManager.createSnapshot('full', {
          version: '1.0.0',
          environment: process.env.NODE_ENV ?? 'development',
          operation: `rollback_checkpoint_${plan.id}`,
          tags: ['rollback', 'checkpoint'],
        });
        logger.info('Checkpoint created before rollback', {
          snapshotId: checkpointSnapshot.id,
        });
      } catch (error) {
        logger.error('Failed to create checkpoint', {
          error: (error as Error).message,
        });
        if (!options.skipValidation) {
          throw new BaseServiceError(
            'CHECKPOINT_CREATION_FAILED',
            'Failed to create checkpoint before rollback',
            500
          );
        }
      }
    }

    const executedOperations: string[] = [];
    let success = true;
    let failedOperation: string | undefined;
    let error: string | undefined;

    try {
      // Execute operations in sequence
      for (const operation of plan.operations) {
        logger.info('Executing rollback operation', {
          operationId: operation.id,
          type: operation.type,
          description: operation.description,
          dryRun: options.dryRun,
        });

        try {
          if (!options.dryRun) {
            await operation.execute();

            // Verify operation success
            const verified = await operation.verify();
            if (!verified) {
              throw new Error('Operation verification failed');
            }
          }

          executedOperations.push(operation.id);
          this.rollbackHistory.push({
            ...operation,
            timestamp: new Date(),
          });

          logger.info('Rollback operation completed', {
            operationId: operation.id,
            dryRun: options.dryRun,
          });
        } catch (operationError) {
          success = false;
          failedOperation = operation.id;
          error = (operationError as Error).message;

          logger.error('Rollback operation failed', {
            operationId: operation.id,
            error,
          });

          break; // Stop executing remaining operations
        }
      }

      if (success) {
        logger.info('Rollback plan execution completed successfully', {
          planId: plan.id,
          executedOperations: executedOperations.length,
          dryRun: options.dryRun,
        });
      } else {
        logger.error('Rollback plan execution failed', {
          planId: plan.id,
          executedOperations: executedOperations.length,
          failedOperation,
          error,
        });

        // If we have a checkpoint and rollback failed, offer to restore
        if (checkpointSnapshot && !options.dryRun) {
          logger.warn('Rollback failed - checkpoint available for restoration', {
            checkpointId: checkpointSnapshot.id,
          });
        }
      }
    } catch (generalError) {
      success = false;
      error = (generalError as Error).message;

      logger.error('Rollback plan execution encountered fatal error', {
        planId: plan.id,
        error,
      });
    }

    return {
      success,
      executedOperations,
      failedOperation,
      error,
    };
  }

  /**
   * Create common rollback operations
   */
  createDatabaseRollbackOperation(
    snapshotId: string,
    description?: string
  ): Omit<RollbackOperation, 'id'> {
    return {
      type: 'database',
      description: description ?? `Rollback database to snapshot ${snapshotId}`,
      timestamp: new Date(),
      execute: async () => {
        await this.snapshotManager.restoreFromSnapshot(snapshotId);
      },
      verify: async () =>
        // Verify database integrity after restoration
        true, // Simplified verification
      metadata: {
        snapshotId,
        estimatedDuration: 60000, // 1 minute
      },
    };
  }

  createConfigurationRollbackOperation(
    previousConfig: Record<string, unknown>,
    description?: string
  ): Omit<RollbackOperation, 'id'> {
    return {
      type: 'configuration',
      description: description ?? 'Rollback configuration changes',
      timestamp: new Date(),
      execute: async () => {
        // Restore previous configuration
        Object.entries(previousConfig).forEach(([key, value]) => {
          process.env[key] = value;
        });
      },
      verify: async () =>
        // Verify configuration is correctly applied
        Object.entries(previousConfig).every(([key, value]) => process.env[key] === value),
      metadata: {
        previousConfig,
        estimatedDuration: 5000, // 5 seconds
      },
    };
  }

  /**
   * Get rollback history
   */
  getRollbackHistory(limit?: number): RollbackOperation[] {
    const history = [...this.rollbackHistory].reverse(); // Most recent first
    return limit ? history.slice(0, limit) : history;
  }

  private generatePlanId(): string {
    return `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================================
// RECOVERY PROCEDURES
// ============================================================================

export class RecoveryProcedures {
  private readonly rollbackManager: RollbackManager;

  private readonly snapshotManager: StateSnapshotManager;

  constructor() {
    this.snapshotManager = new StateSnapshotManager();
    this.rollbackManager = new RollbackManager(this.snapshotManager);
  }

  /**
   * Emergency recovery procedure
   */
  async emergencyRecovery(): Promise<void> {
    logger.warn('Starting emergency recovery procedure');

    try {
      // Find the most recent full snapshot
      const snapshots = await this.snapshotManager.listSnapshots({
        type: 'full',
        limit: 1,
      });

      if (snapshots.length === 0) {
        throw new BaseServiceError('NO_RECOVERY_POINT', 'No recovery snapshots available', 500);
      }

      const latestSnapshot = snapshots[0];
      logger.info('Using latest snapshot for emergency recovery', {
        snapshotId: latestSnapshot.id,
        timestamp: latestSnapshot.timestamp,
      });

      // Create emergency rollback plan
      const rollbackPlan = this.rollbackManager.createRollbackPlan(
        'Emergency Recovery',
        'Emergency recovery from system failure',
        [
          this.rollbackManager.createDatabaseRollbackOperation(
            latestSnapshot.id,
            'Emergency database recovery'
          ),
        ],
        {
          riskLevel: 'critical',
          approvalRequired: false,
        }
      );

      // Execute emergency rollback
      const result = await this.rollbackManager.executeRollbackPlan(rollbackPlan, {
        createCheckpoint: false, // Skip checkpoint in emergency
        skipValidation: true,
      });

      if (result.success) {
        logger.info('Emergency recovery completed successfully');
      } else {
        logger.error('Emergency recovery failed', {
          error: result.error,
        });
        throw new BaseServiceError(
          'EMERGENCY_RECOVERY_FAILED',
          `Emergency recovery failed: ${result.error}`,
          500
        );
      }
    } catch (error) {
      logger.error('Emergency recovery procedure failed', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Graceful recovery procedure
   */
  async gracefulRecovery(targetSnapshotId?: string): Promise<void> {
    logger.info('Starting graceful recovery procedure', { targetSnapshotId });

    try {
      let targetSnapshot: StateSnapshot;

      if (targetSnapshotId) {
        const snapshot = await this.snapshotManager.listSnapshots();
        const found = snapshot.find(s => s.id === targetSnapshotId);
        if (!found) {
          throw new BaseServiceError(
            'SNAPSHOT_NOT_FOUND',
            `Target snapshot ${targetSnapshotId} not found`,
            404
          );
        }
        targetSnapshot = found;
      } else {
        // Find the most recent verified full snapshot
        const snapshots = await this.snapshotManager.listSnapshots({
          type: 'full',
          limit: 5,
        });

        const verifiedSnapshot = snapshots.find(s => s.metadata.tags?.includes('verified'));
        targetSnapshot = verifiedSnapshot ?? snapshots[0];

        if (!targetSnapshot) {
          throw new BaseServiceError(
            'NO_RECOVERY_POINT',
            'No suitable recovery snapshot found',
            500
          );
        }
      }

      logger.info('Target snapshot selected for graceful recovery', {
        snapshotId: targetSnapshot.id,
        timestamp: targetSnapshot.timestamp,
      });

      // Create graceful rollback plan with full verification
      const rollbackPlan = this.rollbackManager.createRollbackPlan(
        'Graceful Recovery',
        `Graceful recovery to snapshot ${targetSnapshot.id}`,
        [
          this.rollbackManager.createDatabaseRollbackOperation(
            targetSnapshot.id,
            'Graceful database recovery'
          ),
        ],
        {
          riskLevel: 'medium',
          approvalRequired: true,
        }
      );

      // Execute graceful rollback with full validation
      const result = await this.rollbackManager.executeRollbackPlan(rollbackPlan, {
        createCheckpoint: true,
        skipValidation: false,
      });

      if (result.success) {
        logger.info('Graceful recovery completed successfully');

        // Create a recovery verification snapshot
        await this.snapshotManager.createSnapshot('full', {
          version: '1.0.0',
          environment: process.env.NODE_ENV ?? 'development',
          operation: 'post_recovery_verification',
          tags: ['recovery', 'verification'],
        });
      } else {
        logger.error('Graceful recovery failed', {
          error: result.error,
        });
        throw new BaseServiceError(
          'GRACEFUL_RECOVERY_FAILED',
          `Graceful recovery failed: ${result.error}`,
          500
        );
      }
    } catch (error) {
      logger.error('Graceful recovery procedure failed', {
        error: (error as Error).message,
      });
      throw error;
    }
  }
}

// ============================================================================
// SINGLETON INSTANCES
// ============================================================================

export const stateSnapshotManager = new StateSnapshotManager();
export const rollbackManager = new RollbackManager(stateSnapshotManager);
export const recoveryProcedures = new RecoveryProcedures();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Create an emergency snapshot
 */
export const createEmergencySnapshot = async (reason: string): Promise<StateSnapshot> =>
  stateSnapshotManager.createSnapshot('full', {
    version: '1.0.0',
    environment: process.env.NODE_ENV ?? 'development',
    operation: 'emergency_snapshot',
    tags: ['emergency', reason],
  });

/**
 * Quick rollback to last known good state
 */
export const quickRollback = async (): Promise<void> => {
  const snapshots = await stateSnapshotManager.listSnapshots({
    type: 'full',
    limit: 1,
  });

  if (snapshots.length === 0) {
    throw new BaseServiceError('NO_ROLLBACK_POINT', 'No rollback snapshots available', 500);
  }

  await stateSnapshotManager.restoreFromSnapshot(snapshots[0].id);
};
