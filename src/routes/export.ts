import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { ExportService } from '@/services/ExportService';
import { requirePermission } from '@/middleware/auth';
import { validateInput } from '@/utils/validation';
import { z } from 'zod';
// import multer from 'multer';
import { dbConnection } from '@/database/connection';

const router = Router();
// const upload = multer({ dest: '/tmp/uploads/' });

// Validation schemas
const ExportSchema = z.object({
  format: z.enum(['json', 'csv']),
  includeBoards: z.boolean().optional(),
  includeTasks: z.boolean().optional(),
  includeTags: z.boolean().optional(),
  includeNotes: z.boolean().optional(),
  boardIds: z.array(z.string().uuid()).optional(),
  taskStatuses: z.array(z.string()).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  anonymize: z.boolean().optional(),
  anonymizationOptions: z
    .object({
      anonymizeUserData: z.boolean().optional(),
      anonymizeTaskTitles: z.boolean().optional(),
      anonymizeDescriptions: z.boolean().optional(),
      anonymizeNotes: z.boolean().optional(),
      preserveStructure: z.boolean().optional(),
      hashSeed: z.string().optional(),
    })
    .optional(),
});

// const _ImportSchema = z.object({
//   format: z.enum(['json', 'csv']),
//   merge: z.boolean().optional(),
//   overwrite: z.boolean().optional(),
//   validateOnly: z.boolean().optional(),
//   conflictResolution: z.enum(['skip', 'overwrite', 'rename']).optional()
// });

// GET /api/v1/export - Export data
router.get(
  '/export',
  requirePermission('read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = validateInput(ExportSchema, req.query);

      const db = dbConnection;
      const exportService = new ExportService(db);

      // Build options object omitting undefined values
      const options: any = {
        format: validated.format,
      };

      if (validated.includeBoards !== undefined) options.includeBoards = validated.includeBoards;
      if (validated.includeTasks !== undefined) options.includeTasks = validated.includeTasks;
      if (validated.includeTags !== undefined) options.includeTags = validated.includeTags;
      if (validated.includeNotes !== undefined) options.includeNotes = validated.includeNotes;
      if (validated.boardIds !== undefined) options.boardIds = validated.boardIds;
      if (validated.taskStatuses !== undefined) options.taskStatuses = validated.taskStatuses;
      if (validated.dateFrom !== undefined) options.dateFrom = new Date(validated.dateFrom);
      if (validated.dateTo !== undefined) options.dateTo = new Date(validated.dateTo);

      if (options.format === 'json') {
        const result = await exportService.exportToJSON(options);
        return res.apiSuccess(result);
      }
      // For CSV, we need to handle file output differently
      const filePath = `/tmp/kanban-export-${String(Date.now())}.csv`;
      options.outputPath = filePath;
      await exportService.exportToCSV(options);

      // Send file as download
      return res.download(filePath, 'kanban-export.csv', err => {
        if (err) {
          return next(err);
        }
        // Clean up temp file
        require('fs').unlinkSync(filePath);
      });
    } catch (error) {
      return next(error);
    }
  }
);

// POST /api/v1/import - Import data
// Note: This endpoint requires multer middleware which is not installed
router.post(
  '/import',
  requirePermission('write'),
  (_req: Request, res: Response, next: NextFunction) => {
    try {
      return res
        .status(501)
        .apiError('Import functionality requires multer middleware', 'NOT_IMPLEMENTED');
    } catch (error) {
      return next(error);
    }
  }
);

// POST /api/v1/import/validate - Validate import data
router.post(
  '/import/validate',
  requirePermission('read'),
  (_req: Request, res: Response, next: NextFunction) => {
    try {
      return res
        .status(501)
        .apiError('Import validation requires multer middleware', 'NOT_IMPLEMENTED');
    } catch (error) {
      return next(error);
    }
  }
);

// POST /api/v1/export/convert - Convert between export formats
router.post(
  '/convert',
  requirePermission('write'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ConvertSchema = z.object({
        inputPath: z.string(),
        outputFormat: z.enum(['json', 'csv', 'markdown', 'html']),
        outputPath: z.string(),
      });

      const validated = validateInput(ConvertSchema, req.body);

      const db = dbConnection;
      const exportService = new ExportService(db);

      await exportService.convertFormat(
        validated.inputPath,
        validated.outputFormat,
        validated.outputPath
      );

      return res.apiSuccess({
        message: 'Format conversion completed successfully',
        outputPath: validated.outputPath,
        format: validated.outputFormat,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// GET /api/v1/export/anonymized - Export with anonymization
router.get(
  '/anonymized',
  requirePermission('read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = validateInput(ExportSchema, req.query);

      const db = dbConnection;
      const exportService = new ExportService(db);

      // Force anonymization
      const options: any = {
        ...validated,
        anonymize: true,
        anonymizationOptions: validated.anonymizationOptions ?? {
          anonymizeUserData: true,
          anonymizeTaskTitles: true,
          anonymizeDescriptions: true,
          anonymizeNotes: true,
          preserveStructure: false,
        },
      };

      const result = await (options.format === 'json'
        ? exportService.exportToJSON(options)
        : exportService.exportToCSV(options));

      return res.apiSuccess(result);
    } catch (error) {
      return next(error);
    }
  }
);

export default router;
