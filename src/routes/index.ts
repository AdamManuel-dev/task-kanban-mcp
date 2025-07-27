import { Router } from 'express';
import { taskRoutes } from './tasks';
import { boardRoutes } from './boards';
import { noteRoutes } from './notes';
import { tagRoutes } from './tags';
import { contextRoutes } from './context';
import { healthRoutes } from './health';
import backupRoutes from './backup';
import scheduleRoutes from './schedule';
import exportRoutes from './export';

export async function apiRoutes() {
  const router = Router();

  // Health and status routes
  router.use('/', await healthRoutes());

  // Core API routes
  router.use('/tasks', await taskRoutes());
  router.use('/boards', await boardRoutes());
  router.use('/notes', await noteRoutes());
  router.use('/tags', await tagRoutes());
  router.use('/context', await contextRoutes());
  router.use('/backup', backupRoutes);
  router.use('/schedule', scheduleRoutes);
  router.use('/', exportRoutes); // Export/import routes at root level

  return router;
}

export * from './tasks';
export * from './boards';
export * from './notes';
export * from './tags';
export * from './context';
export * from './health';
