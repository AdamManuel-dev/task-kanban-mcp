/**
 * Schedule Routes - REST API endpoints for backup scheduling management
 *
 * @module routes/schedule
 * @description Provides REST API endpoints for managing backup schedules, including
 * creating, updating, deleting, and executing scheduled backups.
 */

import { Router } from 'express';
import { SchedulingService } from '@/services/SchedulingService';
import { BackupService } from '@/services/BackupService';
import { dbConnection } from '@/database/connection';
import { authenticateApiKey } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validation';
import { formatSuccessResponse, formatErrorResponse } from '@/middleware/response';
import { logger } from '@/utils/logger';
import { z } from 'zod';

const router = Router();

// Lazy initialization of services
let backupService: BackupService;
let schedulingService: SchedulingService;

function getServices() {
  if (!backupService) {
    backupService = new BackupService(dbConnection);
  }
  if (!schedulingService) {
    schedulingService = new SchedulingService(dbConnection, backupService);
  }
  return { backupService, schedulingService };
}

// Validation schemas
const CreateScheduleSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  cronExpression: z
    .string()
    .regex(
      /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/,
      'Invalid cron expression'
    ),
  backupType: z.enum(['full', 'incremental']),
  enabled: z.boolean().optional().default(true),
  retentionDays: z.number().min(1).max(365).optional().default(30),
  compressionEnabled: z.boolean().optional().default(true),
  verificationEnabled: z.boolean().optional().default(true),
});

const UpdateScheduleSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  cronExpression: z
    .string()
    .regex(
      /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/,
      'Invalid cron expression'
    )
    .optional(),
  backupType: z.enum(['full', 'incremental']).optional(),
  enabled: z.boolean().optional(),
  retentionDays: z.number().min(1).max(365).optional(),
  compressionEnabled: z.boolean().optional(),
  verificationEnabled: z.boolean().optional(),
});

const ListSchedulesSchema = z.object({
  enabled: z.coerce.boolean().optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
});

// Apply authentication to all schedule routes
router.use(authenticateApiKey);

/**
 * @openapi
 * /api/schedule/create:
 *   post:
 *     summary: Create a new backup schedule
 *     description: Creates a new automated backup schedule with cron expression
 *     tags: [Schedule]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, cronExpression, backupType]
 *             properties:
 *               name:
 *                 type: string
 *                 description: Schedule name (must be unique)
 *               description:
 *                 type: string
 *                 description: Schedule description
 *               cronExpression:
 *                 type: string
 *                 description: Cron expression for scheduling (e.g., "0 2 * * *" for daily at 2 AM)
 *               backupType:
 *                 type: string
 *                 enum: [full, incremental]
 *               enabled:
 *                 type: boolean
 *                 default: true
 *               retentionDays:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 365
 *                 default: 30
 *               compressionEnabled:
 *                 type: boolean
 *                 default: true
 *               verificationEnabled:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Schedule created successfully
 *       400:
 *         description: Invalid request data
 *       500:
 *         description: Schedule creation failed
 */
router.post('/create', validateRequest(CreateScheduleSchema), async (req, res) => {
  try {
    const { schedulingService } = getServices();
    const schedule = await schedulingService.createSchedule(req.body);

    logger.info(`Backup schedule created via API: ${String(String(schedule.id))}`);
    return res.status(201).json(formatSuccessResponse(schedule));
  } catch (error) {
    logger.error('Schedule creation failed:', error);
    return res
      .status(500)
      .json(
        formatErrorResponse(
          'Schedule creation failed',
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
  }
});

/**
 * @openapi
 * /api/schedule/list:
 *   get:
 *     summary: List all backup schedules
 *     description: Retrieves a list of backup schedules with optional filtering
 *     tags: [Schedule]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: enabled
 *         schema:
 *           type: boolean
 *         description: Filter by enabled status
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
 *     responses:
 *       200:
 *         description: Schedules retrieved successfully
 */
router.get('/list', validateRequest(ListSchedulesSchema), async (req, res) => {
  try {
    const options = req.query as any;
    const { schedulingService } = getServices();
    const schedules = await schedulingService.getSchedules(options);

    return res.json(formatSuccessResponse(schedules));
  } catch (error) {
    logger.error('Failed to list schedules:', error);
    return res
      .status(500)
      .json(
        formatErrorResponse(
          'Failed to list schedules',
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
  }
});

/**
 * @openapi
 * /api/schedule/{id}:
 *   get:
 *     summary: Get schedule details
 *     description: Retrieves detailed information about a specific schedule
 *     tags: [Schedule]
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
 *         description: Schedule details retrieved successfully
 *       404:
 *         description: Schedule not found
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json(formatErrorResponse('Schedule ID is required'));
    }
    const { schedulingService } = getServices();
    const schedule = await schedulingService.getScheduleById(id);

    if (!schedule) {
      return res.status(404).json(formatErrorResponse('Schedule not found'));
    }

    return res.json(formatSuccessResponse(schedule));
  } catch (error) {
    logger.error(`Failed to get schedule ${String(String(req.params.id))}:`, error);
    return res
      .status(500)
      .json(
        formatErrorResponse(
          'Failed to get schedule',
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
  }
});

/**
 * @openapi
 * /api/schedule/{id}:
 *   put:
 *     summary: Update backup schedule
 *     description: Updates an existing backup schedule
 *     tags: [Schedule]
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
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               cronExpression:
 *                 type: string
 *               backupType:
 *                 type: string
 *                 enum: [full, incremental]
 *               enabled:
 *                 type: boolean
 *               retentionDays:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 365
 *               compressionEnabled:
 *                 type: boolean
 *               verificationEnabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Schedule updated successfully
 *       404:
 *         description: Schedule not found
 *       500:
 *         description: Update failed
 */
router.put('/:id', validateRequest(UpdateScheduleSchema), async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json(formatErrorResponse('Schedule ID is required'));
    }
    const { schedulingService } = getServices();
    const schedule = await schedulingService.updateSchedule(id, req.body);

    logger.info(`Schedule updated via API: ${String(id)}`);
    return res.json(formatSuccessResponse(schedule));
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json(formatErrorResponse('Schedule not found'));
    }

    logger.error(`Schedule update failed for ${String(String(req.params['id']))}:`, error);
    return res
      .status(500)
      .json(
        formatErrorResponse(
          'Schedule update failed',
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
  }
});

/**
 * @openapi
 * /api/schedule/{id}/execute:
 *   post:
 *     summary: Execute backup schedule manually
 *     description: Triggers a manual execution of a backup schedule
 *     tags: [Schedule]
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
 *         description: Schedule executed successfully
 *       404:
 *         description: Schedule not found
 *       500:
 *         description: Execution failed
 */
router.post('/:id/execute', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json(formatErrorResponse('Schedule ID is required'));
    }
    const { schedulingService } = getServices();
    await schedulingService.executeSchedule(id);

    logger.info(`Schedule executed manually via API: ${String(id)}`);
    return res.json(formatSuccessResponse(null, 'Schedule executed successfully'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json(formatErrorResponse('Schedule not found'));
    }

    logger.error(`Schedule execution failed for ${String(String(req.params.id))}:`, error);
    return res
      .status(500)
      .json(
        formatErrorResponse(
          'Schedule execution failed',
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
  }
});

/**
 * @openapi
 * /api/schedule/{id}:
 *   delete:
 *     summary: Delete backup schedule
 *     description: Deletes a backup schedule and stops any running jobs
 *     tags: [Schedule]
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
 *         description: Schedule deleted successfully
 *       404:
 *         description: Schedule not found
 *       500:
 *         description: Delete failed
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json(formatErrorResponse('Schedule ID is required'));
    }
    const { schedulingService } = getServices();
    await schedulingService.deleteSchedule(id);

    logger.info(`Schedule deleted via API: ${String(id)}`);
    return res.json(formatSuccessResponse(null, 'Schedule deleted successfully'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json(formatErrorResponse('Schedule not found'));
    }

    logger.error(`Failed to delete schedule ${String(String(req.params.id))}:`, error);
    return res
      .status(500)
      .json(
        formatErrorResponse(
          'Failed to delete schedule',
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
  }
});

/**
 * @openapi
 * /api/schedule/cleanup:
 *   post:
 *     summary: Clean up old backups
 *     description: Manually trigger cleanup of old backups based on retention policies
 *     tags: [Schedule]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Cleanup completed successfully
 *       500:
 *         description: Cleanup failed
 */
router.post('/cleanup', async (_req, res) => {
  try {
    const { schedulingService } = getServices();
    await schedulingService.cleanupOldBackups();

    logger.info('Manual backup cleanup executed via API');
    return res.json(formatSuccessResponse(null, 'Backup cleanup completed successfully'));
  } catch (error) {
    logger.error('Backup cleanup failed:', error);
    return res
      .status(500)
      .json(
        formatErrorResponse(
          'Backup cleanup failed',
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
  }
});

/**
 * @openapi
 * /api/schedule/start:
 *   post:
 *     summary: Start the backup scheduler
 *     description: Starts the backup scheduler and all enabled schedules
 *     tags: [Schedule]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Scheduler started successfully
 *       500:
 *         description: Failed to start scheduler
 */
router.post('/start', (_req, res) => {
  try {
    const { schedulingService } = getServices();
    schedulingService.start();

    logger.info('Backup scheduler started via API');
    return res.json(formatSuccessResponse(null, 'Backup scheduler started successfully'));
  } catch (error) {
    logger.error('Failed to start scheduler:', error);
    return res
      .status(500)
      .json(
        formatErrorResponse(
          'Failed to start scheduler',
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
  }
});

/**
 * @openapi
 * /api/schedule/stop:
 *   post:
 *     summary: Stop the backup scheduler
 *     description: Stops the backup scheduler and all running scheduled jobs
 *     tags: [Schedule]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Scheduler stopped successfully
 *       500:
 *         description: Failed to stop scheduler
 */
router.post('/stop', (_req, res) => {
  try {
    const { schedulingService } = getServices();
    schedulingService.stop();

    logger.info('Backup scheduler stopped via API');
    return res.json(formatSuccessResponse(null, 'Backup scheduler stopped successfully'));
  } catch (error) {
    logger.error('Failed to stop scheduler:', error);
    return res
      .status(500)
      .json(
        formatErrorResponse(
          'Failed to stop scheduler',
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
  }
});

export default router;
