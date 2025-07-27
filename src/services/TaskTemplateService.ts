/**
 * Task Template Service
 * Manages task templates for quick task creation with predefined structures
 */

import { randomUUID } from 'crypto';
import { dbConnection } from '@/database/connection';
import { logger } from '@/utils/logger';
import type {
  TaskTemplate,
  TaskTemplateCreateRequest,
  TaskTemplateUpdateRequest,
  TaskFromTemplateRequest,
  TaskCreationResult,
  TemplateUsageStats,
  TemplateCategory,
  TemplateVariable,
} from '@/types/templates';
import type { DatabaseTask } from '@/types';

export class TaskTemplateService {
  private static instance: TaskTemplateService;

  public static getInstance(): TaskTemplateService {
    if (!TaskTemplateService.instance) {
      TaskTemplateService.instance = new TaskTemplateService();
    }
    return TaskTemplateService.instance;
  }

  /**
   * Get all active templates
   */
  async getTemplates(options: {
    category?: string;
    includeInactive?: boolean;
    onlySystem?: boolean;
  } = {}): Promise<TaskTemplate[]> {
    try {
      let query = 'SELECT * FROM task_templates WHERE 1=1';
      const params: any[] = [];

      if (!options.includeInactive) {
        query += ' AND is_active = ?';
        params.push(1);
      }

      if (options.category) {
        query += ' AND category = ?';
        params.push(options.category);
      }

      if (options.onlySystem !== undefined) {
        query += ' AND is_system = ?';
        params.push(options.onlySystem ? 1 : 0);
      }

      query += ' ORDER BY is_system DESC, category, name';

      const rows = await dbConnection.query(query, params);
      return rows.map(this.mapRowToTemplate);
    } catch (error) {
      logger.error('Failed to get templates:', error);
      throw new Error(`Failed to get templates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get template by ID
   */
  async getTemplate(id: string): Promise<TaskTemplate | null> {
    try {
      const row = await dbConnection.queryOne(
        'SELECT * FROM task_templates WHERE id = ?',
        [id]
      );
      return row ? this.mapRowToTemplate(row) : null;
    } catch (error) {
      logger.error(`Failed to get template ${id}:`, error);
      throw new Error(`Failed to get template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create new template
   */
  async createTemplate(request: TaskTemplateCreateRequest): Promise<TaskTemplate> {
    try {
      const id = randomUUID();
      const now = new Date().toISOString();

      await dbConnection.execute(
        `INSERT INTO task_templates (
          id, name, description, category, title_template, description_template,
          priority, estimated_hours, tags, checklist_items, custom_fields,
          created_by, is_system, is_active, usage_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          request.name,
          request.description || null,
          request.category,
          request.title_template,
          request.description_template || null,
          request.priority || 0,
          request.estimated_hours || null,
          JSON.stringify(request.tags || []),
          JSON.stringify(request.checklist_items || []),
          JSON.stringify(request.custom_fields || {}),
          request.created_by || null,
          0, // is_system
          1, // is_active
          0, // usage_count
          now,
          now,
        ]
      );

      const template = await this.getTemplate(id);
      if (!template) {
        throw new Error('Failed to retrieve created template');
      }

      logger.info(`Created template: ${request.name} (${id})`);
      return template;
    } catch (error) {
      logger.error('Failed to create template:', error);
      throw new Error(`Failed to create template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update template
   */
  async updateTemplate(id: string, request: TaskTemplateUpdateRequest): Promise<TaskTemplate> {
    try {
      const existing = await this.getTemplate(id);
      if (!existing) {
        throw new Error('Template not found');
      }

      const updates: string[] = [];
      const params: any[] = [];

      const fields = [
        'name', 'description', 'category', 'title_template', 'description_template',
        'priority', 'estimated_hours', 'is_active'
      ];

      for (const field of fields) {
        if (request[field as keyof TaskTemplateUpdateRequest] !== undefined) {
          updates.push(`${field} = ?`);
          params.push(request[field as keyof TaskTemplateUpdateRequest]);
        }
      }

      if (request.tags !== undefined) {
        updates.push('tags = ?');
        params.push(JSON.stringify(request.tags));
      }

      if (request.checklist_items !== undefined) {
        updates.push('checklist_items = ?');
        params.push(JSON.stringify(request.checklist_items));
      }

      if (request.custom_fields !== undefined) {
        updates.push('custom_fields = ?');
        params.push(JSON.stringify(request.custom_fields));
      }

      if (updates.length === 0) {
        return existing;
      }

      params.push(id);
      await dbConnection.execute(
        `UPDATE task_templates SET ${updates.join(', ')} WHERE id = ?`,
        params
      );

      const updated = await this.getTemplate(id);
      if (!updated) {
        throw new Error('Failed to retrieve updated template');
      }

      logger.info(`Updated template: ${id}`);
      return updated;
    } catch (error) {
      logger.error(`Failed to update template ${id}:`, error);
      throw new Error(`Failed to update template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete template
   */
  async deleteTemplate(id: string): Promise<void> {
    try {
      const template = await this.getTemplate(id);
      if (!template) {
        throw new Error('Template not found');
      }

      await dbConnection.execute('DELETE FROM task_templates WHERE id = ?', [id]);
      logger.info(`Deleted template: ${id}`);
    } catch (error) {
      logger.error(`Failed to delete template ${id}:`, error);
      throw new Error(`Failed to delete template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create task from template
   */
  async createTaskFromTemplate(request: TaskFromTemplateRequest): Promise<TaskCreationResult> {
    try {
      const template = await this.getTemplate(request.template_id);
      if (!template) {
        throw new Error('Template not found');
      }

      if (!template.is_active) {
        throw new Error('Template is inactive');
      }

      // Process template variables
      const title = this.processTemplate(template.title_template, request.variables);
      const description = template.description_template 
        ? this.processTemplate(template.description_template, request.variables)
        : '';

      // Create the task using TaskService
      const TaskService = await import('./TaskService').then(m => m.TaskService);
      const taskService = TaskService.getInstance();

      const taskData = {
        title,
        description,
        board_id: request.board_id,
        priority: template.priority,
        estimated_hours: template.estimated_hours,
        assignee: request.assignee,
        due_date: request.due_date,
        parent_task_id: request.parent_task_id,
        tags: template.tags,
      };

      const task = await taskService.createTask(taskData);

      // Update template usage count
      await this.incrementUsageCount(request.template_id);

      // Create checklist items if any
      let createdChecklistItems = 0;
      if (template.checklist_items.length > 0) {
        // TODO: Implement checklist items creation when that feature is added
        createdChecklistItems = template.checklist_items.length;
      }

      logger.info(`Created task from template ${template.name}: ${task.id}`);

      return {
        task_id: task.id,
        title: task.title,
        description: task.description,
        created_checklist_items: createdChecklistItems,
        applied_tags: template.tags,
        template_name: template.name,
      };
    } catch (error) {
      logger.error('Failed to create task from template:', error);
      throw new Error(`Failed to create task from template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get template usage statistics
   */
  async getUsageStats(): Promise<TemplateUsageStats[]> {
    try {
      const rows = await dbConnection.query(`
        SELECT 
          id as template_id,
          name as template_name,
          usage_count,
          updated_at as last_used
        FROM task_templates 
        WHERE usage_count > 0
        ORDER BY usage_count DESC
      `);

      return rows.map(row => ({
        template_id: row.template_id,
        template_name: row.template_name,
        usage_count: row.usage_count,
        last_used: row.last_used,
        success_rate: 1.0, // TODO: Calculate from actual task completion data
        most_common_variables: {}, // TODO: Track variable usage
      }));
    } catch (error) {
      logger.error('Failed to get usage stats:', error);
      throw new Error(`Failed to get usage stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get template categories with metadata
   */
  getCategories(): TemplateCategory[] {
    return [
      {
        name: 'bug',
        display_name: 'Bug Report',
        description: 'Templates for reporting and tracking bugs',
        icon: '🐛',
        default_priority: 3,
        suggested_tags: ['bug', 'urgent'],
      },
      {
        name: 'feature',
        display_name: 'Feature',
        description: 'Templates for new feature development',
        icon: '✨',
        default_priority: 1,
        suggested_tags: ['feature', 'enhancement'],
      },
      {
        name: 'meeting',
        display_name: 'Meeting',
        description: 'Templates for meeting preparation and follow-up',
        icon: '📅',
        default_priority: 2,
        suggested_tags: ['meeting', 'agenda'],
      },
      {
        name: 'maintenance',
        display_name: 'Maintenance',
        description: 'Templates for maintenance and technical debt',
        icon: '🔧',
        default_priority: 1,
        suggested_tags: ['maintenance', 'tech-debt'],
      },
      {
        name: 'research',
        display_name: 'Research',
        description: 'Templates for research and investigation tasks',
        icon: '🔍',
        default_priority: 2,
        suggested_tags: ['research', 'investigation'],
      },
      {
        name: 'review',
        display_name: 'Review',
        description: 'Templates for code reviews and documentation reviews',
        icon: '👀',
        default_priority: 2,
        suggested_tags: ['review', 'documentation'],
      },
      {
        name: 'custom',
        display_name: 'Custom',
        description: 'User-defined custom templates',
        icon: '⚙️',
        default_priority: 1,
        suggested_tags: [],
      },
    ];
  }

  /**
   * Initialize system templates
   */
  async initializeSystemTemplates(): Promise<void> {
    try {
      const existingSystemTemplates = await this.getTemplates({ onlySystem: true });
      if (existingSystemTemplates.length > 0) {
        logger.info('System templates already initialized');
        return;
      }

      const systemTemplates = this.getDefaultSystemTemplates();
      
      for (const template of systemTemplates) {
        await this.createSystemTemplate(template);
      }

      logger.info(`Initialized ${systemTemplates.length} system templates`);
    } catch (error) {
      logger.error('Failed to initialize system templates:', error);
      throw error;
    }
  }

  // Private methods

  private mapRowToTemplate(row: any): TaskTemplate {
    return {
      id: row.id,
      name: row.name,
      description: row.description || '',
      category: row.category,
      title_template: row.title_template,
      description_template: row.description_template || '',
      priority: row.priority,
      estimated_hours: row.estimated_hours,
      tags: JSON.parse(row.tags || '[]'),
      checklist_items: JSON.parse(row.checklist_items || '[]'),
      custom_fields: JSON.parse(row.custom_fields || '{}'),
      created_by: row.created_by,
      is_system: Boolean(row.is_system),
      is_active: Boolean(row.is_active),
      usage_count: row.usage_count,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private processTemplate(template: string, variables: Record<string, any>): string {
    let result = template;
    
    // Replace variables in format {{variable_name}}
    for (const [key, value] of Object.entries(variables)) {
      const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(pattern, String(value));
    }

    return result;
  }

  private async incrementUsageCount(templateId: string): Promise<void> {
    await dbConnection.execute(
      'UPDATE task_templates SET usage_count = usage_count + 1 WHERE id = ?',
      [templateId]
    );
  }

  private async createSystemTemplate(template: TaskTemplateCreateRequest & { is_system: boolean }): Promise<void> {
    const id = randomUUID();
    const now = new Date().toISOString();

    await dbConnection.execute(
      `INSERT INTO task_templates (
        id, name, description, category, title_template, description_template,
        priority, estimated_hours, tags, checklist_items, custom_fields,
        created_by, is_system, is_active, usage_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        template.name,
        template.description || null,
        template.category,
        template.title_template,
        template.description_template || null,
        template.priority || 0,
        template.estimated_hours || null,
        JSON.stringify(template.tags || []),
        JSON.stringify(template.checklist_items || []),
        JSON.stringify(template.custom_fields || {}),
        'system',
        1, // is_system
        1, // is_active
        0, // usage_count
        now,
        now,
      ]
    );
  }

  private getDefaultSystemTemplates(): (TaskTemplateCreateRequest & { is_system: boolean })[] {
    return [
      {
        name: 'Bug Report',
        description: 'Standard template for bug reports',
        category: 'bug',
        title_template: 'Bug: {{summary}}',
        description_template: `## Problem Description
{{description}}

## Steps to Reproduce
1. {{step1}}
2. {{step2}}
3. {{step3}}

## Expected Behavior
{{expected}}

## Actual Behavior
{{actual}}

## Environment
- Browser: {{browser}}
- OS: {{os}}
- Version: {{version}}`,
        priority: 3,
        estimated_hours: 2,
        tags: ['bug', 'urgent'],
        checklist_items: [
          'Reproduce the issue',
          'Identify root cause',
          'Implement fix',
          'Test fix',
          'Update documentation'
        ],
        custom_fields: {},
        is_system: true,
      },
      {
        name: 'Feature Request',
        description: 'Standard template for new features',
        category: 'feature',
        title_template: 'Feature: {{feature_name}}',
        description_template: `## Feature Description
{{description}}

## User Story
As a {{user_type}}, I want {{goal}} so that {{benefit}}.

## Acceptance Criteria
- [ ] {{criteria1}}
- [ ] {{criteria2}}
- [ ] {{criteria3}}

## Design Notes
{{design_notes}}`,
        priority: 1,
        estimated_hours: 8,
        tags: ['feature', 'enhancement'],
        checklist_items: [
          'Define requirements',
          'Create design mockups',
          'Implement feature',
          'Write tests',
          'Update documentation'
        ],
        custom_fields: {},
        is_system: true,
      },
      {
        name: 'Meeting Action Item',
        description: 'Template for meeting follow-up tasks',
        category: 'meeting',
        title_template: '{{meeting_title}} - {{action_item}}',
        description_template: `## Meeting Details
- **Date**: {{meeting_date}}
- **Attendees**: {{attendees}}

## Action Item
{{action_description}}

## Context
{{context}}

## Due Date
{{due_date}}`,
        priority: 2,
        estimated_hours: 1,
        tags: ['meeting', 'action-item'],
        checklist_items: [
          'Clarify requirements',
          'Complete action',
          'Report back to team'
        ],
        custom_fields: {},
        is_system: true,
      },
    ];
  }
}