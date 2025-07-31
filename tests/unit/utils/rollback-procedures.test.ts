/**
 * @fileoverview Tests for rollback procedures utilities
 */

import fs from 'fs/promises';
import path from 'path';
import {
  StateSnapshotManager,
  RollbackManager,
  RecoveryProcedures,
  createEmergencySnapshot,
  quickRollback,
} from '../../../src/utils/rollback-procedures';
import type { StateSnapshot, RollbackPlan } from '../../../src/utils/rollback-procedures';

// Mock fs/promises
jest.mock('fs/promises');
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('StateSnapshotManager', () => {
  let snapshotManager: StateSnapshotManager;

  beforeEach(() => {
    jest.clearAllMocks();
    snapshotManager = new StateSnapshotManager();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([]);
    mockFs.stat.mockResolvedValue({ size: 1024 } as any);
  });

  describe('createSnapshot', () => {
    it('should create database snapshot', async () => {
      const metadata = {
        version: '1.0.0',
        environment: 'test',
        operation: 'backup',
      };

      const snapshot = await snapshotManager.createSnapshot('database', metadata);

      expect(snapshot).toMatchObject({
        type: 'database',
        metadata,
        size: 1024,
      });
      expect(snapshot.id).toBeDefined();
      expect(snapshot.timestamp).toBeInstanceOf(Date);
      expect(snapshot.checksum).toBeDefined();
      expect(snapshot.dataPath).toBeDefined();
    });

    it('should create configuration snapshot', async () => {
      const metadata = {
        version: '1.0.0',
        environment: 'test',
        operation: 'config_backup',
      };

      const snapshot = await snapshotManager.createSnapshot('configuration', metadata);

      expect(snapshot.type).toBe('configuration');
      expect(snapshot.metadata).toEqual(metadata);
    });

    it('should create application snapshot', async () => {
      const metadata = {
        version: '1.0.0',
        environment: 'test',
        operation: 'app_backup',
      };

      const snapshot = await snapshotManager.createSnapshot('application', metadata);

      expect(snapshot.type).toBe('application');
      expect(snapshot.metadata).toEqual(metadata);
    });

    it('should create full snapshot', async () => {
      const metadata = {
        version: '1.0.0',
        environment: 'test',
        operation: 'full_backup',
      };

      const snapshot = await snapshotManager.createSnapshot('full', metadata);

      expect(snapshot.type).toBe('full');
      expect(snapshot.metadata).toEqual(metadata);
    });

    it('should handle invalid snapshot type', async () => {
      const metadata = {
        version: '1.0.0',
        environment: 'test',
        operation: 'backup',
      };

      await expect(snapshotManager.createSnapshot('invalid' as any, metadata)).rejects.toThrow(
        'Unsupported snapshot type: invalid'
      );
    });

    it('should handle snapshot creation errors', async () => {
      mockFs.mkdir.mockRejectedValue(new Error('Permission denied'));

      const metadata = {
        version: '1.0.0',
        environment: 'test',
        operation: 'backup',
      };

      await expect(snapshotManager.createSnapshot('database', metadata)).rejects.toThrow(
        'Failed to create database snapshot'
      );
    });
  });

  describe('restoreFromSnapshot', () => {
    beforeEach(() => {
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          id: 'test-snapshot',
          timestamp: new Date().toISOString(),
          type: 'database',
          checksum: 'test-checksum',
          size: 1024,
          metadata: { version: '1.0.0', environment: 'test' },
          dataPath: '/path/to/snapshot',
        })
      );
    });

    it('should restore from snapshot successfully', async () => {
      // Mock snapshot integrity verification
      mockFs.readFile.mockResolvedValueOnce(
        JSON.stringify({
          id: 'test-snapshot',
          timestamp: new Date().toISOString(),
          type: 'database',
          checksum: 'test-checksum',
          size: 1024,
          metadata: { version: '1.0.0', environment: 'test' },
          dataPath: '/path/to/snapshot',
        })
      );

      // Mock snapshot data for integrity check
      mockFs.readFile.mockResolvedValueOnce('snapshot data');

      await expect(snapshotManager.restoreFromSnapshot('test-snapshot')).resolves.not.toThrow();
    });

    it('should handle non-existent snapshot', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      await expect(snapshotManager.restoreFromSnapshot('non-existent')).rejects.toThrow(
        'Snapshot non-existent not found'
      );
    });

    it('should handle corrupted snapshot', async () => {
      // Mock snapshot metadata
      mockFs.readFile.mockResolvedValueOnce(
        JSON.stringify({
          id: 'test-snapshot',
          timestamp: new Date().toISOString(),
          type: 'database',
          checksum: 'expected-checksum',
          size: 1024,
          metadata: { version: '1.0.0', environment: 'test' },
          dataPath: '/path/to/snapshot',
        })
      );

      // Mock different data that won't match checksum
      mockFs.readFile.mockResolvedValueOnce('different data');

      await expect(snapshotManager.restoreFromSnapshot('test-snapshot')).rejects.toThrow(
        'Snapshot integrity check failed'
      );
    });
  });

  describe('listSnapshots', () => {
    beforeEach(() => {
      const snapshots = [
        {
          id: 'snapshot-1',
          timestamp: '2023-01-01T00:00:00Z',
          type: 'database',
          checksum: 'checksum1',
          size: 1024,
          metadata: { version: '1.0.0', environment: 'test' },
          dataPath: '/path/1',
        },
        {
          id: 'snapshot-2',
          timestamp: '2023-01-02T00:00:00Z',
          type: 'configuration',
          checksum: 'checksum2',
          size: 2048,
          metadata: { version: '1.0.1', environment: 'test' },
          dataPath: '/path/2',
        },
      ];

      mockFs.readdir.mockResolvedValue(['snapshot-1.json', 'snapshot-2.json'] as any);
      mockFs.readFile.mockImplementation(async (filePath: string) => {
        if (filePath.includes('snapshot-1.json')) {
          return Promise.resolve(JSON.stringify(snapshots[0]));
        }
        if (filePath.includes('snapshot-2.json')) {
          return Promise.resolve(JSON.stringify(snapshots[1]));
        }
        return Promise.reject(new Error('File not found'));
      });
    });

    it('should list all snapshots', async () => {
      const snapshots = await snapshotManager.listSnapshots();

      expect(snapshots).toHaveLength(2);
      expect(snapshots[0].id).toBe('snapshot-2'); // Newer first
      expect(snapshots[1].id).toBe('snapshot-1');
    });

    it('should filter snapshots by type', async () => {
      const snapshots = await snapshotManager.listSnapshots({ type: 'database' });

      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].type).toBe('database');
    });

    it('should filter snapshots by date', async () => {
      const since = new Date('2023-01-01T12:00:00Z');
      const snapshots = await snapshotManager.listSnapshots({ since });

      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].id).toBe('snapshot-2');
    });

    it('should apply limit', async () => {
      const snapshots = await snapshotManager.listSnapshots({ limit: 1 });

      expect(snapshots).toHaveLength(1);
    });

    it('should handle read errors gracefully', async () => {
      mockFs.readdir.mockRejectedValue(new Error('Permission denied'));

      const snapshots = await snapshotManager.listSnapshots();

      expect(snapshots).toHaveLength(0);
    });
  });

  describe('deleteSnapshot', () => {
    beforeEach(() => {
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          id: 'test-snapshot',
          timestamp: new Date().toISOString(),
          type: 'database',
          checksum: 'test-checksum',
          size: 1024,
          metadata: { version: '1.0.0', environment: 'test' },
          dataPath: '/path/to/snapshot',
        })
      );
      mockFs.rm.mockResolvedValue(undefined);
    });

    it('should delete snapshot successfully', async () => {
      await expect(snapshotManager.deleteSnapshot('test-snapshot')).resolves.not.toThrow();

      expect(mockFs.rm).toHaveBeenCalledTimes(2); // Data and metadata
    });

    it('should handle non-existent snapshot', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      await expect(snapshotManager.deleteSnapshot('non-existent')).rejects.toThrow(
        'Snapshot non-existent not found'
      );
    });

    it('should handle deletion errors', async () => {
      mockFs.rm.mockRejectedValue(new Error('Permission denied'));

      await expect(snapshotManager.deleteSnapshot('test-snapshot')).rejects.toThrow(
        'Failed to delete snapshot'
      );
    });
  });
});

describe('RollbackManager', () => {
  let rollbackManager: RollbackManager;
  let mockSnapshotManager: jest.Mocked<StateSnapshotManager>;

  beforeEach(() => {
    mockSnapshotManager = {
      createSnapshot: jest.fn(),
      restoreFromSnapshot: jest.fn(),
      listSnapshots: jest.fn(),
      deleteSnapshot: jest.fn(),
    } as any;

    rollbackManager = new RollbackManager(mockSnapshotManager);
  });

  describe('createRollbackPlan', () => {
    it('should create rollback plan with operations', () => {
      const operations = [
        {
          type: 'database' as const,
          description: 'Restore database',
          timestamp: new Date(),
          execute: jest.fn(),
          verify: jest.fn(),
        },
      ];

      const plan = rollbackManager.createRollbackPlan(
        'Test Plan',
        'Test rollback plan',
        operations
      );

      expect(plan).toMatchObject({
        name: 'Test Plan',
        description: 'Test rollback plan',
        riskLevel: 'medium',
        approvalRequired: false,
      });
      expect(plan.operations).toHaveLength(1);
      expect(plan.operations[0].id).toBeDefined();
      expect(plan.id).toBeDefined();
      expect(plan.createdAt).toBeInstanceOf(Date);
    });

    it('should create rollback plan with custom options', () => {
      const operations = [
        {
          type: 'database' as const,
          description: 'Emergency restore',
          timestamp: new Date(),
          execute: jest.fn(),
          verify: jest.fn(),
        },
      ];

      const plan = rollbackManager.createRollbackPlan(
        'Emergency Plan',
        'Emergency rollback',
        operations,
        {
          riskLevel: 'critical',
          approvalRequired: true,
          dependencies: ['service-1', 'service-2'],
        }
      );

      expect(plan.riskLevel).toBe('critical');
      expect(plan.approvalRequired).toBe(true);
      expect(plan.dependencies).toEqual(['service-1', 'service-2']);
    });
  });

  describe('executeRollbackPlan', () => {
    let mockOperation: () => Promise<unknown>;
    let plan: RollbackPlan;

    beforeEach(() => {
      mockOperation = {
        id: 'op-1',
        type: 'database',
        description: 'Test operation',
        timestamp: new Date(),
        execute: jest.fn().mockResolvedValue(undefined),
        verify: jest.fn().mockResolvedValue(true),
      };

      plan = {
        id: 'plan-1',
        name: 'Test Plan',
        description: 'Test plan',
        operations: [mockOperation],
        dependencies: [],
        estimatedDuration: 30000,
        riskLevel: 'medium',
        approvalRequired: false,
        createdAt: new Date(),
      };
    });

    it('should execute rollback plan successfully', async () => {
      const result = await rollbackManager.executeRollbackPlan(plan);

      expect(result.success).toBe(true);
      expect(result.executedOperations).toEqual(['op-1']);
      expect(mockOperation.execute).toHaveBeenCalled();
      expect(mockOperation.verify).toHaveBeenCalled();
    });

    it('should handle operation execution failure', async () => {
      mockOperation.execute.mockRejectedValue(new Error('Execution failed'));

      const result = await rollbackManager.executeRollbackPlan(plan);

      expect(result.success).toBe(false);
      expect(result.failedOperation).toBe('op-1');
      expect(result.error).toBe('Execution failed');
    });

    it('should handle operation verification failure', async () => {
      mockOperation.verify.mockResolvedValue(false);

      const result = await rollbackManager.executeRollbackPlan(plan);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Operation verification failed');
    });

    it('should perform dry run without executing operations', async () => {
      const result = await rollbackManager.executeRollbackPlan(plan, { dryRun: true });

      expect(result.success).toBe(true);
      expect(mockOperation.execute).not.toHaveBeenCalled();
      expect(mockOperation.verify).not.toHaveBeenCalled();
    });

    it('should create checkpoint when requested', async () => {
      mockSnapshotManager.createSnapshot.mockResolvedValue({
        id: 'checkpoint-1',
        timestamp: new Date(),
        type: 'full',
        checksum: 'checksum',
        size: 1024,
        metadata: { version: '1.0.0', environment: 'test' },
        dataPath: '/path',
      });

      const result = await rollbackManager.executeRollbackPlan(plan, {
        createCheckpoint: true,
      });

      expect(result.success).toBe(true);
      expect(mockSnapshotManager.createSnapshot).toHaveBeenCalledWith(
        'full',
        expect.objectContaining({
          operation: 'rollback_checkpoint_plan-1',
        })
      );
    });

    it('should handle checkpoint creation failure', async () => {
      mockSnapshotManager.createSnapshot.mockRejectedValue(new Error('Checkpoint failed'));

      await expect(
        rollbackManager.executeRollbackPlan(plan, { createCheckpoint: true })
      ).rejects.toThrow('Failed to create checkpoint before rollback');
    });

    it('should skip validation when requested', async () => {
      mockSnapshotManager.createSnapshot.mockRejectedValue(new Error('Checkpoint failed'));

      const result = await rollbackManager.executeRollbackPlan(plan, {
        createCheckpoint: true,
        skipValidation: true,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('createDatabaseRollbackOperation', () => {
    it('should create database rollback operation', () => {
      const operation = rollbackManager.createDatabaseRollbackOperation('snapshot-1');

      expect(operation.type).toBe('database');
      expect(operation.description).toContain('snapshot-1');
      expect(operation.metadata?.snapshotId).toBe('snapshot-1');
      expect(typeof operation.execute).toBe('function');
      expect(typeof operation.verify).toBe('function');
    });

    it('should execute database rollback operation', async () => {
      const operation = rollbackManager.createDatabaseRollbackOperation('snapshot-1');

      await expect(operation.execute()).resolves.not.toThrow();
      expect(mockSnapshotManager.restoreFromSnapshot).toHaveBeenCalledWith('snapshot-1');
    });
  });

  describe('createConfigurationRollbackOperation', () => {
    it('should create configuration rollback operation', () => {
      const previousConfig = { LOG_LEVEL: 'debug', NODE_ENV: 'production' };
      const operation = rollbackManager.createConfigurationRollbackOperation(previousConfig);

      expect(operation.type).toBe('configuration');
      expect(operation.metadata?.previousConfig).toEqual(previousConfig);
    });

    it('should execute configuration rollback operation', async () => {
      const previousConfig = { LOG_LEVEL: 'debug', NODE_ENV: 'production' };
      const operation = rollbackManager.createConfigurationRollbackOperation(previousConfig);

      await operation.execute();

      expect(process.env.LOG_LEVEL).toBe('debug');
      expect(process.env.NODE_ENV).toBe('production');
    });

    it('should verify configuration rollback operation', async () => {
      const previousConfig = { LOG_LEVEL: 'debug' };
      const operation = rollbackManager.createConfigurationRollbackOperation(previousConfig);

      await operation.execute();
      const verified = await operation.verify();

      expect(verified).toBe(true);
    });
  });

  describe('getRollbackHistory', () => {
    it('should return rollback history', () => {
      const history = rollbackManager.getRollbackHistory();
      expect(Array.isArray(history)).toBe(true);
    });

    it('should apply limit to history', () => {
      const history = rollbackManager.getRollbackHistory(5);
      expect(history.length).toBeLessThanOrEqual(5);
    });
  });
});

describe('RecoveryProcedures', () => {
  let recoveryProcedures: RecoveryProcedures;

  beforeEach(() => {
    recoveryProcedures = new RecoveryProcedures();
  });

  describe('emergencyRecovery', () => {
    it('should perform emergency recovery with available snapshot', async () => {
      const mockSnapshot = {
        id: 'emergency-snapshot',
        timestamp: new Date(),
        type: 'full' as const,
        checksum: 'checksum',
        size: 1024,
        metadata: { version: '1.0.0', environment: 'test' },
        dataPath: '/path',
      };

      jest
        .spyOn(recoveryProcedures.snapshotManager, 'listSnapshots')
        .mockResolvedValue([mockSnapshot]);

      jest.spyOn(recoveryProcedures.rollbackManager, 'executeRollbackPlan').mockResolvedValue({
        success: true,
        executedOperations: ['op-1'],
      });

      await expect(recoveryProcedures.emergencyRecovery()).resolves.not.toThrow();
    });

    it('should handle no recovery snapshots available', async () => {
      jest.spyOn(recoveryProcedures.snapshotManager, 'listSnapshots').mockResolvedValue([]);

      await expect(recoveryProcedures.emergencyRecovery()).rejects.toThrow(
        'No recovery snapshots available'
      );
    });

    it('should handle emergency recovery failure', async () => {
      const mockSnapshot = {
        id: 'emergency-snapshot',
        timestamp: new Date(),
        type: 'full' as const,
        checksum: 'checksum',
        size: 1024,
        metadata: { version: '1.0.0', environment: 'test' },
        dataPath: '/path',
      };

      jest
        .spyOn(recoveryProcedures.snapshotManager, 'listSnapshots')
        .mockResolvedValue([mockSnapshot]);

      jest.spyOn(recoveryProcedures.rollbackManager, 'executeRollbackPlan').mockResolvedValue({
        success: false,
        executedOperations: [],
        error: 'Recovery failed',
      });

      await expect(recoveryProcedures.emergencyRecovery()).rejects.toThrow(
        'Emergency recovery failed: Recovery failed'
      );
    });
  });

  describe('gracefulRecovery', () => {
    it('should perform graceful recovery with specific snapshot', async () => {
      const mockSnapshot = {
        id: 'target-snapshot',
        timestamp: new Date(),
        type: 'full' as const,
        checksum: 'checksum',
        size: 1024,
        metadata: { version: '1.0.0', environment: 'test' },
        dataPath: '/path',
      };

      jest
        .spyOn(recoveryProcedures.snapshotManager, 'listSnapshots')
        .mockResolvedValue([mockSnapshot]);

      jest.spyOn(recoveryProcedures.rollbackManager, 'executeRollbackPlan').mockResolvedValue({
        success: true,
        executedOperations: ['op-1'],
      });

      jest
        .spyOn(recoveryProcedures.snapshotManager, 'createSnapshot')
        .mockResolvedValue(mockSnapshot);

      await expect(recoveryProcedures.gracefulRecovery('target-snapshot')).resolves.not.toThrow();
    });

    it('should handle target snapshot not found', async () => {
      jest.spyOn(recoveryProcedures.snapshotManager, 'listSnapshots').mockResolvedValue([]);

      await expect(recoveryProcedures.gracefulRecovery('non-existent')).rejects.toThrow(
        'Target snapshot non-existent not found'
      );
    });

    it('should use most recent verified snapshot when no target specified', async () => {
      const mockSnapshots = [
        {
          id: 'recent-snapshot',
          timestamp: new Date('2023-01-02'),
          type: 'full' as const,
          checksum: 'checksum2',
          size: 2048,
          metadata: { version: '1.0.1', environment: 'test', tags: ['verified'] },
          dataPath: '/path2',
        },
        {
          id: 'older-snapshot',
          timestamp: new Date('2023-01-01'),
          type: 'full' as const,
          checksum: 'checksum1',
          size: 1024,
          metadata: { version: '1.0.0', environment: 'test' },
          dataPath: '/path1',
        },
      ];

      jest
        .spyOn(recoveryProcedures.snapshotManager, 'listSnapshots')
        .mockResolvedValue(mockSnapshots);

      jest.spyOn(recoveryProcedures.rollbackManager, 'executeRollbackPlan').mockResolvedValue({
        success: true,
        executedOperations: ['op-1'],
      });

      jest
        .spyOn(recoveryProcedures.snapshotManager, 'createSnapshot')
        .mockResolvedValue(mockSnapshots[0]);

      await expect(recoveryProcedures.gracefulRecovery()).resolves.not.toThrow();
    });
  });
});

describe('Convenience functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createEmergencySnapshot', () => {
    it('should create emergency snapshot', async () => {
      const mockSnapshot = {
        id: 'emergency-1',
        timestamp: new Date(),
        type: 'full' as const,
        checksum: 'checksum',
        size: 1024,
        metadata: { version: '1.0.0', environment: 'test', tags: ['emergency', 'system-failure'] },
        dataPath: '/path',
      };

      const { stateSnapshotManager } = require('../../../src/utils/rollback-procedures');
      jest.spyOn(stateSnapshotManager, 'createSnapshot').mockResolvedValue(mockSnapshot);

      const snapshot = await createEmergencySnapshot('system-failure');

      expect(snapshot).toEqual(mockSnapshot);
      expect(stateSnapshotManager.createSnapshot).toHaveBeenCalledWith(
        'full',
        expect.objectContaining({
          operation: 'emergency_snapshot',
          tags: ['emergency', 'system-failure'],
        })
      );
    });
  });

  describe('quickRollback', () => {
    it('should perform quick rollback to latest snapshot', async () => {
      const mockSnapshot = {
        id: 'latest-snapshot',
        timestamp: new Date(),
        type: 'full' as const,
        checksum: 'checksum',
        size: 1024,
        metadata: { version: '1.0.0', environment: 'test' },
        dataPath: '/path',
      };

      const { stateSnapshotManager } = require('../../../src/utils/rollback-procedures');
      jest.spyOn(stateSnapshotManager, 'listSnapshots').mockResolvedValue([mockSnapshot]);
      jest.spyOn(stateSnapshotManager, 'restoreFromSnapshot').mockResolvedValue(undefined);

      await expect(quickRollback()).resolves.not.toThrow();

      expect(stateSnapshotManager.restoreFromSnapshot).toHaveBeenCalledWith('latest-snapshot');
    });

    it('should handle no snapshots available', async () => {
      const { stateSnapshotManager } = require('../../../src/utils/rollback-procedures');
      jest.spyOn(stateSnapshotManager, 'listSnapshots').mockResolvedValue([]);

      await expect(quickRollback()).rejects.toThrow('No rollback snapshots available');
    });
  });
});
