/**
 * @fileoverview MCP analytics and context tools configuration
 * @lastmodified 2025-01-28T10:30:00Z
 *
 * Features: Context generation, analytics, AI prioritization, project insights
 * Main APIs: getProjectContext, getTaskContext, prioritizeTasks, getAnalytics
 * Constraints: Requires ContextService, AIContextualPrioritizer
 * Patterns: All tools return Promise<Tool[]>, consistent date handling
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export function getAnalyticsTools(): Tool[] {
  return [
    {
      name: 'get_project_context',
      description: 'Generate AI-optimized project context for better task understanding',
      inputSchema: {
        type: 'object',
        properties: {
          board_id: { type: 'string', description: 'Board ID for context generation' },
          include_recent_activity: {
            type: 'boolean',
            description: 'Include recent task activity',
            default: true,
          },
          include_dependencies: {
            type: 'boolean',
            description: 'Include task dependencies',
            default: true,
          },
          include_team_metrics: {
            type: 'boolean',
            description: 'Include team performance metrics',
            default: false,
          },
          days_back: {
            type: 'number',
            description: 'Days of history to include',
            default: 30,
            maximum: 365,
          },
        },
        required: ['board_id'],
      },
    },
    {
      name: 'get_task_context',
      description: 'Get detailed context for a specific task',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Task ID for context generation' },
          include_history: {
            type: 'boolean',
            description: 'Include task change history',
            default: true,
          },
          include_related_tasks: {
            type: 'boolean',
            description: 'Include related/similar tasks',
            default: true,
          },
          include_notes: {
            type: 'boolean',
            description: 'Include all task notes',
            default: true,
          },
          include_dependencies: {
            type: 'boolean',
            description: 'Include task dependencies',
            default: true,
          },
        },
        required: ['task_id'],
      },
    },
    {
      name: 'prioritize_tasks',
      description: 'Use AI to prioritize tasks based on context and criteria',
      inputSchema: {
        type: 'object',
        properties: {
          board_id: { type: 'string', description: 'Board ID to prioritize tasks for' },
          criteria: {
            type: 'object',
            description: 'Prioritization criteria',
            properties: {
              urgency_weight: { type: 'number', minimum: 0, maximum: 1, default: 0.3 },
              importance_weight: { type: 'number', minimum: 0, maximum: 1, default: 0.3 },
              effort_weight: { type: 'number', minimum: 0, maximum: 1, default: 0.2 },
              dependencies_weight: { type: 'number', minimum: 0, maximum: 1, default: 0.2 },
            },
          },
          include_blocked: {
            type: 'boolean',
            description: 'Include blocked tasks in prioritization',
            default: false,
          },
          limit: {
            type: 'number',
            description: 'Maximum number of tasks to prioritize',
            default: 20,
            maximum: 100,
          },
        },
        required: ['board_id'],
      },
    },
    {
      name: 'get_analytics',
      description: 'Get comprehensive analytics for boards and tasks',
      inputSchema: {
        type: 'object',
        properties: {
          board_id: { type: 'string', description: 'Board ID for analytics (optional for global)' },
          metric_types: {
            type: 'array',
            description: 'Types of metrics to include',
            items: {
              type: 'string',
              enum: [
                'task_completion',
                'velocity',
                'cycle_time',
                'burndown',
                'priority_distribution',
                'status_distribution',
                'team_performance',
                'bottlenecks',
              ],
            },
            default: ['task_completion', 'velocity', 'priority_distribution'],
          },
          time_period: {
            type: 'string',
            enum: ['week', 'month', 'quarter', 'year'],
            description: 'Time period for analytics',
            default: 'month',
          },
          include_predictions: {
            type: 'boolean',
            description: 'Include AI-powered predictions',
            default: false,
          },
          include_recommendations: {
            type: 'boolean',
            description: 'Include improvement recommendations',
            default: true,
          },
        },
        required: [],
      },
    },
    {
      name: 'get_velocity_metrics',
      description: 'Get team velocity and throughput metrics',
      inputSchema: {
        type: 'object',
        properties: {
          board_id: { type: 'string', description: 'Board ID for velocity metrics' },
          time_period: {
            type: 'string',
            enum: ['week', 'month', 'quarter'],
            description: 'Time period for velocity calculation',
            default: 'month',
          },
          include_trend: {
            type: 'boolean',
            description: 'Include velocity trend analysis',
            default: true,
          },
          include_capacity: {
            type: 'boolean',
            description: 'Include team capacity analysis',
            default: false,
          },
          periods_back: {
            type: 'number',
            description: 'Number of periods to analyze',
            default: 6,
            maximum: 24,
          },
        },
        required: ['board_id'],
      },
    },
    {
      name: 'get_bottleneck_analysis',
      description: 'Identify workflow bottlenecks and improvement opportunities',
      inputSchema: {
        type: 'object',
        properties: {
          board_id: { type: 'string', description: 'Board ID for bottleneck analysis' },
          include_suggestions: {
            type: 'boolean',
            description: 'Include improvement suggestions',
            default: true,
          },
          time_window: {
            type: 'number',
            description: 'Days to analyze for bottlenecks',
            default: 30,
            maximum: 180,
          },
          severity_threshold: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'Minimum severity level to report',
            default: 'medium',
          },
        },
        required: ['board_id'],
      },
    },
  ];
}
