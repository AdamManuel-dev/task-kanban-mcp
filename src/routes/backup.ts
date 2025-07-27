/**
 * Backup Routes - REST API endpoints for backup management
 *
 * @module routes/backup
 * @description Provides REST API endpoints for database backup and restore operations,
 * including full and incremental backups, verification, scheduling, and metadata management.
 */

import { Router } from 'express';
import { BackupService } from '@/services/BackupService';
import { dbConnection } from '@/database/connection';
import { authenticateApiKey } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validation';
import { formatSuccessResponse, formatErrorResponse } from '@/middleware/response';
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
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Custom backup name
 *               description:
 *                 type: string
 *                 description: Backup description
 *               type:
 *                 type: string
 *                 enum: [full, incremental]
 *                 default: full
 *               compress:
 *                 type: boolean
 *                 default: true
 *               verify:
 *                 type: boolean
 *                 default: true
 *               parentBackupId:
 *                 type: string
 *                 format: uuid
 *                 description: Required for incremental backups
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
router.post('/create', validateRequest(CreateBackupSchema), async (req, res) => {
  try {
    const options = req.body;

    let backup;
    if (options.type === 'incremental') {
      if (!options.parentBackupId) {
        return res
          .status(400)
          .json(formatErrorResponse('Parent backup ID is required for incremental backups'));
      }
      backup = await backupService.createIncrementalBackup(options);
    } else {
      backup = await backupService.createFullBackup(options);
    }

    logger.info(`Backup created via API: ${backup.id}`);
    return res.status(201).json(formatSuccessResponse(backup));
  } catch (error) {
    logger.error('Backup creation failed:', error);
    return res
      .status(500)
      .json(
        formatErrorResponse(
          'Backup creation failed',
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
  }
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
router.get('/list', validateRequest(ListBackupsSchema, 'query'), async (req, res) => {
  try {
    const options = req.query as any;
    const backups = await backupService.listBackups(options);

    return res.json(formatSuccessResponse(backups));
  } catch (error) {
    logger.error('Failed to list backups:', error);
    return res
      .status(500)
      .json(
        formatErrorResponse(
          'Failed to list backups',
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
  }
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
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json(formatErrorResponse('Backup ID is required'));
    }
    const backup = await backupService.getBackupMetadata(id);

    if (!backup) {
      return res.status(404).json(formatErrorResponse('Backup not found'));
    }

    return res.json(formatSuccessResponse(backup));
  } catch (error) {
    logger.error(`Failed to get backup ${req.params.id}:`, error);
    return res
      .status(500)
      .json(
        formatErrorResponse(
          'Failed to get backup',
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
  }
});

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
router.post('/:id/restore', validateRequest(RestoreBackupSchema), async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json(formatErrorResponse('Backup ID is required'));
    }
    const options = req.body;

    await backupService.restoreFromBackup(id, options);

    logger.info(`Database restored from backup: ${id}`);
    return res.json(formatSuccessResponse(null, 'Database restored successfully'));
  } catch (error) {
    logger.error(`Restore failed for backup ${req.params.id}:`, error);
    return res
      .status(500)
      .json(
        formatErrorResponse(
          'Restore failed',
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
  }
});

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
router.post('/restore-to-time', async (req, res) => {
  try {
    const { targetTime, verify = true, preserveExisting = false } = req.body;

    if (!targetTime) {
      return res.status(400).json(formatErrorResponse('Target time is required'));
    }

    // Validate target time format
    const targetDate = new Date(targetTime);
    if (isNaN(targetDate.getTime())) {
      return res
        .status(400)
        .json(
          formatErrorResponse(
            'Invalid target time format. Use ISO format (e.g., 2025-07-26T10:30:00Z)'
          )
        );
    }

    logger.info(`Point-in-time restoration requested to: ${targetTime}`);

    await backupService.restoreToPointInTime(targetTime, {
      verify,
      preserveExisting,
    });

    logger.info(`Point-in-time restoration completed to: ${targetTime}`);
    return res.json(
      formatSuccessResponse({
        restoredTo: targetTime,
        message: 'Point-in-time restoration completed successfully',
      })
    );
  } catch (error) {
    logger.error('Point-in-time restoration failed:', error);
    return res
      .status(500)
      .json(
        formatErrorResponse(
          'Point-in-time restoration failed',
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
  }
});

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
router.post('/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json(formatErrorResponse('Backup ID is required'));
    }
    const isValid = await backupService.verifyBackup(id);

    return res.json(
      formatSuccessResponse({
        valid: isValid,
        message: isValid ? 'Backup verification passed' : 'Backup verification failed',
      })
    );
  } catch (error) {
    logger.error(`Backup verification failed for ${req.params.id}:`, error);
    return res
      .status(500)
      .json(
        formatErrorResponse(
          'Backup verification failed',
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
  }
});

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
router.get('/:id/export', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json(formatErrorResponse('Backup ID is required'));
    }
    const format = (req.query['format'] as string) || 'json';

    const backup = await backupService.getBackupMetadata(id);
    if (!backup) {
      return res.status(404).json(formatErrorResponse('Backup not found'));
    }

    // For now, return backup metadata in requested format
    // In a full implementation, you'd export the actual backup content
    switch (format) {
      case 'json':
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${backup.name}.json"`);
        return res.json(backup);
        break;
      case 'sql':
        res.setHeader('Content-Type', 'application/sql');
        res.setHeader('Content-Disposition', `attachment; filename="${backup.name}.sql"`);
        return res.send(
          `-- Backup metadata for ${backup.name}\n-- ID: ${backup.id}\n-- Created: ${backup.createdAt}`
        );
        break;
      case 'csv':
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${backup.name}.csv"`);
        return res.send(
          `id,name,type,status,size,created_at\n${backup.id},${backup.name},${backup.type},${backup.status},${backup.size},${backup.createdAt}`
        );
        break;
      default:
        return res.status(400).json(formatErrorResponse('Unsupported export format'));
    }
  } catch (error) {
    logger.error(`Backup export failed for ${req.params.id}:`, error);
    return res
      .status(500)
      .json(
        formatErrorResponse(
          'Backup export failed',
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
  }
});

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
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json(formatErrorResponse('Backup ID is required'));
    }
    await backupService.deleteBackup(id);

    logger.info(`Backup deleted via API: ${id}`);
    return res.json(formatSuccessResponse(null, 'Backup deleted successfully'));
  } catch (error) {
    logger.error(`Failed to delete backup ${req.params.id}:`, error);
    return res
      .status(500)
      .json(
        formatErrorResponse(
          'Failed to delete backup',
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
  }
});

export default router;
