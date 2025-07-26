import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/utils/logger';
import type { DatabaseConnection } from '@/database/connection';
import type {
  Tag,
  TaskTag,
  ServiceError,
  PaginationOptions,
  FilterOptions,
} from '@/types';

export interface CreateTagRequest {
  name: string;
  color?: string;
  description?: string;
  parent_tag_id?: string;
}

export interface UpdateTagRequest {
  name?: string;
  color?: string;
  description?: string;
  parent_tag_id?: string;
}

export interface TagFilters extends FilterOptions {
  parent_tag_id?: string;
  has_parent?: boolean;
  color?: string;
  name_pattern?: string;
}

export interface TagHierarchy extends Tag {
  children: TagHierarchy[];
  depth: number;
  task_count: number;
}

export interface TagWithStats extends Tag {
  task_count: number;
  usage_count: number;
  last_used?: Date;
  child_count: number;
}

export interface TagUsageStats {
  tag_id: string;
  tag_name: string;
  usage_count: number;
  unique_tasks: number;
  first_used: Date;
  last_used: Date;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export class TagService {
  constructor(private db: DatabaseConnection) {}

  async createTag(data: CreateTagRequest): Promise<Tag> {
    const id = uuidv4();
    const now = new Date();
    
    const tag: Tag = {
      id,
      name: data.name,
      color: data.color || '#9E9E9E',
      description: data.description,
      parent_tag_id: data.parent_tag_id,
      created_at: now,
    };

    try {
      await this.db.transaction(async (db) => {
        const existingTag = await db.get('SELECT id FROM tags WHERE name = ?', [data.name]);
        if (existingTag) {
          throw new Error('Tag with this name already exists');
        }

        if (data.parent_tag_id) {
          const parentExists = await db.get('SELECT id FROM tags WHERE id = ?', [data.parent_tag_id]);
          if (!parentExists) {
            throw new Error('Parent tag not found');
          }

          if (await this.wouldCreateCircularHierarchy(data.parent_tag_id, id)) {
            throw new Error('Would create circular hierarchy');
          }
        }

        await db.run(`
          INSERT INTO tags (id, name, color, description, parent_tag_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [tag.id, tag.name, tag.color, tag.description, tag.parent_tag_id, tag.created_at]);
      });

      logger.info('Tag created successfully', { tagId: tag.id, name: tag.name });
      return tag;
    } catch (error) {
      logger.error('Failed to create tag', { error, data });
      throw this.createError('TAG_CREATE_FAILED', 'Failed to create tag', error);
    }
  }

  async getTagById(id: string): Promise<Tag | null> {
    try {
      const tag = await this.db.queryOne<Tag>(`
        SELECT * FROM tags WHERE id = ?
      `, [id]);

      if (tag) {
        tag.created_at = new Date(tag.created_at);
      }

      return tag || null;
    } catch (error) {
      logger.error('Failed to get tag by ID', { error, id });
      throw this.createError('TAG_FETCH_FAILED', 'Failed to fetch tag', error);
    }
  }

  async getTagByName(name: string): Promise<Tag | null> {
    try {
      const tag = await this.db.queryOne<Tag>(`
        SELECT * FROM tags WHERE name = ?
      `, [name]);

      if (tag) {
        tag.created_at = new Date(tag.created_at);
      }

      return tag || null;
    } catch (error) {
      logger.error('Failed to get tag by name', { error, name });
      throw this.createError('TAG_FETCH_FAILED', 'Failed to fetch tag by name', error);
    }
  }

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
      const params: any[] = [];
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
        params.push(`%${name_pattern}%`);
      }

      if (search) {
        conditions.push('(name LIKE ? OR description LIKE ?)');
        params.push(`%${search}%`, `%${search}%`);
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      query += ` ORDER BY ${sortBy} ${sortOrder.toUpperCase()} LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const tags = await this.db.query<Tag>(query, params);
      tags.forEach(tag => tag.created_at = new Date(tag.created_at));

      return tags;
    } catch (error) {
      logger.error('Failed to get tags', { error, options });
      throw this.createError('TAGS_FETCH_FAILED', 'Failed to fetch tags', error);
    }
  }

  async getRootTags(): Promise<Tag[]> {
    return this.getTags({ parent_tag_id: undefined });
  }

  async getChildTags(parentId: string): Promise<Tag[]> {
    return this.getTags({ parent_tag_id: parentId });
  }

  async getTagHierarchy(rootTagId?: string): Promise<TagHierarchy[]> {
    try {
      const rootTags = rootTagId 
        ? [await this.getTagById(rootTagId)].filter(Boolean) as Tag[]
        : await this.getRootTags();

      const hierarchies: TagHierarchy[] = [];

      for (const rootTag of rootTags) {
        const hierarchy = await this.buildTagHierarchy(rootTag, 0);
        hierarchies.push(hierarchy);
      }

      return hierarchies;
    } catch (error) {
      logger.error('Failed to get tag hierarchy', { error, rootTagId });
      throw this.createError('TAG_HIERARCHY_FAILED', 'Failed to build tag hierarchy', error);
    }
  }

  async getTagWithStats(id: string): Promise<TagWithStats | null> {
    try {
      const tag = await this.getTagById(id);
      if (!tag) return null;

      const [taskCount, childCount, usageStats] = await Promise.all([
        this.db.queryOne<{ count: number }>(`
          SELECT COUNT(DISTINCT task_id) as count 
          FROM task_tags 
          WHERE tag_id = ?
        `, [id]),
        this.db.queryOne<{ count: number }>(`
          SELECT COUNT(*) as count 
          FROM tags 
          WHERE parent_tag_id = ?
        `, [id]),
        this.db.queryOne<{ count: number; last_used: string }>(`
          SELECT 
            COUNT(*) as count,
            MAX(tt.created_at) as last_used
          FROM task_tags tt
          WHERE tt.tag_id = ?
        `, [id])
      ]);

      const tagWithStats: TagWithStats = {
        ...tag,
        task_count: taskCount?.count || 0,
        usage_count: usageStats?.count || 0,
        last_used: usageStats?.last_used ? new Date(usageStats.last_used) : undefined,
        child_count: childCount?.count || 0,
      };
      
      return tagWithStats;
    } catch (error) {
      logger.error('Failed to get tag with stats', { error, id });
      throw this.createError('TAG_FETCH_FAILED', 'Failed to fetch tag with stats', error);
    }
  }

  async updateTag(id: string, data: UpdateTagRequest): Promise<Tag> {
    try {
      const existingTag = await this.getTagById(id);
      if (!existingTag) {
        throw this.createError('TAG_NOT_FOUND', 'Tag not found', { id });
      }

      const updates: string[] = [];
      const params: any[] = [];

      if (data.name !== undefined) {
        if (data.name !== existingTag.name) {
          const existingWithName = await this.getTagByName(data.name);
          if (existingWithName && existingWithName.id !== id) {
            throw this.createError('TAG_NAME_EXISTS', 'Tag with this name already exists');
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
            throw this.createError('PARENT_TAG_NOT_FOUND', 'Parent tag not found');
          }

          if (await this.wouldCreateCircularHierarchy(data.parent_tag_id, id)) {
            throw this.createError('CIRCULAR_HIERARCHY', 'Would create circular hierarchy');
          }
        }
        updates.push('parent_tag_id = ?');
        params.push(data.parent_tag_id);
      }

      if (updates.length === 0) {
        return existingTag;
      }

      params.push(id);

      await this.db.execute(`
        UPDATE tags 
        SET ${updates.join(', ')}
        WHERE id = ?
      `, params);

      const updatedTag = await this.getTagById(id);
      if (!updatedTag) {
        throw this.createError('TAG_UPDATE_FAILED', 'Tag disappeared after update');
      }

      logger.info('Tag updated successfully', { tagId: id });
      return updatedTag;
    } catch (error) {
      if (error instanceof Error && error.message.includes('TAG_')) {
        throw error;
      }
      logger.error('Failed to update tag', { error, id, data });
      throw this.createError('TAG_UPDATE_FAILED', 'Failed to update tag', error);
    }
  }

  async deleteTag(id: string, reassignToParent: boolean = true): Promise<void> {
    try {
      const tag = await this.getTagById(id);
      if (!tag) {
        throw this.createError('TAG_NOT_FOUND', 'Tag not found', { id });
      }

      await this.db.transaction(async (db) => {
        if (reassignToParent) {
          await db.run(`
            UPDATE tags 
            SET parent_tag_id = ? 
            WHERE parent_tag_id = ?
          `, [tag.parent_tag_id, id]);
        } else {
          const childTags = await this.getChildTags(id);
          for (const child of childTags) {
            await this.deleteTag(child.id, false);
          }
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
      throw this.createError('TAG_DELETE_FAILED', 'Failed to delete tag', error);
    }
  }

  async addTagToTask(taskId: string, tagId: string): Promise<TaskTag> {
    const id = uuidv4();
    const now = new Date();

    try {
      await this.db.transaction(async (db) => {
        const [taskExists, tagExists, existingRelation] = await Promise.all([
          db.get('SELECT id FROM tasks WHERE id = ?', [taskId]),
          db.get('SELECT id FROM tags WHERE id = ?', [tagId]),
          db.get('SELECT id FROM task_tags WHERE task_id = ? AND tag_id = ?', [taskId, tagId])
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

        await db.run(`
          INSERT INTO task_tags (id, task_id, tag_id, created_at)
          VALUES (?, ?, ?, ?)
        `, [id, taskId, tagId, now]);
      });

      const taskTag: TaskTag = {
        id,
        task_id: taskId,
        tag_id: tagId,
        created_at: now,
      };

      logger.info('Tag added to task successfully', { taskId, tagId });
      return taskTag;
    } catch (error) {
      logger.error('Failed to add tag to task', { error, taskId, tagId });
      throw this.createError('TAG_ASSIGN_FAILED', 'Failed to assign tag to task', error);
    }
  }

  async removeTagFromTask(taskId: string, tagId: string): Promise<void> {
    try {
      const result = await this.db.execute(`
        DELETE FROM task_tags 
        WHERE task_id = ? AND tag_id = ?
      `, [taskId, tagId]);

      if (result.changes === 0) {
        throw this.createError('TAG_ASSIGNMENT_NOT_FOUND', 'Tag assignment not found');
      }

      logger.info('Tag removed from task successfully', { taskId, tagId });
    } catch (error) {
      if (error instanceof Error && error.message.includes('TAG_')) {
        throw error;
      }
      logger.error('Failed to remove tag from task', { error, taskId, tagId });
      throw this.createError('TAG_REMOVE_FAILED', 'Failed to remove tag from task', error);
    }
  }

  async getTaskTags(taskId: string): Promise<Tag[]> {
    try {
      const tags = await this.db.query<Tag>(`
        SELECT t.* FROM tags t
        INNER JOIN task_tags tt ON t.id = tt.tag_id
        WHERE tt.task_id = ?
        ORDER BY t.name ASC
      `, [taskId]);

      tags.forEach(tag => tag.created_at = new Date(tag.created_at));
      return tags;
    } catch (error) {
      logger.error('Failed to get task tags', { error, taskId });
      throw this.createError('TAGS_FETCH_FAILED', 'Failed to fetch task tags', error);
    }
  }

  async getTaggedTasks(tagId: string, includeChildren: boolean = false): Promise<string[]> {
    try {
      let tagIds = [tagId];
      
      if (includeChildren) {
        const childTagIds = await this.getAllChildTagIds(tagId);
        tagIds = tagIds.concat(childTagIds);
      }

      const placeholders = tagIds.map(() => '?').join(',');
      const taskIds = await this.db.query<{ task_id: string }>(`
        SELECT DISTINCT task_id FROM task_tags 
        WHERE tag_id IN (${placeholders})
      `, tagIds);

      return taskIds.map(row => row.task_id);
    } catch (error) {
      logger.error('Failed to get tagged tasks', { error, tagId, includeChildren });
      throw this.createError('TAGGED_TASKS_FETCH_FAILED', 'Failed to fetch tagged tasks', error);
    }
  }

  async getTagUsageStats(options: { days?: number; limit?: number } = {}): Promise<TagUsageStats[]> {
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
      }>(`
        SELECT 
          t.id as tag_id,
          t.name as tag_name,
          COUNT(tt.id) as usage_count,
          COUNT(DISTINCT tt.task_id) as unique_tasks,
          MIN(tt.created_at) as first_used,
          MAX(tt.created_at) as last_used
        FROM tags t
        LEFT JOIN task_tags tt ON t.id = tt.tag_id
        WHERE tt.created_at >= ? OR tt.created_at IS NULL
        GROUP BY t.id, t.name
        ORDER BY usage_count DESC
        LIMIT ?
      `, [dateThreshold, limit]);

      return stats.map(stat => ({
        tag_id: stat.tag_id,
        tag_name: stat.tag_name,
        usage_count: stat.usage_count,
        unique_tasks: stat.unique_tasks,
        first_used: new Date(stat.first_used),
        last_used: new Date(stat.last_used),
        trend: this.calculateTrend(stat.usage_count, days), // Simplified trend calculation
      }));
    } catch (error) {
      logger.error('Failed to get tag usage stats', { error, options });
      throw this.createError('TAG_STATS_FAILED', 'Failed to get tag usage statistics', error);
    }
  }

  async mergeTags(sourceTagId: string, targetTagId: string): Promise<void> {
    try {
      const [sourceTag, targetTag] = await Promise.all([
        this.getTagById(sourceTagId),
        this.getTagById(targetTagId)
      ]);

      if (!sourceTag) {
        throw this.createError('SOURCE_TAG_NOT_FOUND', 'Source tag not found');
      }
      if (!targetTag) {
        throw this.createError('TARGET_TAG_NOT_FOUND', 'Target tag not found');
      }

      await this.db.transaction(async (db) => {
        await db.run(`
          UPDATE OR IGNORE task_tags 
          SET tag_id = ? 
          WHERE tag_id = ?
        `, [targetTagId, sourceTagId]);

        await db.run(`
          DELETE FROM task_tags 
          WHERE tag_id = ?
        `, [sourceTagId]);

        await db.run(`
          UPDATE tags 
          SET parent_tag_id = ? 
          WHERE parent_tag_id = ?
        `, [targetTagId, sourceTagId]);

        await db.run('DELETE FROM tags WHERE id = ?', [sourceTagId]);
      });

      logger.info('Tags merged successfully', { sourceTagId, targetTagId });
    } catch (error) {
      if (error instanceof Error && error.message.includes('TAG_')) {
        throw error;
      }
      logger.error('Failed to merge tags', { error, sourceTagId, targetTagId });
      throw this.createError('TAG_MERGE_FAILED', 'Failed to merge tags', error);
    }
  }

  private async buildTagHierarchy(tag: Tag, depth: number): Promise<TagHierarchy> {
    const childTags = await this.getChildTags(tag.id);
    const taskCount = await this.getTaskCount(tag.id);

    const children: TagHierarchy[] = [];
    for (const child of childTags) {
      const childHierarchy = await this.buildTagHierarchy(child, depth + 1);
      children.push(childHierarchy);
    }

    return {
      ...tag,
      children,
      depth,
      task_count: taskCount,
    };
  }

  private async getTaskCount(tagId: string): Promise<number> {
    const result = await this.db.queryOne<{ count: number }>(`
      SELECT COUNT(DISTINCT task_id) as count 
      FROM task_tags 
      WHERE tag_id = ?
    `, [tagId]);
    
    return result?.count || 0;
  }

  private async getAllChildTagIds(tagId: string): Promise<string[]> {
    const childIds: string[] = [];
    const directChildren = await this.getChildTags(tagId);
    
    for (const child of directChildren) {
      childIds.push(child.id);
      const grandChildIds = await this.getAllChildTagIds(child.id);
      childIds.push(...grandChildIds);
    }
    
    return childIds;
  }

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

      const parent = await this.getTagById(currentId);
      if (parent?.parent_tag_id) {
        stack.push(parent.parent_tag_id);
      }
    }

    return false;
  }

  private calculateTrend(usageCount: number, days: number): 'increasing' | 'decreasing' | 'stable' {
    // Simplified trend calculation - in reality, you'd compare with previous periods
    const avgUsagePerDay = usageCount / days;
    if (avgUsagePerDay > 1) return 'increasing';
    if (avgUsagePerDay < 0.5) return 'decreasing';
    return 'stable';
  }

  private createError(code: string, message: string, originalError?: any): ServiceError {
    const error = new Error(message) as ServiceError;
    error.code = code;
    error.statusCode = this.getStatusCodeForError(code);
    error.details = originalError;
    return error;
  }

  private getStatusCodeForError(code: string): number {
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