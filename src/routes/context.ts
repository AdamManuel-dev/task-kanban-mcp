import { Router } from 'express';
import { ContextService } from '@/services/ContextService';
import { BoardService } from '@/services/BoardService';
import { TaskService } from '@/services/TaskService';
import { NoteService } from '@/services/NoteService';
import { TagService } from '@/services/TagService';
import { dbConnection } from '@/database/connection';
import { requirePermission } from '@/middleware/auth';
// import { validateInput } from '@/utils/validation'; // Unused
import { NotFoundError } from '@/utils/errors';

export async function contextRoutes(): Promise<Router> {
  const router = Router();

  const boardService = new BoardService(dbConnection);
  const taskService = new TaskService(dbConnection);
  const noteService = new NoteService(dbConnection);
  const tagService = new TagService(dbConnection);
  const contextService = new ContextService(
    dbConnection,
    boardService,
    taskService,
    noteService,
    tagService
  );

  // GET /api/v1/context/projects/:id - Generate project context
  router.get('/projects/:id', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;
      const { includeCompletedTasks = false, maxTasks = 100 } = req.query;

      const options = {
        include_completed: includeCompletedTasks === 'true',
        days_back: 30,
        max_items: parseInt(maxTasks as string, 10),
        include_metrics: true,
        detail_level: 'detailed' as const,
      };

      const context = await contextService.getProjectContext(options);

      if (!context) {
        throw new NotFoundError('Project', id ?? 'unknown');
      }

      return res.apiSuccess(context);
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/context/tasks/:id - Generate task context
  router.get('/tasks/:id', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;
      const { maxRelatedTasks = 10 } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'Task ID is required' });
      }

      const options = {
        include_completed: true,
        days_back: 30,
        max_items: parseInt(maxRelatedTasks as string, 10),
        include_metrics: true,
        detail_level: 'detailed' as const,
      };

      const context = await contextService.getTaskContext(id, options);

      if (!context) {
        throw new NotFoundError('Task', id);
      }

      return res.apiSuccess(context);
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/context/boards/:id - Generate board context
  router.get('/boards/:id', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;
      const { includeCompletedTasks = false, maxTasks = 200 } = req.query;

      const options = {
        include_completed: includeCompletedTasks === 'true',
        days_back: 30,
        max_items: parseInt(maxTasks as string, 10),
        include_metrics: true,
        detail_level: 'detailed' as const,
      };

      const context = await contextService.getProjectContext(options);

      if (!context) {
        throw new NotFoundError('Board', id ?? 'unknown');
      }

      return res.apiSuccess(context);
    } catch (error) {
      return next(error);
    }
  });

  // POST /api/v1/context/analyze - Analyze context for insights
  router.post('/analyze', requirePermission('read'), async (req, res, next) => {
    try {
      const analysisData = req.body;
      const analysis = { message: 'Context analysis not implemented', data: analysisData };
      return res.apiSuccess(analysis);
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/context/insights/boards/:id - Get board insights
  router.get('/insights/boards/:id', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;
      const {
        timeframe = 30,
        includeRecommendations = true,
        includeBlockers = true,
        includeMetrics = true,
      } = req.query;

      const options = {
        timeframe: parseInt(timeframe as string, 10),
        includeRecommendations: includeRecommendations === 'true',
        includeBlockers: includeBlockers === 'true',
        includeMetrics: includeMetrics === 'true',
      };

      const insights = { message: 'Board insights not implemented', boardId: id, options };
      return res.apiSuccess(insights);
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/context/insights/tasks/:id - Get task insights
  router.get('/insights/tasks/:id', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;
      const {
        includeBlockers = true,
        includeEstimates = true,
        includeRecommendations = true,
      } = req.query;

      const options = {
        includeBlockers: includeBlockers === 'true',
        includeEstimates: includeEstimates === 'true',
        includeRecommendations: includeRecommendations === 'true',
      };

      const insights = { message: 'Task insights not implemented', taskId: id, options };
      return res.apiSuccess(insights);
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/context/summary - Get overall system summary
  router.get('/summary', requirePermission('read'), async (req, res, next) => {
    try {
      const {
        includeMetrics = true,
        includeRecentActivity = true,
        includeTopTags = true,
        timeframe = 7,
      } = req.query;

      const options = {
        includeMetrics: includeMetrics === 'true',
        includeRecentActivity: includeRecentActivity === 'true',
        includeTopTags: includeTopTags === 'true',
        timeframe: parseInt(timeframe as string, 10),
      };

      const summary = { message: 'System summary not implemented', options };
      return res.apiSuccess(summary);
    } catch (error) {
      return next(error);
    }
  });

  // POST /api/v1/context/export - Export context data
  router.post('/export', requirePermission('read'), async (req, res, next) => {
    try {
      const exportData = req.body;
      const exportResult = { message: 'Context export not implemented', data: exportData };

      res.set({
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="context-export-${String(String(Date.now()))}.json"`,
      });

      return res.apiSuccess(exportResult);
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/v1/context/templates - Get context templates
  router.get('/templates', requirePermission('read'), async (req, res, next) => {
    try {
      const { type } = req.query;
      const templates = { message: 'Context templates not implemented', type, templates: [] };
      return res.apiSuccess(templates);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
