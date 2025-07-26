import { Router } from 'express';
import { ContextService } from '@/services/ContextService';
import { dbConnection } from '@/database/connection';
import { requirePermission } from '@/middleware/auth';
import { ContextValidation, validateInput } from '@/utils/validation';
import { NotFoundError } from '@/utils/errors';

export async function contextRoutes() {
  const router = Router();
  
  const contextService = new ContextService(dbConnection);

  // GET /api/v1/context/projects/:id - Generate project context
  router.get('/projects/:id', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;
      const {
        includeCompletedTasks = false,
        includeNotes = true,
        includeTags = true,
        maxTasks = 100,
        maxNotes = 50,
      } = req.query;

      const options = {
        includeCompletedTasks: includeCompletedTasks === 'true',
        includeNotes: includeNotes === 'true',
        includeTags: includeTags === 'true',
        maxTasks: parseInt(maxTasks as string, 10),
        maxNotes: parseInt(maxNotes as string, 10),
      };

      const context = await contextService.generateProjectContext(id, options);
      
      if (!context) {
        throw new NotFoundError('Project', id);
      }

      res.apiSuccess(context);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/v1/context/tasks/:id - Generate task context
  router.get('/tasks/:id', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;
      const {
        includeSubtasks = true,
        includeDependencies = true,
        includeNotes = true,
        includeTags = true,
        includeRelatedTasks = false,
        maxRelatedTasks = 10,
      } = req.query;

      const options = {
        includeSubtasks: includeSubtasks === 'true',
        includeDependencies: includeDependencies === 'true',
        includeNotes: includeNotes === 'true',
        includeTags: includeTags === 'true',
        includeRelatedTasks: includeRelatedTasks === 'true',
        maxRelatedTasks: parseInt(maxRelatedTasks as string, 10),
      };

      const context = await contextService.generateTaskContext(id, options);
      
      if (!context) {
        throw new NotFoundError('Task', id);
      }

      res.apiSuccess(context);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/v1/context/boards/:id - Generate board context
  router.get('/boards/:id', requirePermission('read'), async (req, res, next) => {
    try {
      const { id } = req.params;
      const {
        includeCompletedTasks = false,
        includeNotes = true,
        includeTags = true,
        includeAnalytics = true,
        maxTasks = 200,
        maxNotes = 100,
      } = req.query;

      const options = {
        includeCompletedTasks: includeCompletedTasks === 'true',
        includeNotes: includeNotes === 'true',
        includeTags: includeTags === 'true',
        includeAnalytics: includeAnalytics === 'true',
        maxTasks: parseInt(maxTasks as string, 10),
        maxNotes: parseInt(maxNotes as string, 10),
      };

      const context = await contextService.generateBoardContext(id, options);
      
      if (!context) {
        throw new NotFoundError('Board', id);
      }

      res.apiSuccess(context);
    } catch (error) {
      next(error);
    }
  });

  // POST /api/v1/context/analyze - Analyze context for insights
  router.post('/analyze', requirePermission('read'), async (req, res, next) => {
    try {
      const analysisData = validateInput(ContextValidation.analyze, req.body);
      const analysis = await contextService.analyzeContext(analysisData);
      res.apiSuccess(analysis);
    } catch (error) {
      next(error);
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

      const insights = await contextService.getBoardInsights(id, options);
      res.apiSuccess(insights);
    } catch (error) {
      next(error);
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

      const insights = await contextService.getTaskInsights(id, options);
      res.apiSuccess(insights);
    } catch (error) {
      next(error);
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

      const summary = await contextService.getSystemSummary(options);
      res.apiSuccess(summary);
    } catch (error) {
      next(error);
    }
  });

  // POST /api/v1/context/export - Export context data
  router.post('/export', requirePermission('read'), async (req, res, next) => {
    try {
      const exportData = validateInput(ContextValidation.export, req.body);
      const exportResult = await contextService.exportContext(exportData);
      
      res.set({
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="context-export-${Date.now()}.json"`,
      });
      
      res.apiSuccess(exportResult);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/v1/context/templates - Get context templates
  router.get('/templates', requirePermission('read'), async (req, res, next) => {
    try {
      const { type } = req.query;
      const templates = await contextService.getContextTemplates(type as string);
      res.apiSuccess(templates);
    } catch (error) {
      next(error);
    }
  });

  return router;
}