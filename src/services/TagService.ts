/**
 * Tag Service - Core business logic for tag management
 *
 * @module services/TagService
 * @description Provides comprehensive tag management functionality including CRUD operations,
 * hierarchical tag structures, tag assignment to tasks, usage statistics, and tag merging.
 * Supports nested tag hierarchies with circular dependency prevention and efficient querying.
 *
 * @example
 * ```typescript
 * import { TagService } from '@/services/TagService';
 * import { dbConnection } from '@/database/connection';
 *
 * const tagService = new TagService(dbConnection);
 *
 * // Create a hierarchical tag structure
 * const parentTag = await tagService.createTag({
 *   name: 'Feature',
 *   color: '#4CAF50',
 *   description: 'Feature-related tags'
 * });
 *
 * const childTag = await tagService.createTag({
 *   name: 'Authentication',
 *   parent_tag_id: parentTag.id,
 *   color: '#2196F3'
 * });
 *
 * // Assign tag to task
 * await tagService.addTagToTask('task-123', childTag.id);
 * ```
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/utils/logger';
import type { DatabaseConnection, QueryParameters } from '@/database/connection';
import type { Tag, TaskTag, ServiceError, PaginationOptions, FilterOptions } from '@/types';

/**
 * Request interface for creating new tags
 *
 * @interface CreateTagRequest
 * @description Defines the structure for tag creation requests with required name and optional metadata
 */
export interface CreateTagRequest {
  name: string;
  color?: string | undefined;
  description?: string | undefined;
  parent_tag_id?: string | undefined;
}

/**
 * Request interface for updating existing tags
 *
 * @interface UpdateTagRequest
 * @description All fields are optional to support partial updates. Parent tag changes
 * are validated to prevent circular hierarchies.
 */
export interface UpdateTagRequest {
  name?: string | undefined;
  color?: string | undefined;
  description?: string | undefined;
  parent_tag_id?: string | undefined;
}

/**
 * Advanced filtering options for tag queries
 *
 * @interface TagFilters
 * @extends FilterOptions
 * @description Provides comprehensive filtering capabilities for tag searches including
 * hierarchy filtering, color matching, and pattern-based name searching.
 */
export interface TagFilters extends FilterOptions {
  parent_tag_id?: string;
  has_parent?: boolean;
  color?: string;
  name_pattern?: string;
}

/**
 * Tag with hierarchical structure information
 *
 * @interface TagHierarchy
 * @extends Tag
 * @description Represents a tag with its complete subtree, depth level, and usage count
 */
export interface TagHierarchy extends Tag {
  children: TagHierarchy[];
  depth: number;
  task_count: number;
}

/**
 * Tag with comprehensive usage statistics
 *
 * @interface TagWithStats
 * @extends Tag
 * @description Includes usage metrics, task associations, and child tag count
 */
export interface TagWithStats extends Tag {
  task_count: number;
  usage_count: number;
  last_used?: Date;
  child_count: number;
}

/**
 * Tag usage statistics with trend analysis
 *
 * @interface TagUsageStats
 * @description Provides detailed usage metrics and trend information for tags
 */
export interface TagUsageStats {
  tag_id: string;
  tag_name: string;
  usage_count: number;
  unique_tasks: number;
  first_used: Date;
  last_used: Date;
  trend: 'increasing' | 'decreasing' | 'stable';
}

/**
 * Tag Service - Manages all tag-related operations
 *
 * @class TagService
 * @description Core service class providing comprehensive tag management functionality.
 * Handles tag CRUD operations, hierarchical structures, task associations, and usage analytics
 * with proper transaction handling and circular dependency prevention.
 */
export class TagService {
  /**
   * Creates a new TagService instance
   *
   * @param db Database connection instance for tag operations
   */
  constructor(private readonly db: DatabaseConnection) {}

  /**
   * Creates a new tag with optional parent relationship
   *
   * @param data Tag creation data including name, color, and optional parent
   * @returns Promise resolving to the created tag with generated ID
   *
   * @throws {ServiceError} TAG_CREATE_FAILED - When tag creation fails
   * @throws {Error} Tag with this name already exists - When name is not unique
   * @throws {Error} Parent tag not found - When specified parent_tag_id doesn't exist
   * @throws {Error} Would create circular hierarchy - When parent relationship creates a cycle
   *
   * @example
   * ```typescript
   * const tag = await tagService.createTag({
   *   name: 'High Priority',
   *   color: '#FF5722',
   *   description: 'Tasks requiring immediate attention'
   * });
   * ```
   *
   * @since 1.0.0
   */
  async createTag(data: CreateTagRequest): Promise<Tag> {
    const id = uuidv4();
    const now = new Date();

    const tag: Tag = {
      id,
      name: data.name,
      color: data.color ?? '#9E9E9E',
      description: data.description,
      parent_tag_id: data.parent_tag_id,
      created_at: now,
    };

    try {
      await this.db.transaction(async db => {
        const existingTag = await db.get('SELECT id FROM tags WHERE name = ?', [data.name]);
        if (existingTag) {
          throw new Error('Tag with this name already exists');
        }

        if (data.parent_tag_id) {
          const parentExists = await db.get('SELECT id FROM tags WHERE id = ?', [
            data.parent_tag_id,
          ]);
          if (!parentExists) {
            throw new Error('Parent tag not found');
          }

          if (await this.wouldCreateCircularHierarchy(data.parent_tag_id, id)) {
            throw new Error('Would create circular hierarchy');
          }
        }

        await db.run(
          `
          INSERT INTO tags (id, name, color, description, parent_tag_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
          [tag.id, tag.name, tag.color, tag.description, tag.parent_tag_id, tag.created_at]
        );
      });

      logger.info('Tag created successfully', { tagId: tag.id, name: tag.name });
      return tag;
    } catch (error) {
      logger.error('Failed to create tag', { error, data });
      throw TagService.createError('TAG_CREATE_FAILED', 'Failed to create tag', error);
    }
  }

  /**
   * Retrieves a single tag by its ID
   *
   * @param id Unique tag identifier
   * @returns Promise resolving to the tag if found, null otherwise
   *
   * @throws {ServiceError} TAG_FETCH_FAILED - When database query fails
   *
   * @example
   * ```typescript
   * const tag = await tagService.getTagById('tag-123');
   * if (tag) {
   *   logger.log(`Tag: ${String(String(tag.name))}`);
   * }
   * ```
   */
  async getTagById(id: string): Promise<Tag | null> {
    try {
      const tag = await this.db.queryOne<Tag>(
        `
        SELECT * FROM tags WHERE id = ?
      `,
        [id]
      );

      if (tag) {
        tag.created_at = new Date(tag.created_at);
      }

      return tag ?? null;
    } catch (error) {
      logger.error('Failed to get tag by ID', { error, id });
      throw TagService.createError('TAG_FETCH_FAILED', 'Failed to fetch tag', error);
    }
  }

  /**
   * Retrieves a tag by its unique name
   *
   * @param name Tag name to search for (case-sensitive)
   * @returns Promise resolving to the tag if found, null otherwise
   *
   * @throws {ServiceError} TAG_FETCH_FAILED - When database query fails
   *
   * @example
   * ```typescript
   * const tag = await tagService.getTagByName('Bug');
   * if (tag) {
   *   logger.log(`Found tag with ID: ${String(String(tag.id))}`);
   * }
   * ```
   */
  async getTagByName(name: string): Promise<Tag | null> {
    try {
      const tag = await this.db.queryOne<Tag>(
        `
        SELECT * FROM tags WHERE name = ?
      `,
        [name]
      );

      if (tag) {
        tag.created_at = new Date(tag.created_at);
      }

      return tag ?? null;
    } catch (error) {
      logger.error('Failed to get tag by name', { error, name });
      throw TagService.createError('TAG_FETCH_FAILED', 'Failed to fetch tag by name', error);
    }
  }

  /**
   * Retrieves tags with advanced filtering, pagination, and sorting
   *
   * @param options Comprehensive options for filtering, pagination, and sorting
   * @returns Promise resolving to array of tags matching the criteria
   *
   * @throws {ServiceError} TAGS_FETCH_FAILED - When database query fails
   *
   * @example
   * ```typescript
   * // Get root tags (no parent)
   * const rootTags = await tagService.getTags({
   *   has_parent: false,
   *   sortBy: 'name',
   *   sortOrder: 'asc'
   * });
   *
   * // Search tags by pattern
   * const bugTags = await tagService.getTags({
   *   name_pattern: 'bug',
   *   limit: 10
   * });
   * ```
   */
  async getTags(options: PaginationOptions & TagFilters = {}): Promise<Tag[]> {
    const {
      limit = 50,
      offset = 0,
      sortBy = 'name',
      sortOrder = 'asc',
      parent_tag_id,
      has_parent,
      color,
      name_pattern,
      search,
    } = options;

    try {
      let query = 'SELECT * FROM tags';
      const params: QueryParameters = [];
      const conditions: string[] = [];

      if (parent_tag_id !== undefined) {
        if (parent_tag_id === null || parent_tag_id === undefined) {
          conditions.push('parent_tag_id IS NULL');
        } else {
          conditions.push('parent_tag_id = ?');
          params.push(parent_tag_id);
        }
      }

      if (has_parent !== undefined) {
        if (has_parent) {
          conditions.push('parent_tag_id IS NOT NULL');
        } else {
          conditions.push('parent_tag_id IS NULL');
        }
      }

      if (color) {
        conditions.push('color = ?');
        params.push(color);
      }

      if (name_pattern) {
        conditions.push('name LIKE ?');
        params.push(`%${String(name_pattern)}%`);
      }

      if (search) {
        conditions.push('(name LIKE ? OR description LIKE ?)');
        params.push(`%${String(search)}%`, `%${String(search)}%`);
      }

      if (conditions.length > 0) {
        query += ` WHERE ${String(String(conditions.join(' AND ')))}`;
      }

      query += ` ORDER BY ${String(sortBy)} ${String(String(sortOrder.toUpperCase()))} LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const tags = await this.db.query<Tag>(query, params);
      tags.forEach(tag => (tag.created_at = new Date(tag.created_at)));

      return tags;
    } catch (error) {
      logger.error('Failed to get tags', { error, options });
      throw TagService.createError('TAGS_FETCH_FAILED', 'Failed to fetch tags', error);
    }
  }

  /**
   * Retrieves all root tags (tags without parents)
   *
   * @returns Promise resolving to array of root tags
   *
   * @throws {ServiceError} TAGS_FETCH_FAILED - When database query fails
   *
   * @example
   * ```typescript
   * const rootTags = await tagService.getRootTags();
   * logger.log(`Found ${String(String(rootTags.length))} root tags`);
   * ```
   */
  async getRootTags(): Promise<Tag[]> {
    return this.getTags({ has_parent: false });
  }

  /**
   * Retrieves all direct child tags of a parent tag
   *
   * @param parentId ID of the parent tag
   * @returns Promise resolving to array of child tags
   *
   * @throws {ServiceError} TAGS_FETCH_FAILED - When database query fails
   *
   * @example
   * ```typescript
   * const children = await tagService.getChildTags('parent-tag-123');
   * children.forEach(child => {
   *   logger.log(`Child tag: ${String(String(child.name))}`);
   * });
   * ```
   */
  async getChildTags(parentId: string): Promise<Tag[]> {
    return this.getTags({ parent_tag_id: parentId });
  }

  /**
   * Builds complete tag hierarchy tree structure
   *
   * @param rootTagId Optional specific root tag ID to start from
   * @returns Promise resolving to array of tag hierarchies with nested children
   *
   * @throws {ServiceError} TAG_HIERARCHY_FAILED - When hierarchy building fails
   *
   * @example
   * ```typescript
   * // Get entire tag hierarchy
   * const hierarchy = await tagService.getTagHierarchy();
   *
   * // Get hierarchy for specific root
   * const featureHierarchy = await tagService.getTagHierarchy('feature-tag-id');
   * ```
   */
  async getTagHierarchy(rootTagId?: string): Promise<TagHierarchy[]> {
    try {
      const rootTags = rootTagId
        ? ([await this.getTagById(rootTagId)].filter(Boolean) as Tag[])
        : await this.getRootTags();

      const hierarchies: TagHierarchy[] = [];

      await Promise.all(
        rootTags.map(async rootTag => {
          const hierarchy = await this.buildTagHierarchy(rootTag, 0);
          hierarchies.push(hierarchy);
        })
      );

      return hierarchies;
    } catch (error) {
      logger.error('Failed to get tag hierarchy', { error, rootTagId });
      throw TagService.createError('TAG_HIERARCHY_FAILED', 'Failed to build tag hierarchy', error);
    }
  }

  /**
   * Retrieves a tag with comprehensive usage statistics
   *
   * @param id Unique tag identifier
   * @returns Promise resolving to tag with statistics or null if not found
   *
   * @throws {ServiceError} TAG_FETCH_FAILED - When database query fails
   *
   * @example
   * ```typescript
   * const tagStats = await tagService.getTagWithStats('tag-123');
   * if (tagStats) {
   *   logger.log(`Tag "${String(String(tagStats.name))}" is used by ${String(String(tagStats.task_count))} tasks`);
   *   logger.log(`Last used: ${String(String(tagStats.last_used))}`);
   * }
   * ```
   */
  async getTagWithStats(id: string): Promise<TagWithStats | null> {
    try {
      const tag = await this.getTagById(id);
      if (!tag) return null;

      const [taskCount, childCount, usageStats] = await Promise.all([
        this.db.queryOne<{ count: number }>(
          `
          SELECT COUNT(DISTINCT task_id) as count 
          FROM task_tags 
          WHERE tag_id = ?
        `,
          [id]
        ),
        this.db.queryOne<{ count: number }>(
          `
          SELECT COUNT(*) as count 
          FROM tags 
          WHERE parent_tag_id = ?
        `,
          [id]
        ),
        this.db.queryOne<{ count: number; last_used: string }>(
          `
          SELECT 
            COUNT(*) as count,
            MAX(tt.created_at) as last_used
          FROM task_tags tt
          WHERE tt['tag_id'] = ?
        `,
          [id]
        ),
      ]);

      const tagWithStats: TagWithStats = {
        ...tag,
        task_count: taskCount?.count ?? 0,
        usage_count: usageStats?.count ?? 0,
        child_count: childCount?.count ?? 0,
        ...(usageStats?.last_used ? { last_used: new Date(usageStats.last_used) } : {}),
      };

      return tagWithStats;
    } catch (error) {
      logger.error('Failed to get tag with stats', { error, id });
      throw TagService.createError('TAG_FETCH_FAILED', 'Failed to fetch tag with stats', error);
    }
  }

  /**
   * Updates an existing tag with validation
   *
   * @param id Unique tag identifier
   * @param data Partial tag data to update (only provided fields will be changed)
   * @returns Promise resolving to the updated tag
   *
   * @throws {ServiceError} TAG_NOT_FOUND - When tag doesn't exist
   * @throws {ServiceError} TAG_NAME_EXISTS - When new name already exists
   * @throws {ServiceError} PARENT_TAG_NOT_FOUND - When new parent doesn't exist
   * @throws {ServiceError} CIRCULAR_HIERARCHY - When update would create circular dependency
   * @throws {ServiceError} TAG_UPDATE_FAILED - When update operation fails
   *
   * @example
   * ```typescript
   * const updated = await tagService.updateTag('tag-123', {
   *   name: 'Critical Bug',
   *   color: '#F44336'
   * });
   * ```
   */
  async updateTag(id: string, data: UpdateTagRequest): Promise<Tag> {
    try {
      const existingTag = await this.getTagById(id);
      if (!existingTag) {
        throw TagService.createError('TAG_NOT_FOUND', 'Tag not found', { id });
      }

      const updates: string[] = [];
      const params: QueryParameters = [];

      if (data.name !== undefined) {
        if (data.name !== existingTag.name) {
          const existingWithName = await this.getTagByName(data.name);
          if (existingWithName && existingWithName.id !== id) {
            throw TagService.createError('TAG_NAME_EXISTS', 'Tag with this name already exists');
          }
        }
        updates.push('name = ?');
        params.push(data.name);
      }

      if (data.color !== undefined) {
        updates.push('color = ?');
        params.push(data.color);
      }

      if (data.description !== undefined) {
        updates.push('description = ?');
        params.push(data.description);
      }

      if (data.parent_tag_id !== undefined) {
        if (data.parent_tag_id && data.parent_tag_id !== existingTag.parent_tag_id) {
          const parentExists = await this.getTagById(data.parent_tag_id);
          if (!parentExists) {
            throw TagService.createError('PARENT_TAG_NOT_FOUND', 'Parent tag not found');
          }

          if (await this.wouldCreateCircularHierarchy(data.parent_tag_id, id)) {
            throw TagService.createError('CIRCULAR_HIERARCHY', 'Would create circular hierarchy');
          }
        }
        updates.push('parent_tag_id = ?');
        params.push(data.parent_tag_id);
      }

      if (updates.length === 0) {
        return existingTag;
      }

      params.push(id);

      await this.db.execute(
        `
        UPDATE tags 
        SET ${String(String(updates.join(', ')))}
        WHERE id = ?
      `,
        params
      );

      const updatedTag = await this.getTagById(id);
      if (!updatedTag) {
        throw TagService.createError('TAG_UPDATE_FAILED', 'Tag disappeared after update');
      }

      logger.info('Tag updated successfully', { tagId: id });
      return updatedTag;
    } catch (error) {
      if (error instanceof Error && error.message.includes('TAG_')) {
        throw error;
      }
      logger.error('Failed to update tag', { error, id, data });
      throw TagService.createError('TAG_UPDATE_FAILED', 'Failed to update tag', error);
    }
  }

  /**
   * Deletes a tag with configurable child handling
   *
   * @param id Unique tag identifier
   * @param reassignToParent If true, reassigns children to deleted tag's parent; if false, deletes children recursively
   * @returns Promise that resolves when deletion is complete
   *
   * @throws {ServiceError} TAG_NOT_FOUND - When tag doesn't exist
   * @throws {ServiceError} TAG_DELETE_FAILED - When deletion fails
   *
   * @description This method:
   * - Removes all task associations
   * - Handles child tags based on reassignToParent parameter
   * - Maintains hierarchy integrity
   *
   * @example
   * ```typescript
   * // Delete tag and reassign children to parent
   * await tagService.deleteTag('tag-123', true);
   *
   * // Delete tag and all its children
   * await tagService.deleteTag('tag-123', false);
   * ```
   */
  async deleteTag(id: string, reassignToParent: boolean = true): Promise<void> {
    try {
      const tag = await this.getTagById(id);
      if (!tag) {
        throw TagService.createError('TAG_NOT_FOUND', 'Tag not found', { id });
      }

      if (!reassignToParent) {
        // Delete children recursively first
        const childTags = await this.getChildTags(id);
        await Promise.all(
          childTags.map(async child => {
            await this.deleteTag(child.id, false);
          })
        );
      }

      await this.db.transaction(async db => {
        if (reassignToParent) {
          await db.run(
            `
            UPDATE tags 
            SET parent_tag_id = ? 
            WHERE parent_tag_id = ?
          `,
            [tag.parent_tag_id, id]
          );
        }

        await db.run('DELETE FROM task_tags WHERE tag_id = ?', [id]);
        await db.run('DELETE FROM tags WHERE id = ?', [id]);
      });

      logger.info('Tag deleted successfully', { tagId: id, reassignToParent });
    } catch (error) {
      if (error instanceof Error && error.message.includes('TAG_')) {
        throw error;
      }
      logger.error('Failed to delete tag', { error, id });
      throw TagService.createError('TAG_DELETE_FAILED', 'Failed to delete tag', error);
    }
  }

  /**
   * Associates a tag with a task
   *
   * @param taskId ID of the task to tag
   * @param tagId ID of the tag to apply
   * @returns Promise resolving to the created association
   *
   * @throws {ServiceError} TAG_ASSIGN_FAILED - When assignment fails
   * @throws {Error} Task not found - When task doesn't exist
   * @throws {Error} Tag not found - When tag doesn't exist
   * @throws {Error} Tag already assigned to task - When association already exists
   *
   * @example
   * ```typescript
   * const association = await tagService.addTagToTask('task-123', 'bug-tag-id');
   * logger.log('Tag applied successfully');
   * ```
   */
  async addTagToTask(taskId: string, tagId: string): Promise<TaskTag> {
    const id = uuidv4();
    const now = new Date();

    try {
      await this.db.transaction(async db => {
        const [taskExists, tagExists, existingRelation] = await Promise.all([
          db.get('SELECT id FROM tasks WHERE id = ?', [taskId]),
          db.get('SELECT id FROM tags WHERE id = ?', [tagId]),
          db.get('SELECT task_id FROM task_tags WHERE task_id = ? AND tag_id = ?', [taskId, tagId]),
        ]);

        if (!taskExists) {
          throw new Error('Task not found');
        }
        if (!tagExists) {
          throw new Error('Tag not found');
        }
        if (existingRelation) {
          throw new Error('Tag already assigned to task');
        }

        await db.run(
          `
          INSERT INTO task_tags (task_id, tag_id, created_at)
          VALUES (?, ?, ?)
        `,
          [taskId, tagId, now]
        );
      });

      const taskTag: TaskTag = {
        id, // Generate ID for interface compatibility
        task_id: taskId,
        tag_id: tagId,
        created_at: now,
      };

      logger.info('Tag added to task successfully', { taskId, tagId });
      return taskTag;
    } catch (error) {
      logger.error('Failed to add tag to task', { error, taskId, tagId });
      throw TagService.createError('TAG_ASSIGN_FAILED', 'Failed to assign tag to task', error);
    }
  }

  /**
   * Removes a tag association from a task
   *
   * @param taskId ID of the task
   * @param tagId ID of the tag to remove
   * @returns Promise that resolves when association is removed
   *
   * @throws {ServiceError} TAG_ASSIGNMENT_NOT_FOUND - When association doesn't exist
   * @throws {ServiceError} TAG_REMOVE_FAILED - When removal fails
   *
   * @example
   * ```typescript
   * await tagService.removeTagFromTask('task-123', 'bug-tag-id');
   * ```
   */
  async removeTagFromTask(taskId: string, tagId: string): Promise<void> {
    try {
      const result = await this.db.execute(
        `
        DELETE FROM task_tags 
        WHERE task_id = ? AND tag_id = ?
      `,
        [taskId, tagId]
      );

      if (result.changes === 0) {
        throw TagService.createError('TAG_ASSIGNMENT_NOT_FOUND', 'Tag assignment not found');
      }

      logger.info('Tag removed from task successfully', { taskId, tagId });
    } catch (error) {
      if (error instanceof Error && error.message.includes('TAG_')) {
        throw error;
      }
      logger.error('Failed to remove tag from task', { error, taskId, tagId });
      throw TagService.createError('TAG_REMOVE_FAILED', 'Failed to remove tag from task', error);
    }
  }

  /**
   * Retrieves all tags associated with a task
   *
   * @param taskId ID of the task
   * @returns Promise resolving to array of tags
   *
   * @throws {ServiceError} TAGS_FETCH_FAILED - When query fails
   *
   * @example
   * ```typescript
   * const tags = await tagService.getTaskTags('task-123');
   * tags.forEach(tag => {
   *   logger.log(`Task has tag: ${String(String(tag.name))}`);
   * });
   * ```
   */
  async getTaskTags(taskId: string): Promise<Tag[]> {
    try {
      const tags = await this.db.query<Tag>(
        `
        SELECT t.* FROM tags t
        INNER JOIN task_tags tt ON t['id'] = tt.tag_id
        WHERE tt.task_id = ?
        ORDER BY t.name ASC
      `,
        [taskId]
      );

      tags.forEach(tag => (tag.created_at = new Date(tag.created_at)));
      return tags;
    } catch (error) {
      logger.error('Failed to get task tags', { error, taskId });
      throw TagService.createError('TAGS_FETCH_FAILED', 'Failed to fetch task tags', error);
    }
  }

  /**
   * Retrieves all tasks tagged with a specific tag
   *
   * @param tagId ID of the tag
   * @param includeChildren Whether to include tasks tagged with child tags
   * @returns Promise resolving to array of task IDs
   *
   * @throws {ServiceError} TAGGED_TASKS_FETCH_FAILED - When query fails
   *
   * @example
   * ```typescript
   * // Get tasks with specific tag only
   * const taskIds = await tagService.getTaggedTasks('bug-tag-id');
   *
   * // Include tasks with child tags
   * const allBugTasks = await tagService.getTaggedTasks('bug-tag-id', true);
   * ```
   */
  async getTaggedTasks(tagId: string, includeChildren: boolean = false): Promise<string[]> {
    try {
      let tagIds = [tagId];

      if (includeChildren) {
        const childTagIds = await this.getAllChildTagIds(tagId);
        tagIds = tagIds.concat(childTagIds);
      }

      const placeholders = tagIds.map(() => '?').join(',');
      const taskIds = await this.db.query<{ task_id: string }>(
        `
        SELECT DISTINCT task_id FROM task_tags 
        WHERE tag_id IN (${String(placeholders)})
      `,
        tagIds
      );

      return taskIds.map(row => row.task_id);
    } catch (error) {
      logger.error('Failed to get tagged tasks', { error, tagId, includeChildren });
      throw TagService.createError(
        'TAGGED_TASKS_FETCH_FAILED',
        'Failed to fetch tagged tasks',
        error
      );
    }
  }

  /**
   * Retrieves tag usage statistics over a time period
   *
   * @param options Statistics options including time period and result limit
   * @returns Promise resolving to array of usage statistics with trends
   *
   * @throws {ServiceError} TAG_STATS_FAILED - When statistics calculation fails
   *
   * @example
   * ```typescript
   * // Get top 20 tags used in last 30 days
   * const stats = await tagService.getTagUsageStats({
   *   days: 30,
   *   limit: 20
   * });
   *
   * stats.forEach(stat => {
   *   logger.log(`${String(String(stat.tag_name))}: ${String(String(stat.usage_count))} uses (${String(String(stat.trend))})`);
   * });
   * ```
   */
  async getTagUsageStats(
    options: { days?: number; limit?: number } = {}
  ): Promise<TagUsageStats[]> {
    const { days = 30, limit = 50 } = options;

    try {
      const dateThreshold = new Date();
      dateThreshold.setDate(dateThreshold.getDate() - days);

      const stats = await this.db.query<{
        tag_id: string;
        tag_name: string;
        usage_count: number;
        unique_tasks: number;
        first_used: string;
        last_used: string;
      }>(
        `
        SELECT 
          t.id as tag_id,
          t.name as tag_name,
          COUNT(tt.task_id) as usage_count,
          COUNT(DISTINCT tt.task_id) as unique_tasks,
          MIN(tt.created_at) as first_used,
          MAX(tt.created_at) as last_used
        FROM tags t
        LEFT JOIN task_tags tt ON t['id'] = tt.tag_id
        WHERE tt.created_at >= ? OR tt.created_at IS NULL
        GROUP BY t.id, t.name
        ORDER BY usage_count DESC
        LIMIT ?
      `,
        [dateThreshold, limit]
      );

      return stats.map(stat => ({
        tag_id: stat.tag_id,
        tag_name: stat.tag_name,
        usage_count: stat.usage_count,
        unique_tasks: stat.unique_tasks,
        first_used: stat.first_used ? new Date(stat.first_used) : new Date(),
        last_used: stat.last_used ? new Date(stat.last_used) : new Date(),
        trend: TagService.calculateTrend(stat.usage_count, days), // Simplified trend calculation
      }));
    } catch (error) {
      logger.error('Failed to get tag usage stats', { error, options });
      throw TagService.createError('TAG_STATS_FAILED', 'Failed to get tag usage statistics', error);
    }
  }

  /**
   * Retrieves a tag with its complete child hierarchy
   *
   * @param id Unique tag identifier
   * @returns Promise resolving to tag hierarchy or null if not found
   *
   * @throws {ServiceError} TAG_FETCH_FAILED - When query fails
   *
   * @example
   * ```typescript
   * const hierarchy = await tagService.getTagWithChildren('parent-tag-id');
   * if (hierarchy) {
   *   logger.log(`Tag "${String(String(hierarchy.name))}" has ${String(String(hierarchy.children.length))} children`);
   * }
   * ```
   */
  async getTagWithChildren(id: string): Promise<TagHierarchy | null> {
    try {
      const tag = await this.getTagById(id);
      if (!tag) return null;

      return await this.buildTagHierarchy(tag, 0);
    } catch (error) {
      logger.error('Failed to get tag with children', { error, id });
      throw TagService.createError('TAG_FETCH_FAILED', 'Failed to fetch tag with children', error);
    }
  }

  /**
   * Retrieves the complete path from root to specified tag
   *
   * @param id Unique tag identifier
   * @returns Promise resolving to array of tags from root to target
   *
   * @throws {ServiceError} TAG_PATH_FAILED - When path retrieval fails
   *
   * @example
   * ```typescript
   * const path = await tagService.getTagPath('child-tag-id');
   * logger.log('Tag path: ' + path.map(t => t.name).join(' > '));
   * // Output: "Feature > Authentication > OAuth"
   * ```
   */
  async getTagPath(id: string): Promise<Tag[]> {
    try {
      const path: Tag[] = [];
      let currentId: string | null | undefined = id;

      // eslint-disable-next-line no-await-in-loop
      while (currentId) {
        // eslint-disable-next-line no-await-in-loop
        const tag = await this.getTagById(currentId);
        if (!tag) break;

        path.unshift(tag); // Add to beginning for root-to-leaf order
        currentId = tag.parent_tag_id;
      }

      return path;
    } catch (error) {
      logger.error('Failed to get tag path', { error, id });
      throw TagService.createError('TAG_PATH_FAILED', 'Failed to get tag path', error);
    }
  }

  /**
   * Retrieves the complete tag tree with optional usage counts
   *
   * @param includeUsageCount Whether to include task count for each tag
   * @returns Promise resolving to array of root tag hierarchies
   *
   * @throws {ServiceError} TAG_TREE_FAILED - When tree building fails
   *
   * @example
   * ```typescript
   * // Get tag tree with usage counts
   * const tree = await tagService.getTagTree(true);
   * tree.forEach(root => {
   *   logger.log(`${String(String(root.name))} (${String(String(root.task_count))} tasks)`);
   * });
   * ```
   */
  async getTagTree(includeUsageCount: boolean = false): Promise<TagHierarchy[]> {
    try {
      const rootTags = await this.getRootTags();

      const hierarchyPromises = rootTags.map(async rootTag => {
        const hierarchy = await this.buildTagHierarchy(rootTag, 0);

        if (includeUsageCount) {
          const addUsageCount = async (node: TagHierarchy) => {
            const usageStats = await this.getTagUsageStats({ limit: 1 });
            node.task_count =
              usageStats.length > 0 && usageStats[0] ? usageStats[0].usage_count : 0;

            await Promise.all(node.children.map(child => addUsageCount(child)));
          };

          await addUsageCount(hierarchy);
        }

        return hierarchy;
      });

      const hierarchies = await Promise.all(hierarchyPromises);

      return hierarchies;
    } catch (error) {
      logger.error('Failed to get tag tree', { error });
      throw TagService.createError('TAG_TREE_FAILED', 'Failed to get tag tree', error);
    }
  }

  /**
   * Retrieves the most popular tags by usage
   *
   * @param options Filtering options including board scope and time period
   * @returns Promise resolving to array of tags with statistics sorted by usage
   *
   * @throws {ServiceError} POPULAR_TAGS_FAILED - When query fails
   *
   * @example
   * ```typescript
   * // Get top 10 tags for a specific board in last week
   * const popular = await tagService.getPopularTags({
   *   board_id: 'board-123',
   *   days: 7,
   *   limit: 10
   * });
   * ```
   */
  async getPopularTags(
    options: { limit?: number; board_id?: string; days?: number } = {}
  ): Promise<TagWithStats[]> {
    const { limit = 20, board_id, days = 30 } = options;

    try {
      const dateThreshold = new Date();
      dateThreshold.setDate(dateThreshold.getDate() - days);

      let query = `
        SELECT 
          t.*,
          COUNT(DISTINCT tt.task_id) as task_count,
          COUNT(tt.task_id) as usage_count,
          MAX(tt.created_at) as last_used,
          (SELECT COUNT(*) FROM tags WHERE parent_tag_id = t.id) as child_count
        FROM tags t
        LEFT JOIN task_tags tt ON t['id'] = tt.tag_id
      `;

      const params: QueryParameters = [];
      const conditions: string[] = [];

      if (board_id) {
        query += ' LEFT JOIN tasks task ON tt.task_id = task.id';
        conditions.push('task.board_id = ?');
        params.push(board_id);
      }

      conditions.push('(tt.created_at >= ? OR tt.created_at IS NULL)');
      params.push(dateThreshold);

      if (conditions.length > 0) {
        query += ` WHERE ${String(String(conditions.join(' AND ')))}`;
      }

      query += `
        GROUP BY t.id
        ORDER BY usage_count DESC
        LIMIT ?
      `;
      params.push(limit);

      const popularTags = await this.db.query<TagWithStats & { last_used: string | null }>(
        query,
        params
      );

      return popularTags.map(tag => {
        const result: TagWithStats = {
          ...tag,
          created_at: new Date(tag.created_at),
        };
        if (tag.last_used) {
          result.last_used = new Date(tag.last_used);
        }
        return result;
      });
    } catch (error) {
      logger.error('Failed to get popular tags', { error, options });
      throw TagService.createError('POPULAR_TAGS_FAILED', 'Failed to get popular tags', error);
    }
  }

  /**
   * Retrieves comprehensive tag system statistics
   *
   * @param boardId Optional board ID to scope statistics
   * @returns Promise resolving to tag system statistics
   *
   * @throws {ServiceError} TAG_STATS_FAILED - When statistics calculation fails
   *
   * @example
   * ```typescript
   * const stats = await tagService.getTagStats();
   * logger.log(`Total tags: ${String(String(stats.total))}`);
   * logger.log(`Root tags: ${String(String(stats.root_tags))}`);
   * logger.log(`Max hierarchy depth: ${String(String(stats.max_depth))}`);
   * logger.log(`Average tasks per tag: ${String(String(stats.avg_tasks_per_tag))}`);
   * ```
   */
  async getTagStats(boardId?: string): Promise<{
    total: number;
    root_tags: number;
    leaf_tags: number;
    max_depth: number;
    avg_tasks_per_tag: number;
    most_used: TagWithStats[];
  }> {
    try {
      let baseQuery = '';
      const params: QueryParameters = [];

      if (boardId) {
        baseQuery = `
          FROM tags t
          WHERE EXISTS (
            SELECT 1 FROM task_tags tt
            JOIN tasks task ON tt.task_id = task.id
            WHERE tt.tag_id = t.id AND task.board_id = ?
          )
        `;
        params.push(boardId);
      } else {
        baseQuery = 'FROM tags t';
      }

      const [totalResult, rootResult, leafResult, depthResult, avgTasksResult] = await Promise.all([
        this.db.queryOne<{ count: number }>(
          `SELECT COUNT(*) as count ${String(baseQuery)}`,
          params
        ),
        this.db.queryOne<{ count: number }>(
          `SELECT COUNT(*) as count ${String(baseQuery)} WHERE parent_tag_id IS NULL`,
          params
        ),
        this.db.queryOne<{ count: number }>(
          `
          SELECT COUNT(*) as count ${String(baseQuery)} 
          WHERE NOT EXISTS (SELECT 1 FROM tags child WHERE child.parent_tag_id = t.id)
        `,
          params
        ),
        this.db.queryOne<{ max_depth: number }>(
          `
          WITH RECURSIVE tag_depth AS (
            SELECT id, parent_tag_id, 0 as depth FROM tags WHERE parent_tag_id IS NULL
            UNION ALL
            SELECT t.id, t.parent_tag_id, td.depth + 1
            FROM tags t
            JOIN tag_depth td ON t.parent_tag_id = td.id
          )
          SELECT MAX(depth) as max_depth FROM tag_depth
        `,
          []
        ),
        this.db.queryOne<{ avg_tasks: number }>(
          `
          SELECT AVG(task_count) as avg_tasks FROM (
            SELECT COUNT(DISTINCT tt.task_id) as task_count
            ${String(baseQuery)}
            LEFT JOIN task_tags tt ON t.id = tt.tag_id
            GROUP BY t.id
          )
        `,
          params
        ),
      ]);

      const mostUsedOptions = boardId ? { board_id: boardId, limit: 5 } : { limit: 5 };
      const most_used = await this.getPopularTags(mostUsedOptions);

      return {
        total: totalResult?.count ?? 0,
        root_tags: rootResult?.count ?? 0,
        leaf_tags: leafResult?.count ?? 0,
        max_depth: depthResult?.max_depth ?? 0,
        avg_tasks_per_tag: avgTasksResult?.avg_tasks ?? 0,
        most_used,
      };
    } catch (error) {
      logger.error('Failed to get tag stats', { error, boardId });
      throw TagService.createError('TAG_STATS_FAILED', 'Failed to get tag statistics', error);
    }
  }

  /**
   * Merges one tag into another, transferring all associations
   *
   * @param sourceTagId ID of the tag to be merged (will be deleted)
   * @param targetTagId ID of the tag to merge into
   * @returns Promise that resolves when merge is complete
   *
   * @throws {ServiceError} SOURCE_TAG_NOT_FOUND - When source tag doesn't exist
   * @throws {ServiceError} TARGET_TAG_NOT_FOUND - When target tag doesn't exist
   * @throws {ServiceError} TAG_MERGE_FAILED - When merge operation fails
   *
   * @description This method:
   * - Transfers all task associations from source to target
   * - Updates child tags to point to target
   * - Deletes the source tag
   * - Prevents duplicate associations
   *
   * @example
   * ```typescript
   * // Merge "bug-critical" into "critical"
   * await tagService.mergeTags('bug-critical-id', 'critical-id');
   * ```
   */
  async mergeTags(sourceTagId: string, targetTagId: string): Promise<void> {
    try {
      const [sourceTag, targetTag] = await Promise.all([
        this.getTagById(sourceTagId),
        this.getTagById(targetTagId),
      ]);

      if (!sourceTag) {
        throw TagService.createError('SOURCE_TAG_NOT_FOUND', 'Source tag not found');
      }
      if (!targetTag) {
        throw TagService.createError('TARGET_TAG_NOT_FOUND', 'Target tag not found');
      }

      await this.db.transaction(async db => {
        await db.run(
          `
          UPDATE OR IGNORE task_tags 
          SET tag_id = ? 
          WHERE tag_id = ?
        `,
          [targetTagId, sourceTagId]
        );

        await db.run(
          `
          DELETE FROM task_tags 
          WHERE tag_id = ?
        `,
          [sourceTagId]
        );

        await db.run(
          `
          UPDATE tags 
          SET parent_tag_id = ? 
          WHERE parent_tag_id = ?
        `,
          [targetTagId, sourceTagId]
        );

        await db.run('DELETE FROM tags WHERE id = ?', [sourceTagId]);
      });

      logger.info('Tags merged successfully', { sourceTagId, targetTagId });
    } catch (error) {
      if (error instanceof Error && error.message.includes('TAG_')) {
        throw error;
      }
      logger.error('Failed to merge tags', { error, sourceTagId, targetTagId });
      throw TagService.createError('TAG_MERGE_FAILED', 'Failed to merge tags', error);
    }
  }

  /**
   * Recursively builds tag hierarchy structure
   *
   * @private
   * @param tag Root tag to build from
   * @param depth Current depth level
   * @returns Promise resolving to tag hierarchy with children
   */
  private async buildTagHierarchy(tag: Tag, depth: number): Promise<TagHierarchy> {
    const childTags = await this.getChildTags(tag.id);
    const taskCount = await this.getTaskCount(tag.id);

    const children: TagHierarchy[] = [];
    await Promise.all(
      childTags.map(async child => {
        const childHierarchy = await this.buildTagHierarchy(child, depth + 1);
        children.push(childHierarchy);
      })
    );

    return {
      ...tag,
      children,
      depth,
      task_count: taskCount,
    };
  }

  /**
   * Gets the count of tasks associated with a tag
   *
   * @private
   * @param tagId Tag identifier
   * @returns Promise resolving to task count
   */
  private async getTaskCount(tagId: string): Promise<number> {
    const result = await this.db.queryOne<{ count: number }>(
      `
      SELECT COUNT(DISTINCT task_id) as count 
      FROM task_tags 
      WHERE tag_id = ?
    `,
      [tagId]
    );

    return result?.count ?? 0;
  }

  /**
   * Recursively retrieves all descendant tag IDs
   *
   * @private
   * @param tagId Parent tag identifier
   * @returns Promise resolving to array of all descendant tag IDs
   */
  private async getAllChildTagIds(tagId: string): Promise<string[]> {
    const childIds: string[] = [];
    const directChildren = await this.getChildTags(tagId);

    // Add direct children
    for (const child of directChildren) {
      childIds.push(child.id);

      // Recursively get all descendants
      const descendantIds = await this.getAllChildTagIds(child.id);
      childIds.push(...descendantIds);
    }

    return childIds;
  }

  /**
   * Checks if setting a parent would create a circular dependency
   *
   * @private
   * @param parentId Proposed parent tag ID
   * @param childId Tag that would become a child
   * @returns Promise resolving to true if circular dependency would be created
   *
   * @description Uses depth-first search to detect cycles in the tag hierarchy.
   * This prevents infinite loops and ensures hierarchy integrity.
   */
  private async wouldCreateCircularHierarchy(parentId: string, childId: string): Promise<boolean> {
    const visited = new Set<string>();
    const stack = [parentId];

    while (stack.length > 0) {
      const currentId = stack.pop()!;

      if (currentId === childId) {
        return true;
      }

      if (visited.has(currentId)) {
        continue;
      }

      visited.add(currentId);

      // eslint-disable-next-line no-await-in-loop
      const parent = await this.getTagById(currentId);
      if (parent?.parent_tag_id) {
        stack.push(parent.parent_tag_id);
      }
    }

    return false;
  }

  /**
   * Calculates usage trend based on count and time period
   *
   * @private
   * @param usageCount Total usage count
   * @param days Number of days in the period
   * @returns Trend classification
   *
   * @description Simplified trend calculation based on average daily usage.
   * In production, this would compare with historical data.
   */
  private static calculateTrend(
    usageCount: number,
    days: number
  ): 'increasing' | 'decreasing' | 'stable' {
    // Simplified trend calculation - in reality, you'd compare with previous periods
    const avgUsagePerDay = usageCount / days;
    if (avgUsagePerDay > 1) return 'increasing';
    if (avgUsagePerDay < 0.5) return 'decreasing';
    return 'stable';
  }

  /**
   * Creates a standardized service error with proper error codes and status codes
   *
   * @private
   * @param code Error code identifier for categorization
   * @param message Human-readable error message
   * @param originalError Optional original error for debugging context
   * @returns Standardized ServiceError with status code and details
   */
  private static createError(code: string, message: string, originalError?: unknown): ServiceError {
    const error = new Error(message) as ServiceError;
    error.code = code;
    error.statusCode = this.getStatusCodeForError(code);
    error.details = originalError as ServiceError['details'];
    return error;
  }

  /**
   * Maps error codes to appropriate HTTP status codes
   *
   * @private
   * @param code Error code
   * @returns HTTP status code (404 for not found, 400 for validation, 500 for server errors)
   */
  private static getStatusCodeForError(code: string): number {
    switch (code) {
      case 'TAG_NOT_FOUND':
      case 'PARENT_TAG_NOT_FOUND':
      case 'SOURCE_TAG_NOT_FOUND':
      case 'TARGET_TAG_NOT_FOUND':
      case 'TAG_ASSIGNMENT_NOT_FOUND':
        return 404;
      case 'TAG_NAME_EXISTS':
      case 'CIRCULAR_HIERARCHY':
        return 400;
      case 'TAG_CREATE_FAILED':
      case 'TAG_UPDATE_FAILED':
      case 'TAG_DELETE_FAILED':
      case 'TAG_ASSIGN_FAILED':
      case 'TAG_REMOVE_FAILED':
      case 'TAG_MERGE_FAILED':
      case 'TAG_STATS_FAILED':
        return 500;
      case 'TAG_FETCH_FAILED':
      case 'TAGS_FETCH_FAILED':
      case 'TAG_HIERARCHY_FAILED':
      case 'TAGGED_TASKS_FETCH_FAILED':
        return 500;
      default:
        return 500;
    }
  }
}
