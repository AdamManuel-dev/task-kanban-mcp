/**
 * Unit tests for TagService
 *
 * @description Comprehensive test suite covering all TagService functionality
 * including CRUD operations, hierarchy management, task assignments, stats, and edge cases.
 */

import { TagService } from '@/services/TagService';
import { DatabaseConnection } from '@/database/connection';
import type { Tag, ServiceError } from '@/types';

// Mock the logger to avoid console output during tests
jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('TagService', () => {
  let dbConnection: DatabaseConnection;
  let tagService: TagService;
  let boardId: string;
  let taskId: string;
  let secondTaskId: string;

  beforeEach(async () => {
    // Force a new database instance for testing
    (DatabaseConnection as any).instance = null;
    dbConnection = DatabaseConnection.getInstance();

    if (dbConnection.isConnected()) {
      await dbConnection.close();
    }

    // Use test-specific database file
    process.env.DATABASE_PATH = './data/kanban-test.db';

    await dbConnection.initialize();
    tagService = new TagService(dbConnection);

    // Set up test data
    boardId = 'test-board-1';
    taskId = 'test-task-1';
    secondTaskId = 'test-task-2';

    // Create test board and column
    await dbConnection.execute('INSERT INTO boards (id, name, description) VALUES (?, ?, ?)', [
      boardId,
      'Test Board',
      'Test board description',
    ]);

    await dbConnection.execute(
      'INSERT INTO columns (id, board_id, name, position) VALUES (?, ?, ?, ?)',
      ['todo', boardId, 'To Do', 0]
    );

    // Create test tasks
    await dbConnection.execute(
      'INSERT INTO tasks (id, board_id, column_id, title, description, status, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [taskId, boardId, 'todo', 'Test Task 1', 'Test task description', 'todo', 0]
    );

    await dbConnection.execute(
      'INSERT INTO tasks (id, board_id, column_id, title, description, status, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [secondTaskId, boardId, 'todo', 'Test Task 2', 'Second test task', 'todo', 1]
    );
  });

  afterEach(async () => {
    if (dbConnection && dbConnection.isConnected()) {
      await dbConnection.close();
    }
  });

  describe('createTag', () => {
    it('should create a tag successfully', async () => {
      const tagData = {
        name: 'frontend',
        color: '#FF5722',
        description: 'Frontend development tasks',
      };

      const tag = await tagService.createTag(tagData);

      expect(tag).toBeDefined();
      expect(tag.id).toBeDefined();
      expect(tag.name).toBe('frontend');
      expect(tag.color).toBe('#FF5722');
      expect(tag.description).toBe('Frontend development tasks');
      expect(tag.parent_tag_id).toBeUndefined();
      expect(tag.created_at).toBeInstanceOf(Date);
    });

    it('should create a tag with default color', async () => {
      const tagData = {
        name: 'backend',
      };

      const tag = await tagService.createTag(tagData);

      expect(tag.color).toBe('#9E9E9E');
      expect(tag.description).toBeUndefined();
    });

    it('should create a child tag', async () => {
      const parentTag = await tagService.createTag({
        name: 'development',
      });

      const childTag = await tagService.createTag({
        name: 'frontend',
        parent_tag_id: parentTag.id,
      });

      expect(childTag.parent_tag_id).toBe(parentTag.id);
    });

    it('should throw error for duplicate tag name', async () => {
      await tagService.createTag({ name: 'duplicate' });

      await expect(tagService.createTag({ name: 'duplicate' })).rejects.toThrow(
        'Failed to create tag'
      );
    });

    it('should throw error for non-existent parent tag', async () => {
      await expect(
        tagService.createTag({
          name: 'child',
          parent_tag_id: 'non-existent-parent',
        })
      ).rejects.toThrow('Failed to create tag');
    });

    it('should prevent circular hierarchy', async () => {
      const parentTag = await tagService.createTag({ name: 'parent' });
      const childTag = await tagService.createTag({
        name: 'child',
        parent_tag_id: parentTag.id,
      });

      await expect(
        tagService.updateTag(parentTag.id, { parent_tag_id: childTag.id })
      ).rejects.toThrow('Failed to update tag');
    });
  });

  describe('getTagById', () => {
    let createdTag: Tag;

    beforeEach(async () => {
      createdTag = await tagService.createTag({
        name: 'test-tag',
        color: '#2196F3',
        description: 'Test tag description',
      });
    });

    it('should retrieve tag by ID', async () => {
      const tag = await tagService.getTagById(createdTag.id);

      expect(tag).toBeDefined();
      expect(tag!.id).toBe(createdTag.id);
      expect(tag!.name).toBe('test-tag');
      expect(tag!.color).toBe('#2196F3');
      expect(tag!.description).toBe('Test tag description');
      expect(tag!.created_at).toBeInstanceOf(Date);
    });

    it('should return null for non-existent tag', async () => {
      const tag = await tagService.getTagById('non-existent-id');
      expect(tag).toBeNull();
    });
  });

  describe('getTagByName', () => {
    beforeEach(async () => {
      await tagService.createTag({
        name: 'unique-name',
        description: 'Tag with unique name',
      });
    });

    it('should retrieve tag by name', async () => {
      const tag = await tagService.getTagByName('unique-name');

      expect(tag).toBeDefined();
      expect(tag!.name).toBe('unique-name');
      expect(tag!.description).toBe('Tag with unique name');
    });

    it('should return null for non-existent name', async () => {
      const tag = await tagService.getTagByName('non-existent-name');
      expect(tag).toBeNull();
    });
  });

  describe('getTags', () => {
    beforeEach(async () => {
      const parentTag = await tagService.createTag({
        name: 'development',
        color: '#4CAF50',
      });

      await tagService.createTag({
        name: 'frontend',
        color: '#FF5722',
        parent_tag_id: parentTag.id,
      });

      await tagService.createTag({
        name: 'backend',
        color: '#2196F3',
        parent_tag_id: parentTag.id,
      });

      await tagService.createTag({
        name: 'testing',
        color: '#9C27B0',
      });
    });

    it('should retrieve all tags with default options', async () => {
      const tags = await tagService.getTags();

      expect(tags).toHaveLength(4);
      expect(tags[0].name <= tags[1].name).toBe(true); // Default sort: asc by name
    });

    it('should filter tags by parent_tag_id', async () => {
      const parentTag = await tagService.getTagByName('development');
      const childTags = await tagService.getTags({ parent_tag_id: parentTag!.id });

      expect(childTags).toHaveLength(2);
      childTags.forEach(tag => expect(tag.parent_tag_id).toBe(parentTag!.id));
    });

    it('should filter root tags (no parent)', async () => {
      const rootTags = await tagService.getTags({ has_parent: false });

      expect(rootTags).toHaveLength(2);
      rootTags.forEach(tag => expect(tag.parent_tag_id).toBeNull());
    });

    it('should filter tags by color', async () => {
      const redTags = await tagService.getTags({ color: '#FF5722' });

      expect(redTags).toHaveLength(1);
      expect(redTags[0].name).toBe('frontend');
    });

    it('should filter tags by name pattern', async () => {
      const devTags = await tagService.getTags({ name_pattern: 'end' });

      expect(devTags).toHaveLength(2); // frontend and backend
    });

    it('should search tags by name and description', async () => {
      await tagService.createTag({
        name: 'api',
        description: 'backend API development',
      });

      const searchResults = await tagService.getTags({ search: 'backend' });

      expect(searchResults.length).toBeGreaterThanOrEqual(1);
    });

    it('should apply pagination', async () => {
      const page1 = await tagService.getTags({ limit: 2, offset: 0 });
      const page2 = await tagService.getTags({ limit: 2, offset: 2 });

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
      expect(page1[0].id).not.toBe(page2[0].id);
    });

    it('should sort tags by different fields', async () => {
      const tagsByColor = await tagService.getTags({
        sortBy: 'color',
        sortOrder: 'desc',
      });

      expect(tagsByColor[0].color >= tagsByColor[1].color).toBe(true);
    });
  });

  describe('getRootTags and getChildTags', () => {
    let parentTag: Tag;

    beforeEach(async () => {
      parentTag = await tagService.createTag({ name: 'parent' });
      await tagService.createTag({
        name: 'child1',
        parent_tag_id: parentTag.id,
      });
      await tagService.createTag({
        name: 'child2',
        parent_tag_id: parentTag.id,
      });
      await tagService.createTag({ name: 'orphan' });
    });

    it('should get root tags', async () => {
      const rootTags = await tagService.getRootTags();

      expect(rootTags).toHaveLength(2);
      expect(rootTags.map(t => t.name).sort()).toEqual(['orphan', 'parent']);
    });

    it('should get child tags', async () => {
      const childTags = await tagService.getChildTags(parentTag.id);

      expect(childTags).toHaveLength(2);
      expect(childTags.map(t => t.name).sort()).toEqual(['child1', 'child2']);
    });
  });

  describe('getTagHierarchy', () => {
    beforeEach(async () => {
      const devTag = await tagService.createTag({ name: 'development' });
      const frontendTag = await tagService.createTag({
        name: 'frontend',
        parent_tag_id: devTag.id,
      });
      await tagService.createTag({
        name: 'react',
        parent_tag_id: frontendTag.id,
      });
      await tagService.createTag({
        name: 'backend',
        parent_tag_id: devTag.id,
      });
    });

    it('should build complete tag hierarchy', async () => {
      const hierarchies = await tagService.getTagHierarchy();

      expect(hierarchies).toHaveLength(1);
      const devHierarchy = hierarchies[0];
      expect(devHierarchy.name).toBe('development');
      expect(devHierarchy.depth).toBe(0);
      expect(devHierarchy.children).toHaveLength(2);

      const frontendChild = devHierarchy.children.find(c => c.name === 'frontend');
      expect(frontendChild!.depth).toBe(1);
      expect(frontendChild!.children).toHaveLength(1);
      expect(frontendChild!.children[0].name).toBe('react');
      expect(frontendChild!.children[0].depth).toBe(2);
    });

    it('should build hierarchy for specific root tag', async () => {
      const devTag = await tagService.getTagByName('development');
      const hierarchies = await tagService.getTagHierarchy(devTag!.id);

      expect(hierarchies).toHaveLength(1);
      expect(hierarchies[0].name).toBe('development');
    });
  });

  describe('getTagWithStats', () => {
    let tag: Tag;

    beforeEach(async () => {
      tag = await tagService.createTag({ name: 'stats-tag' });
      await tagService.createTag({
        name: 'child-tag',
        parent_tag_id: tag.id,
      });

      // Add tag to tasks
      await tagService.addTagToTask(taskId, tag.id);
      await tagService.addTagToTask(secondTaskId, tag.id);
    });

    it('should get tag with statistics', async () => {
      const tagWithStats = await tagService.getTagWithStats(tag.id);

      expect(tagWithStats).toBeDefined();
      expect(tagWithStats!.task_count).toBe(2);
      expect(tagWithStats!.usage_count).toBe(2);
      expect(tagWithStats!.child_count).toBe(1);
      expect(tagWithStats!.last_used).toBeInstanceOf(Date);
    });

    it('should return null for non-existent tag', async () => {
      const tagWithStats = await tagService.getTagWithStats('non-existent-id');
      expect(tagWithStats).toBeNull();
    });
  });

  describe('updateTag', () => {
    let tag: Tag;

    beforeEach(async () => {
      tag = await tagService.createTag({
        name: 'original-name',
        color: '#000000',
        description: 'Original description',
      });
    });

    it('should update tag name', async () => {
      const updatedTag = await tagService.updateTag(tag.id, {
        name: 'updated-name',
      });

      expect(updatedTag.name).toBe('updated-name');
      expect(updatedTag.color).toBe('#000000'); // Unchanged
    });

    it('should update tag color', async () => {
      const updatedTag = await tagService.updateTag(tag.id, {
        color: '#FF0000',
      });

      expect(updatedTag.color).toBe('#FF0000');
      expect(updatedTag.name).toBe('original-name'); // Unchanged
    });

    it('should update tag description', async () => {
      const updatedTag = await tagService.updateTag(tag.id, {
        description: 'Updated description',
      });

      expect(updatedTag.description).toBe('Updated description');
    });

    it('should update parent tag', async () => {
      const parentTag = await tagService.createTag({ name: 'parent' });
      const updatedTag = await tagService.updateTag(tag.id, {
        parent_tag_id: parentTag.id,
      });

      expect(updatedTag.parent_tag_id).toBe(parentTag.id);
    });

    it('should update multiple fields', async () => {
      const updatedTag = await tagService.updateTag(tag.id, {
        name: 'multi-update',
        color: '#00FF00',
        description: 'Multi-field update',
      });

      expect(updatedTag.name).toBe('multi-update');
      expect(updatedTag.color).toBe('#00FF00');
      expect(updatedTag.description).toBe('Multi-field update');
    });

    it('should return unchanged tag when no updates provided', async () => {
      const unchangedTag = await tagService.updateTag(tag.id, {});

      expect(unchangedTag.id).toBe(tag.id);
      expect(unchangedTag.name).toBe(tag.name);
    });

    it('should throw error for non-existent tag', async () => {
      await expect(tagService.updateTag('non-existent-id', { name: 'new-name' })).rejects.toThrow(
        'Failed to update tag'
      );
    });

    it('should throw error for duplicate name', async () => {
      await tagService.createTag({ name: 'existing-name' });

      await expect(tagService.updateTag(tag.id, { name: 'existing-name' })).rejects.toThrow(
        'Failed to update tag'
      );
    });

    it('should throw error for non-existent parent', async () => {
      await expect(
        tagService.updateTag(tag.id, { parent_tag_id: 'non-existent-parent' })
      ).rejects.toThrow('Failed to update tag');
    });
  });

  describe('deleteTag', () => {
    let parentTag: Tag;
    let childTag: Tag;
    let grandChildTag: Tag;

    beforeEach(async () => {
      parentTag = await tagService.createTag({ name: 'parent' });
      childTag = await tagService.createTag({
        name: 'child',
        parent_tag_id: parentTag.id,
      });
      grandChildTag = await tagService.createTag({
        name: 'grandchild',
        parent_tag_id: childTag.id,
      });

      // Add tags to tasks
      await tagService.addTagToTask(taskId, childTag.id);
    });

    it('should delete tag and reassign children to parent', async () => {
      await tagService.deleteTag(childTag.id, true);

      const deletedTag = await tagService.getTagById(childTag.id);
      expect(deletedTag).toBeNull();

      const reassignedGrandChild = await tagService.getTagById(grandChildTag.id);
      expect(reassignedGrandChild!.parent_tag_id).toBe(parentTag.id);

      // Task tags should be removed
      const taskTags = await tagService.getTaskTags(taskId);
      expect(taskTags).toHaveLength(0);
    });

    it('should delete tag and all children recursively', async () => {
      await tagService.deleteTag(childTag.id, false);

      const deletedChild = await tagService.getTagById(childTag.id);
      const deletedGrandChild = await tagService.getTagById(grandChildTag.id);

      expect(deletedChild).toBeNull();
      expect(deletedGrandChild).toBeNull();
    });

    it('should throw error for non-existent tag', async () => {
      await expect(tagService.deleteTag('non-existent-id')).rejects.toThrow('Failed to delete tag');
    });
  });

  describe('addTagToTask and removeTagFromTask', () => {
    let tag: Tag;

    beforeEach(async () => {
      tag = await tagService.createTag({ name: 'task-tag' });
    });

    it('should add tag to task', async () => {
      const taskTag = await tagService.addTagToTask(taskId, tag.id);

      expect(taskTag).toBeDefined();
      expect(taskTag.id).toBeDefined();
      expect(taskTag.task_id).toBe(taskId);
      expect(taskTag.tag_id).toBe(tag.id);
      expect(taskTag.created_at).toBeInstanceOf(Date);
    });

    it('should throw error when adding tag to non-existent task', async () => {
      await expect(tagService.addTagToTask('non-existent-task', tag.id)).rejects.toThrow(
        'Failed to assign tag to task'
      );
    });

    it('should throw error when adding non-existent tag to task', async () => {
      await expect(tagService.addTagToTask(taskId, 'non-existent-tag')).rejects.toThrow(
        'Failed to assign tag to task'
      );
    });

    it('should throw error when adding duplicate tag assignment', async () => {
      await tagService.addTagToTask(taskId, tag.id);

      await expect(tagService.addTagToTask(taskId, tag.id)).rejects.toThrow(
        'Failed to assign tag to task'
      );
    });

    it('should remove tag from task', async () => {
      await tagService.addTagToTask(taskId, tag.id);
      await tagService.removeTagFromTask(taskId, tag.id);

      const taskTags = await tagService.getTaskTags(taskId);
      expect(taskTags).toHaveLength(0);
    });

    it('should throw error when removing non-existent assignment', async () => {
      await expect(tagService.removeTagFromTask(taskId, tag.id)).rejects.toThrow(
        'Failed to remove tag from task'
      );
    });
  });

  describe('getTaskTags', () => {
    beforeEach(async () => {
      const tag1 = await tagService.createTag({ name: 'alpha-tag' });
      const tag2 = await tagService.createTag({ name: 'beta-tag' });
      const tag3 = await tagService.createTag({ name: 'gamma-tag' });

      await tagService.addTagToTask(taskId, tag1.id);
      await tagService.addTagToTask(taskId, tag3.id);
      await tagService.addTagToTask(secondTaskId, tag2.id);
    });

    it('should get tags for specific task', async () => {
      const taskTags = await tagService.getTaskTags(taskId);

      expect(taskTags).toHaveLength(2);
      expect(taskTags[0].name <= taskTags[1].name).toBe(true); // Sorted by name
      expect(taskTags.map(t => t.name)).toEqual(['alpha-tag', 'gamma-tag']);
    });

    it('should return empty array for task with no tags', async () => {
      const taskTags = await tagService.getTaskTags('new-task-id');
      expect(taskTags).toHaveLength(0);
    });
  });

  describe('getTaggedTasks', () => {
    let parentTag: Tag;
    let childTag: Tag;

    beforeEach(async () => {
      parentTag = await tagService.createTag({ name: 'parent-tag' });
      childTag = await tagService.createTag({
        name: 'child-tag',
        parent_tag_id: parentTag.id,
      });

      await tagService.addTagToTask(taskId, parentTag.id);
      await tagService.addTagToTask(secondTaskId, childTag.id);
    });

    it('should get tasks tagged with specific tag', async () => {
      const taggedTasks = await tagService.getTaggedTasks(parentTag.id);

      expect(taggedTasks).toHaveLength(1);
      expect(taggedTasks[0]).toBe(taskId);
    });

    it('should get tasks including child tag tasks', async () => {
      const taggedTasks = await tagService.getTaggedTasks(parentTag.id, true);

      expect(taggedTasks).toHaveLength(2);
      expect(taggedTasks).toContain(taskId);
      expect(taggedTasks).toContain(secondTaskId);
    });

    it('should return empty array for unused tag', async () => {
      const unusedTag = await tagService.createTag({ name: 'unused' });
      const taggedTasks = await tagService.getTaggedTasks(unusedTag.id);

      expect(taggedTasks).toHaveLength(0);
    });
  });

  describe('getTagUsageStats', () => {
    beforeEach(async () => {
      const tag1 = await tagService.createTag({ name: 'popular-tag' });
      const tag2 = await tagService.createTag({ name: 'rare-tag' });

      // Make tag1 more popular
      await tagService.addTagToTask(taskId, tag1.id);
      await tagService.addTagToTask(secondTaskId, tag1.id);
      await tagService.addTagToTask(taskId, tag2.id);
    });

    it('should get tag usage statistics', async () => {
      const stats = await tagService.getTagUsageStats();

      expect(stats).toHaveLength(2);
      expect(stats[0].tag_name).toBe('popular-tag'); // Sorted by usage desc
      expect(stats[0].usage_count).toBe(2);
      expect(stats[0].unique_tasks).toBe(2);
      expect(stats[0].first_used).toBeInstanceOf(Date);
      expect(stats[0].last_used).toBeInstanceOf(Date);
      expect(stats[0].trend).toBeDefined();

      expect(stats[1].tag_name).toBe('rare-tag');
      expect(stats[1].usage_count).toBe(1);
      expect(stats[1].unique_tasks).toBe(1);
    });

    it('should apply custom day range and limit', async () => {
      const stats = await tagService.getTagUsageStats({ days: 1, limit: 1 });

      expect(stats.length).toBeLessThanOrEqual(1);
    });
  });

  describe('mergeTags', () => {
    let sourceTag: Tag;
    let targetTag: Tag;
    let childTag: Tag;

    beforeEach(async () => {
      sourceTag = await tagService.createTag({ name: 'source-tag' });
      targetTag = await tagService.createTag({ name: 'target-tag' });
      childTag = await tagService.createTag({
        name: 'child-of-source',
        parent_tag_id: sourceTag.id,
      });

      await tagService.addTagToTask(taskId, sourceTag.id);
      await tagService.addTagToTask(secondTaskId, sourceTag.id);
    });

    it('should merge tags successfully', async () => {
      await tagService.mergeTags(sourceTag.id, targetTag.id);

      // Source tag should be deleted
      const deletedSource = await tagService.getTagById(sourceTag.id);
      expect(deletedSource).toBeNull();

      // Task assignments should be moved to target
      const taskTags = await tagService.getTaskTags(taskId);
      expect(taskTags).toHaveLength(1);
      expect(taskTags[0].id).toBe(targetTag.id);

      // Child tag should be reassigned to target as parent
      const updatedChild = await tagService.getTagById(childTag.id);
      expect(updatedChild!.parent_tag_id).toBe(targetTag.id);
    });

    it('should throw error for non-existent source tag', async () => {
      await expect(tagService.mergeTags('non-existent-source', targetTag.id)).rejects.toThrow(
        'Failed to merge tags'
      );
    });

    it('should throw error for non-existent target tag', async () => {
      await expect(tagService.mergeTags(sourceTag.id, 'non-existent-target')).rejects.toThrow(
        'Failed to merge tags'
      );
    });
  });

  describe('error handling', () => {
    it('should handle database connection errors gracefully', async () => {
      await dbConnection.close();

      await expect(tagService.getTags()).rejects.toMatchObject({
        code: 'TAGS_FETCH_FAILED',
      });
    });

    it('should create ServiceError with correct properties', async () => {
      try {
        await tagService.updateTag('non-existent-id', { name: 'test' });
      } catch (error) {
        const serviceError = error as ServiceError;
        expect(serviceError.code).toBe('TAG_UPDATE_FAILED');
        expect(serviceError.statusCode).toBe(500);
      }
    });
  });

  describe('private methods functionality', () => {
    it('should prevent circular hierarchy in complex scenarios', async () => {
      const tag1 = await tagService.createTag({ name: 'tag1' });
      const tag2 = await tagService.createTag({
        name: 'tag2',
        parent_tag_id: tag1.id,
      });
      const tag3 = await tagService.createTag({
        name: 'tag3',
        parent_tag_id: tag2.id,
      });

      // Try to make tag1 a child of tag3 (would create cycle)
      await expect(tagService.updateTag(tag1.id, { parent_tag_id: tag3.id })).rejects.toThrow(
        'Failed to update tag'
      );
    });

    it('should calculate trends correctly', async () => {
      const tag = await tagService.createTag({ name: 'trend-tag' });

      // Add multiple usages
      await tagService.addTagToTask(taskId, tag.id);
      await tagService.addTagToTask(secondTaskId, tag.id);

      const stats = await tagService.getTagUsageStats({ days: 1 });
      const tagStats = stats.find(s => s.tag_name === 'trend-tag');

      expect(tagStats!.trend).toBe('increasing');
    });

    it('should build deep hierarchies correctly', async () => {
      const level1 = await tagService.createTag({ name: 'level1' });
      const level2 = await tagService.createTag({
        name: 'level2',
        parent_tag_id: level1.id,
      });
      await tagService.createTag({
        name: 'level3',
        parent_tag_id: level2.id,
      });

      const hierarchies = await tagService.getTagHierarchy(level1.id);

      expect(hierarchies[0].children[0].children[0].name).toBe('level3');
      expect(hierarchies[0].children[0].children[0].depth).toBe(2);
    });

    it('should handle date conversion correctly', async () => {
      const tag = await tagService.createTag({ name: 'date-test' });
      const retrievedTag = await tagService.getTagById(tag.id);

      expect(retrievedTag!.created_at).toBeInstanceOf(Date);
    });
  });
});
