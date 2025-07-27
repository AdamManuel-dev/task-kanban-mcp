/**
 * Unit tests for TaskTemplateService
 */

import { TaskTemplateService } from '../../../src/services/TaskTemplateService';
import { dbConnection } from '../../../src/database/connection';

describe('TaskTemplateService', () => {
  let service: TaskTemplateService;

  beforeAll(async () => {
    await dbConnection.initialize({ skipSchema: false });
    service = TaskTemplateService.getInstance();
  });

  afterAll(async () => {
    await dbConnection.close();
  });

  beforeEach(async () => {
    // Clean up templates before each test
    await dbConnection.execute('DELETE FROM task_templates WHERE created_by != ?', ['system']);
  });

  describe('Template Management', () => {
    test('should create a new template', async () => {
      const templateData = {
        name: 'Test Template',
        description: 'A test template',
        category: 'custom' as const,
        title_template: 'Test: {{title}}',
        description_template: 'Description: {{description}}',
        priority: 2,
        estimated_hours: 4,
        tags: ['test', 'example'],
        checklist_items: ['Step 1', 'Step 2'],
      };

      const template = await service.createTemplate(templateData);

      expect(template.id).toBeDefined();
      expect(template.name).toBe(templateData.name);
      expect(template.category).toBe(templateData.category);
      expect(template.is_system).toBe(false);
      expect(template.is_active).toBe(true);
      expect(template.usage_count).toBe(0);
      expect(template.tags).toEqual(templateData.tags);
      expect(template.checklist_items).toEqual(templateData.checklist_items);
    });

    test('should get templates with filters', async () => {
      // Create test templates
      await service.createTemplate({
        name: 'Bug Template',
        category: 'bug',
        title_template: 'Bug: {{summary}}',
        description_template: 'Bug description',
      });

      await service.createTemplate({
        name: 'Feature Template',
        category: 'feature',
        title_template: 'Feature: {{name}}',
        description_template: 'Feature description',
      });

      // Test category filter
      const bugTemplates = await service.getTemplates({ category: 'bug' });
      expect(bugTemplates).toHaveLength(1);
      expect(bugTemplates[0].name).toBe('Bug Template');

      // Test get all templates
      const allTemplates = await service.getTemplates();
      expect(allTemplates.length).toBeGreaterThanOrEqual(2);
    });

    test('should update template', async () => {
      const template = await service.createTemplate({
        name: 'Original Name',
        category: 'custom',
        title_template: 'Original: {{title}}',
        description_template: 'Original description',
      });

      const updated = await service.updateTemplate(template.id, {
        name: 'Updated Name',
        priority: 5,
        is_active: false,
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.priority).toBe(5);
      expect(updated.is_active).toBe(false);
      expect(updated.title_template).toBe('Original: {{title}}'); // Unchanged
    });

    test('should delete template', async () => {
      const template = await service.createTemplate({
        name: 'To Delete',
        category: 'custom',
        title_template: 'Delete: {{title}}',
        description_template: 'Will be deleted',
      });

      await service.deleteTemplate(template.id);

      const deleted = await service.getTemplate(template.id);
      expect(deleted).toBeNull();
    });
  });

  describe('Template Categories', () => {
    test('should return all template categories', () => {
      const categories = service.getCategories();

      expect(categories).toHaveLength(7);
      expect(categories.map(c => c.name)).toContain('bug');
      expect(categories.map(c => c.name)).toContain('feature');
      expect(categories.map(c => c.name)).toContain('meeting');
      expect(categories.map(c => c.name)).toContain('custom');

      const bugCategory = categories.find(c => c.name === 'bug');
      expect(bugCategory?.display_name).toBe('Bug Report');
      expect(bugCategory?.icon).toBe('🐛');
    });
  });

  describe('System Templates', () => {
    test('should initialize system templates', async () => {
      await service.initializeSystemTemplates();

      const systemTemplates = await service.getTemplates({ onlySystem: true });
      expect(systemTemplates.length).toBeGreaterThan(0);

      const bugTemplate = systemTemplates.find(t => t.name === 'Bug Report');
      expect(bugTemplate).toBeDefined();
      expect(bugTemplate?.is_system).toBe(true);
      expect(bugTemplate?.category).toBe('bug');
    });

    test('should not initialize system templates twice', async () => {
      await service.initializeSystemTemplates();
      const firstCount = (await service.getTemplates({ onlySystem: true })).length;

      await service.initializeSystemTemplates();
      const secondCount = (await service.getTemplates({ onlySystem: true })).length;

      expect(secondCount).toBe(firstCount);
    });
  });

  describe('Usage Statistics', () => {
    test('should track template usage', async () => {
      const template = await service.createTemplate({
        name: 'Usage Test',
        category: 'custom',
        title_template: 'Test: {{title}}',
        description_template: 'Test description',
      });

      // Initially no usage
      let stats = await service.getUsageStats();
      expect(stats.find(s => s.template_id === template.id)).toBeUndefined();

      // Manually increment usage (simulating task creation)
      await dbConnection.execute(
        'UPDATE task_templates SET usage_count = usage_count + 1 WHERE id = ?',
        [template.id]
      );

      stats = await service.getUsageStats();
      const templateStats = stats.find(s => s.template_id === template.id);
      expect(templateStats?.usage_count).toBe(1);
      expect(templateStats?.template_name).toBe('Usage Test');
    });
  });
});
