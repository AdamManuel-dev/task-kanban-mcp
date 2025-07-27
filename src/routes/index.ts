import { Router } from 'express';
import { healthRoutes } from './health';
import { boardRoutes } from './boards';
import { taskRoutes } from './tasks';
import { noteRoutes } from './notes';
import { tagRoutes } from './tags';
import backupRoutes from './backup';
import exportRoutes from './export';
import scheduleRoutes from './schedule';
import { contextRoutes } from './context';

// Import new route modules
import analyticsRoutes from './analytics';
import performanceRoutes from './performance';

const router = Router();

// Health check (no versioning needed)
router.use('/health', healthRoutes());

// API v1 routes
router.use('/v1/boards', boardRoutes());
router.use('/v1/tasks', taskRoutes());
router.use('/v1/notes', noteRoutes());
router.use('/v1/tags', tagRoutes());
router.use('/v1/backup', backupRoutes);
router.use('/v1/export', exportRoutes);
router.use('/v1/schedule', scheduleRoutes);
router.use('/v1/context', contextRoutes());

// New feature routes
router.use('/v1/analytics', analyticsRoutes);
router.use('/v1/performance', performanceRoutes);

export default router;
