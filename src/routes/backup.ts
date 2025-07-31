/**
 * Backup Routes - REST API endpoints for backup management
 *
 * @module routes/backup
 * @description Provides REST API endpoints for database backup and restore operations,
 * including full and incremental backups, verification, scheduling, and metadata management.
 */

import { Router } from 'express';
import { BackupService, type BackupMetadata } from '@/services/BackupService';
import { dbConnection } from '@/database/connection';
import { authenticateApiKey } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validation';
import { formatSuccessResponse, formatErrorResponse } from '@/middleware/response';
import { asyncHandler } from '@/middleware/asyncHandler';
import { logger } from '@/utils/logger';
import { z } from 'zod';

const router = Router();
const backupService = new BackupService(dbConnection);

// Validation schemas
const CreateBackupSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  type: z.enum(['full', 'incremental']).optional().default('full'),
  compress: z.boolean().optional().default(true),
  verify: z.boolean().optional().default(true),
  parentBackupId: z.string().uuid().optional(),
});

const RestoreBackupSchema = z.object({
  verify: z.boolean().optional().default(true),
  pointInTime: z.string().datetime().optional(),
  preserveExisting: z.boolean().optional().default(false),
});

const ListBackupsSchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
  type: z.enum(['full', 'incremental']).optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed', 'corrupted']).optional(),
});

const ValidateRestoreSchema = z.object({
  verify: z.boolean().optional().default(true),
  pointInTime: z.string().datetime().optional(),
  preserveExisting: z.boolean().optional().default(false),
});

const PartialRestoreSchema = z.object({
  tables: z.array(z.string()).min(1),
  includeSchema: z.boolean().optional().default(false),
  preserveExisting: z.boolean().optional().default(false),
  validateAfter: z.boolean().optional().default(true),
  verify: z.boolean().optional().default(true),
  pointInTime: z.string().datetime().optional(),
});

const RestoreWithProgressSchema = z.object({
  verify: z.boolean().optional().default(true),
  pointInTime: z.string().datetime().optional(),
  preserveExisting: z.boolean().optional().default(false),
});

// Apply authentication to all backup routes
router.use(authenticateApiKey);

/**
 * @openapi
 * /api/backup/create:
 *   post:
 *     summary: Create a new backup
 *     description: Creates a full or incremental backup of the database
 *     tags: [Backup]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateBackupRequest'
 *     responses:
 *       201:
 *         description: Backup created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/BackupMetadata'
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Backup creation failed
 */
router.post('/create', validateRequest(CreateBackupSchema), (req, res) => {
  void (async () => {
    try {
      const options = req.body as z.infer<typeof CreateBackupSchema>;

      let backup;
      if (options.type === 'incremental') {
        if (!options.parentBackupId) {
          res
            .status(400)
            .json(formatErrorResponse('Parent backup ID is required for incremental backups'));
        }
        backup = await backupService.createIncrementalBackup(options);
      } else {
        backup = await backupService.createFullBackup(options);
      }

      logger.info(`Backup created via API: ${String((backup as { id: string }).id)}`);
      res.status(201).json(formatSuccessResponse(backup));
    } catch (error) {
      logger.error('Backup creation failed:', error);
      res
        .status(500)
        .json(
          formatErrorResponse(
            'Backup creation failed',
            error instanceof Error ? error.message : 'Unknown error'
          )
        );
    }
  })();
});

/**
 * @openapi
 * /api/backup/list:
 *   get:
 *     summary: List all backups
 *     description: Retrieves a list of all backups with optional filtering
 *     tags: [Backup]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [full, incremental]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, in_progress, completed, failed, corrupted]
 *     responses:
 *       200:
 *         description: Backups retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/BackupMetadata'
 */
router.get('/list', validateRequest(ListBackupsSchema), (req, res) => {
  void (async () => {
    try {
      const options = req.query as {
        limit?: string;
        offset?: string;
        type?: string;
        status?: string;
      };
      const listOptions: {
        limit?: number;
        offset?: number;
        type?: 'full' | 'incremental';
        status?: string;
      } = {};

      if (options.limit) listOptions.limit = parseInt(options.limit, 10);
      if (options.offset) listOptions.offset = parseInt(options.offset, 10);
      if (options.type) listOptions.type = options.type as 'full' | 'incremental';
      if (options.status) listOptions.status = options.status;

      const backups = await backupService.listBackups(listOptions);

      res.json(formatSuccessResponse(backups));
    } catch (error) {
      logger.error('Failed to list backups:', error);
      res
        .status(500)
        .json(
          formatErrorResponse(
            'Failed to list backups',
            error instanceof Error ? error.message : 'Unknown error'
          )
        );
    }
  })();
});

/**
 * @openapi
 * /api/backup/{id}:
 *   get:
 *     summary: Get backup details
 *     description: Retrieves detailed information about a specific backup
 *     tags: [Backup]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Backup details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/BackupMetadata'
 *       404:
 *         description: Backup not found
 */
router.get(
  '/:id',
  asyncHandler(async (req, res): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json(formatErrorResponse('Backup ID is required'));
        return;
      }
      const backup = await backupService.getBackupMetadata(id);

      if (!backup) {
        res.status(404).json(formatErrorResponse('Backup not found'));
        return;
      }

      res.json(formatSuccessResponse(backup));
    } catch (error) {
      logger.error(`Failed to get backup ${String(String(req.params.id))}:`, error);
      res
        .status(500)
        .json(
          formatErrorResponse(
            'Failed to get backup',
            error instanceof Error ? error.message : 'Unknown error'
          )
        );
    }
  })
);

/**
 * @openapi
 * /api/backup/{id}/restore:
 *   post:
 *     summary: Restore from backup
 *     description: Restores the database from a specific backup
 *     tags: [Backup]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               verify:
 *                 type: boolean
 *                 default: true
 *               pointInTime:
 *                 type: string
 *                 format: date-time
 *               preserveExisting:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Database restored successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid restore options
 *       404:
 *         description: Backup not found
 *       500:
 *         description: Restore failed
 */
router.post(
  '/:id/restore',
  validateRequest(RestoreBackupSchema),
  asyncHandler(async (req, res): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json(formatErrorResponse('Backup ID is required'));
        return;
      }
      const options = req.body;

      await backupService.restoreFromBackup(id, options);

      logger.info(`Database restored from backup: ${String(id)}`);
      res.json(formatSuccessResponse(null, 'Database restored successfully'));
    } catch (error) {
      logger.error(`Restore failed for backup ${String(String(req.params.id))}:`, error);
      res
        .status(500)
        .json(
          formatErrorResponse(
            'Restore failed',
            error instanceof Error ? error.message : 'Unknown error'
          )
        );
    }
  })
);

/**
 * @openapi
 * /api/backup/restore-to-time:
 *   post:
 *     summary: Restore database to specific point in time
 *     description: Restores the database to a specific point in time using available backups
 *     tags: [Backup]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetTime]
 *             properties:
 *               targetTime:
 *                 type: string
 *                 format: date-time
 *                 description: ISO timestamp to restore to
 *               verify:
 *                 type: boolean
 *                 default: true
 *                 description: Verify backups before restoration
 *               preserveExisting:
 *                 type: boolean
 *                 default: false
 *                 description: Create backup of current state before restoration
 *     responses:
 *       200:
 *         description: Point-in-time restoration completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     restoredTo:
 *                       type: string
 *                       format: date-time
 *                     backupsApplied:
 *                       type: integer
 *       400:
 *         description: Invalid target time or no suitable backups found
 *       500:
 *         description: Point-in-time restoration failed
 */
router.post(
  '/restore-to-time',
  asyncHandler(async (req, res): Promise<void> => {
    try {
      const { targetTime, verify = true, preserveExisting = false } = req.body;

      if (!targetTime) {
        res.status(400).json(formatErrorResponse('Target time is required'));
        return;
      }

      // Validate target time format
      const targetDate = new Date(targetTime);
      if (isNaN(targetDate.getTime())) {
        res
          .status(400)
          .json(
            formatErrorResponse(
              'Invalid target time format. Use ISO format (e.g., 2025-07-26T10:30:00Z)'
            )
          );
      }

      logger.info(`Point-in-time restoration requested to: ${String(targetTime)}`);

      // Get the most recent backup to restore from
      const backups = await backupService.listBackups({ limit: 1 });
      const latestBackup = backups[0];

      if (!latestBackup) {
        res.status(404).json(formatErrorResponse('No backups available for restoration'));
        return;
      }

      await backupService.restoreToPointInTime(latestBackup.id, targetTime, {
        verify,
        preserveExisting,
      });

      logger.info(`Point-in-time restoration completed to: ${String(targetTime)}`);
      res.json(
        formatSuccessResponse({
          restoredTo: targetTime,
          message: 'Point-in-time restoration completed successfully',
        })
      );
    } catch (error) {
      logger.error('Point-in-time restoration failed:', error);
      res
        .status(500)
        .json(
          formatErrorResponse(
            'Point-in-time restoration failed',
            error instanceof Error ? error.message : 'Unknown error'
          )
        );
    }
  })
);

/**
 * @openapi
 * /api/backup/{id}/verify:
 *   post:
 *     summary: Verify backup integrity
 *     description: Verifies the integrity of a backup file
 *     tags: [Backup]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Backup verification result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     valid:
 *                       type: boolean
 *                     message:
 *                       type: string
 *       404:
 *         description: Backup not found
 */
router.post(
  '/:id/verify',
  asyncHandler(async (req, res): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json(formatErrorResponse('Backup ID is required'));
        return;
      }
      const isValid = await backupService.verifyBackup(id);

      res.json(
        formatSuccessResponse({
          valid: isValid,
          message: isValid ? 'Backup verification passed' : 'Backup verification failed',
        })
      );
    } catch (error) {
      logger.error(`Backup verification failed for ${String(String(req.params.id))}:`, error);
      res
        .status(500)
        .json(
          formatErrorResponse(
            'Backup verification failed',
            error instanceof Error ? error.message : 'Unknown error'
          )
        );
    }
  })
);

/**
 * @openapi
 * /api/backup/{id}/export:
 *   get:
 *     summary: Export backup data
 *     description: Exports backup data in various formats
 *     tags: [Backup]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, sql, csv]
 *           default: json
 *     responses:
 *       200:
 *         description: Backup exported successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *           application/sql:
 *             schema:
 *               type: string
 *           text/csv:
 *             schema:
 *               type: string
 *       404:
 *         description: Backup not found
 */
router.get(
  '/:id/export',
  asyncHandler(async (req, res): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json(formatErrorResponse('Backup ID is required'));
        return;
      }
      const format = (req.query.format as string) || 'json';

      const backup = await backupService.getBackupMetadata(id);
      if (!backup) {
        res.status(404).json(formatErrorResponse('Backup not found'));
        return;
      }

      // For now, return backup metadata in requested format
      // In a full implementation, you'd export the actual backup content
      switch (format) {
        case 'json':
          res.setHeader('Content-Type', 'application/json');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="${String((backup as BackupMetadata).name)}.json"`
          );
          res.json(backup);
          break;
        case 'sql':
          res.setHeader('Content-Type', 'application/sql');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="${String((backup as BackupMetadata).name)}.sql"`
          );
          res.send(
            `-- Backup metadata for ${String((backup as BackupMetadata).name)}\n-- ID: ${String((backup as BackupMetadata).id)}\n-- Created: ${String((backup as BackupMetadata).createdAt)}`
          );
          break;
        case 'csv':
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="${String((backup as BackupMetadata).name)}.csv"`
          );
          res.send(
            `id,name,type,status,size,created_at\n${String((backup as BackupMetadata).id)},${String((backup as BackupMetadata).name)},${String((backup as BackupMetadata).type)},${String((backup as BackupMetadata).status)},${String((backup as BackupMetadata).size)},${String((backup as BackupMetadata).createdAt)}`
          );
          break;
        default:
          res.status(400).json(formatErrorResponse('Unsupported export format'));
      }
    } catch (error) {
      logger.error(`Backup export failed for ${String(String(req.params.id))}:`, error);
      res
        .status(500)
        .json(
          formatErrorResponse(
            'Backup export failed',
            error instanceof Error ? error.message : 'Unknown error'
          )
        );
    }
  })
);

/**
 * @openapi
 * /api/backup/{id}:
 *   delete:
 *     summary: Delete backup
 *     description: Deletes a backup and its associated files
 *     tags: [Backup]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Backup deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: Backup not found
 *       500:
 *         description: Delete failed
 */
router.delete(
  '/:id',
  asyncHandler(async (req, res): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json(formatErrorResponse('Backup ID is required'));
        return;
      }
      await backupService.deleteBackup(id);

      logger.info(`Backup deleted via API: ${String(id)}`);
      res.json(formatSuccessResponse(null, 'Backup deleted successfully'));
    } catch (error) {
      logger.error(`Failed to delete backup ${String(String(req.params.id))}:`, error);
      res
        .status(500)
        .json(
          formatErrorResponse(
            'Failed to delete backup',
            error instanceof Error ? error.message : 'Unknown error'
          )
        );
    }
  })
);

/**
 * @openapi
 * /api/backup/{id}/validate:
 *   post:
 *     summary: Validate restore options
 *     description: Validates restore options and backup compatibility before restoration
 *     tags: [Backup]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               verify:
 *                 type: boolean
 *                 default: true
 *               pointInTime:
 *                 type: string
 *                 format: date-time
 *               preserveExisting:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Validation completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     isValid:
 *                       type: boolean
 *                     tableChecks:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           tableName:
 *                             type: string
 *                           rowCount:
 *                             type: integer
 *                           isValid:
 *                             type: boolean
 *                           message:
 *                             type: string
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *       404:
 *         description: Backup not found
 *       500:
 *         description: Validation failed
 */
router.post(
  '/:id/validate',
  validateRequest(ValidateRestoreSchema),
  asyncHandler(async (req, res): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json(formatErrorResponse('Backup ID is required'));
        return;
      }
      const options = req.body;

      const validation = await backupService.validateRestoreOptions(id, options);

      logger.info(`Restore validation completed for backup: ${id}`, {
        isValid: validation.isValid,
      });
      res.json(formatSuccessResponse(validation, 'Validation completed'));
    } catch (error) {
      logger.error(`Restore validation failed for backup ${req.params.id}:`, error);
      res
        .status(500)
        .json(
          formatErrorResponse(
            'Validation failed',
            error instanceof Error ? error.message : 'Unknown error'
          )
        );
    }
  })
);

/**
 * @openapi
 * /api/backup/integrity-check:
 *   post:
 *     summary: Perform data integrity check
 *     description: Performs comprehensive data integrity checks on the database
 *     tags: [Backup]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Integrity check completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     isPassed:
 *                       type: boolean
 *                     checks:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           passed:
 *                             type: boolean
 *                           message:
 *                             type: string
 *       500:
 *         description: Integrity check failed
 */
router.post(
  '/integrity-check',
  asyncHandler(async (req, res): Promise<void> => {
    try {
      const integrityCheck = await backupService.performDataIntegrityCheck();

      logger.info('Data integrity check completed', {
        passed: integrityCheck.isPassed,
      });
      res.json(formatSuccessResponse(integrityCheck, 'Integrity check completed'));
    } catch (error) {
      logger.error('Data integrity check failed:', error);
      res
        .status(500)
        .json(
          formatErrorResponse(
            'Integrity check failed',
            error instanceof Error ? error.message : 'Unknown error'
          )
        );
    }
  })
);

/**
 * @openapi
 * /api/backup/{id}/restore-partial:
 *   post:
 *     summary: Restore specific tables from backup
 *     description: Restores specific tables from a backup while preserving other data
 *     tags: [Backup]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tables
 *             properties:
 *               tables:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: List of table names to restore
 *               includeSchema:
 *                 type: boolean
 *                 default: false
 *               preserveExisting:
 *                 type: boolean
 *                 default: false
 *               validateAfter:
 *                 type: boolean
 *                 default: true
 *               verify:
 *                 type: boolean
 *                 default: true
 *               pointInTime:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Partial restore completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid restore options
 *       404:
 *         description: Backup not found
 *       500:
 *         description: Partial restore failed
 */
router.post(
  '/:id/restore-partial',
  validateRequest(PartialRestoreSchema),
  asyncHandler(async (req, res): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json(formatErrorResponse('Backup ID is required'));
        return;
      }
      const options = req.body;

      await backupService.restorePartialData(id, options);

      logger.info(`Partial restore completed for backup: ${id}`, { tables: options.tables });
      res.json(formatSuccessResponse(null, 'Partial restore completed successfully'));
    } catch (error) {
      logger.error(`Partial restore failed for backup ${req.params.id}:`, error);
      res
        .status(500)
        .json(
          formatErrorResponse(
            'Partial restore failed',
            error instanceof Error ? error.message : 'Unknown error'
          )
        );
    }
  })
);

/**
 * @openapi
 * /api/backup/{id}/restore-with-progress:
 *   post:
 *     summary: Restore with progress tracking
 *     description: Restores from backup with progress tracking and returns a progress ID
 *     tags: [Backup]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               verify:
 *                 type: boolean
 *                 default: true
 *               pointInTime:
 *                 type: string
 *                 format: date-time
 *               preserveExisting:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Restore started with progress tracking
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     progressId:
 *                       type: string
 *                       format: uuid
 *       400:
 *         description: Invalid restore options
 *       404:
 *         description: Backup not found
 *       500:
 *         description: Restore failed
 */
router.post(
  '/:id/restore-with-progress',
  validateRequest(RestoreWithProgressSchema),
  asyncHandler(async (req, res): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json(formatErrorResponse('Backup ID is required'));
        return;
      }
      const options = req.body;

      const progressId = await backupService.restoreFromBackupWithProgress(id, options);

      logger.info(`Restore with progress started for backup: ${id}`, { progressId });
      res.json(formatSuccessResponse({ progressId }, 'Restore started with progress tracking'));
    } catch (error) {
      logger.error(`Restore with progress failed for backup ${req.params.id}:`, error);
      res
        .status(500)
        .json(
          formatErrorResponse(
            'Restore failed',
            error instanceof Error ? error.message : 'Unknown error'
          )
        );
    }
  })
);

/**
 * @openapi
 * /api/backup/progress/{progressId}:
 *   get:
 *     summary: Get restore progress
 *     description: Gets the current progress of a restore operation
 *     tags: [Backup]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: progressId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Progress information retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     totalSteps:
 *                       type: integer
 *                     currentStep:
 *                       type: integer
 *                     progress:
 *                       type: integer
 *                       minimum: 0
 *                       maximum: 100
 *                     message:
 *                       type: string
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: Progress not found
 *       500:
 *         description: Failed to get progress
 */
router.get(
  '/progress/:progressId',
  asyncHandler(async (req, res): Promise<void> => {
    try {
      const { progressId } = req.params;
      if (!progressId) {
        res.status(400).json(formatErrorResponse('Progress ID is required'));
        return;
      }

      const progress = await backupService.getRestoreProgress(progressId);
      if (!progress) {
        res.status(404).json(formatErrorResponse('Progress not found'));
        return;
      }

      res.json(formatSuccessResponse(progress, 'Progress retrieved'));
    } catch (error) {
      logger.error(`Failed to get progress ${req.params.progressId}:`, error);
      res
        .status(500)
        .json(
          formatErrorResponse(
            'Failed to get progress',
            error instanceof Error ? error.message : 'Unknown error'
          )
        );
    }
  })
);

/**
 * @openapi
 * /api/backup/progress/{progressId}:
 *   delete:
 *     summary: Clear restore progress
 *     description: Clears the progress tracking for a restore operation
 *     tags: [Backup]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: progressId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Progress cleared successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       500:
 *         description: Failed to clear progress
 */
router.delete(
  '/progress/:progressId',
  asyncHandler(async (req, res): Promise<void> => {
    try {
      const { progressId } = req.params;
      if (!progressId) {
        res.status(400).json(formatErrorResponse('Progress ID is required'));
        return;
      }

      await backupService.clearRestoreProgress(progressId);

      logger.info(`Progress cleared: ${progressId}`);
      res.json(formatSuccessResponse(null, 'Progress cleared successfully'));
    } catch (error) {
      logger.error(`Failed to clear progress ${req.params.progressId}:`, error);
      res
        .status(500)
        .json(
          formatErrorResponse(
            'Failed to clear progress',
            error instanceof Error ? error.message : 'Unknown error'
          )
        );
    }
  })
);

export default router;
