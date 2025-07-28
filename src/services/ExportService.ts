/**
 * Export Service - Handles data export and import operations
 *
 * @module services/ExportService
 * @description Provides comprehensive export/import functionality for boards, tasks, tags, and notes.
 * Supports JSON and CSV formats with optional anonymization and filtering capabilities.
 *
 * @example
 * ```typescript
 * import { ExportService } from '@/services/ExportService';
 * import { dbConnection } from '@/database/connection';
 *
 * const exportService = new ExportService(dbConnection);
 *
 * // Export all data to JSON
 * const result = await exportService.exportToJSON({
 *   format: 'json',
 *   includeBoards: true,
 *   includeTasks: true,
 *   includeTags: true,
 *   includeNotes: true
 * });
 * ```
 */

import { logger } from '@/utils/logger';
import type { DatabaseConnection } from '@/database/connection';
import type { Board, Task, Tag, Note, Column } from '@/types';
import { BaseServiceError } from '@/utils/errors';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

export interface AnonymizationOptions {
  anonymizeUserData?: boolean;
  anonymizeTaskTitles?: boolean;
  anonymizeDescriptions?: boolean;
  anonymizeNotes?: boolean;
  preserveStructure?: boolean;
  hashSeed?: string;
}

export interface ExportOptions {
  format: 'json' | 'csv';
  includeBoards?: boolean;
  includeTasks?: boolean;
  includeTags?: boolean;
  includeNotes?: boolean;
  boardIds?: string[];
  taskStatuses?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  outputPath?: string;
  anonymize?: boolean;
  anonymizationOptions?: AnonymizationOptions;
}

export interface ExportResult {
  format: string;
  itemCount: number;
  filePath?: string | undefined;
  data?: ExportData | undefined;
}

export interface ExportData {
  boards?: Board[];
  tasks?: Task[];
  tags?: Tag[];
  notes?: Note[];
  columns?: Column[];
  taskTags?: Array<{ task_id: string; tag_id: string }>;
  metadata?: {
    exportDate: string;
    version: string;
    totalItems: number;
  };
}

export interface ExportFileFormat {
  version: string;
  exportDate?: string;
  data: ExportData;
}

export interface ImportOptions {
  format: 'json' | 'csv';
  merge?: boolean;
  overwrite?: boolean;
  validateOnly?: boolean;
  conflictResolution?: 'skip' | 'overwrite' | 'rename';
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  conflicts: string[];
}

export class ExportService {
  constructor(private readonly db: DatabaseConnection) {}

  /**
   * Export data to JSON format
   */
  async exportToJSON(options: ExportOptions): Promise<ExportResult> {
    logger.info('Starting JSON export', { options });

    try {
      const data: ExportFileFormat = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        data: {},
      };

      let itemCount = 0;

      // Export boards
      if (options.includeBoards !== false) {
        let boards = await this.getBoards(options);
        if (options.anonymize) {
          boards = this.anonymizeBoards(boards, options.anonymizationOptions);
        }
        data.data.boards = boards;
        itemCount += boards.length;
      }

      // Export columns for included boards
      if (options.includeBoards !== false && data.data.boards) {
        const boardIds = data.data.boards.map(b => b.id);
        const columns = await this.getColumns(boardIds);
        data.data.columns = columns;
        itemCount += columns.length;
      }

      // Export tasks
      if (options.includeTasks !== false) {
        let tasks = await this.getTasks(options);
        if (options.anonymize) {
          tasks = this.anonymizeTasks(tasks, options.anonymizationOptions);
        }
        data.data.tasks = tasks;
        itemCount += tasks.length;
      }

      // Export tags
      if (options.includeTags !== false) {
        let tags = await this.getTags(options);
        if (options.anonymize) {
          tags = this.anonymizeTags(tags, options.anonymizationOptions);
        }
        data.data.tags = tags;
        itemCount += tags.length;
      }

      // Export task-tag relationships
      if (options.includeTasks !== false && options.includeTags !== false) {
        const taskTags = await this.getTaskTags(options);
        data.data.taskTags = taskTags;
        itemCount += taskTags.length;
      }

      // Export notes
      if (options.includeNotes !== false) {
        let notes = await this.getNotes(options);
        if (options.anonymize) {
          notes = this.anonymizeNotes(notes, options.anonymizationOptions);
        }
        data.data.notes = notes;
        itemCount += notes.length;
      }

      // Add metadata
      data.data.metadata = {
        exportDate: new Date().toISOString(),
        version: '1.0',
        totalItems: itemCount,
      };

      // Write to file if outputPath is specified
      let filePath: string | undefined;
      if (options.outputPath) {
        filePath = await this.writeToFile(data, options.outputPath, 'json');
      }

      logger.info('JSON export completed', { itemCount, filePath });

      return {
        format: 'json',
        itemCount,
        filePath,
        data: data.data,
      };
    } catch (error) {
      logger.error('JSON export failed:', error);
      throw new BaseServiceError('EXPORT_FAILED', 'Failed to export data to JSON');
    }
  }

  /**
   * Export data to CSV format
   */
  async exportToCSV(options: ExportOptions): Promise<ExportResult> {
    logger.info('Starting CSV export', { options });

    try {
      let itemCount = 0;
      const csvData: string[] = [];

      // Export boards
      if (options.includeBoards !== false) {
        let boards = await this.getBoards(options);
        if (options.anonymize) {
          boards = this.anonymizeBoards(boards, options.anonymizationOptions);
        }
        const boardCsv = ExportService.convertArrayToCSV(boards, [
          'id',
          'name',
          'description',
          'is_active',
          'created_at',
          'updated_at',
        ]);
        csvData.push(`=== BOARDS ===\n${boardCsv}`);
        itemCount += boards.length;
      }

      // Export tasks
      if (options.includeTasks !== false) {
        let tasks = await this.getTasks(options);
        if (options.anonymize) {
          tasks = this.anonymizeTasks(tasks, options.anonymizationOptions);
        }
        const taskCsv = ExportService.convertArrayToCSV(tasks, [
          'id',
          'title',
          'description',
          'board_id',
          'column_id',
          'position',
          'priority',
          'status',
          'assignee',
          'due_date',
          'created_at',
          'updated_at',
        ]);
        csvData.push(`=== TASKS ===\n${taskCsv}`);
        itemCount += tasks.length;
      }

      // Export tags
      if (options.includeTags !== false) {
        let tags = await this.getTags(options);
        if (options.anonymize) {
          tags = this.anonymizeTags(tags, options.anonymizationOptions);
        }
        const tagCsv = ExportService.convertArrayToCSV(tags, [
          'id',
          'name',
          'color',
          'description',
          'parent_tag_id',
          'created_at',
        ]);
        csvData.push(`=== TAGS ===\n${tagCsv}`);
        itemCount += tags.length;
      }

      // Export notes
      if (options.includeNotes !== false) {
        let notes = await this.getNotes(options);
        if (options.anonymize) {
          notes = this.anonymizeNotes(notes, options.anonymizationOptions);
        }
        const noteCsv = ExportService.convertArrayToCSV(notes, [
          'id',
          'content',
          'category',
          'task_id',
          'pinned',
          'created_at',
          'updated_at',
        ]);
        csvData.push(`=== NOTES ===\n${noteCsv}`);
        itemCount += notes.length;
      }

      const csvContent = csvData.join('\n\n');

      // Write to file if outputPath is specified
      let filePath: string | undefined;
      if (options.outputPath) {
        filePath = await this.writeToFile(csvContent, options.outputPath, 'csv');
      }

      logger.info('CSV export completed', { itemCount, filePath });

      return {
        format: 'csv',
        itemCount,
        filePath,
      };
    } catch (error) {
      logger.error('CSV export failed:', error);
      throw new BaseServiceError('EXPORT_FAILED', 'Failed to export data to CSV');
    }
  }

  /**
   * Import data from JSON format
   */
  async importFromJSON(
    data: ExportData | ExportFileFormat,
    options: ImportOptions
  ): Promise<ImportResult> {
    logger.info('Starting JSON import', { options });

    try {
      const importData = 'data' in data ? data.data : data;
      const result: ImportResult = { imported: 0, skipped: 0, errors: [], conflicts: [] };

      // Import boards
      if (importData.boards) {
        const boardResult = await this.importBoards(importData.boards, options);
        result.imported += boardResult.imported;
        result.skipped += boardResult.skipped;
        result.errors.push(...boardResult.errors);
        result.conflicts.push(...boardResult.conflicts);
      }

      // Import columns
      if (importData.columns) {
        const columnResult = await this.importColumns(importData.columns, options);
        result.imported += columnResult.imported;
        result.skipped += columnResult.skipped;
        result.errors.push(...columnResult.errors);
        result.conflicts.push(...columnResult.conflicts);
      }

      // Import tasks
      if (importData.tasks) {
        const taskResult = await this.importTasks(importData.tasks, options);
        result.imported += taskResult.imported;
        result.skipped += taskResult.skipped;
        result.errors.push(...taskResult.errors);
        result.conflicts.push(...taskResult.conflicts);
      }

      // Import tags
      if (importData.tags) {
        const tagResult = await this.importTags(importData.tags, options);
        result.imported += tagResult.imported;
        result.skipped += tagResult.skipped;
        result.errors.push(...tagResult.errors);
        result.conflicts.push(...tagResult.conflicts);
      }

      // Import task-tag relationships
      if (importData.taskTags) {
        const taskTagResult = await this.importTaskTags(importData.taskTags, options);
        result.imported += taskTagResult.imported;
        result.skipped += taskTagResult.skipped;
        result.errors.push(...taskTagResult.errors);
        result.conflicts.push(...taskTagResult.conflicts);
      }

      // Import notes
      if (importData.notes) {
        const noteResult = await this.importNotes(importData.notes, options);
        result.imported += noteResult.imported;
        result.skipped += noteResult.skipped;
        result.errors.push(...noteResult.errors);
        result.conflicts.push(...noteResult.conflicts);
      }

      logger.info('JSON import completed', result);
      return result;
    } catch (error) {
      logger.error('JSON import failed:', error);
      throw new BaseServiceError('IMPORT_FAILED', 'Failed to import data from JSON');
    }
  }

  // Private helper methods

  private async getBoards(options: ExportOptions): Promise<Board[]> {
    let query = 'SELECT * FROM boards WHERE deleted_at IS NULL';
    const params: unknown[] = [];

    if (options.boardIds && options.boardIds.length > 0) {
      query += ` AND id IN (${options.boardIds.map(() => '?').join(',')})`;
      params.push(...options.boardIds);
    }

    query += ' ORDER BY created_at DESC';

    return this.db.query<Board>(query, params as any[]);
  }

  private async getColumns(boardIds: string[]): Promise<Column[]> {
    if (boardIds.length === 0) return [];

    const query = `SELECT * FROM columns WHERE board_id IN (${boardIds
      .map(() => '?')
      .join(',')}) ORDER BY position`;
    return this.db.query<Column>(query, boardIds);
  }

  private async getTasks(options: ExportOptions): Promise<Task[]> {
    let query = 'SELECT * FROM tasks WHERE deleted_at IS NULL';
    const params: unknown[] = [];

    if (options.boardIds && options.boardIds.length > 0) {
      query += ` AND board_id IN (${options.boardIds.map(() => '?').join(',')})`;
      params.push(...options.boardIds);
    }

    if (options.taskStatuses && options.taskStatuses.length > 0) {
      query += ` AND status IN (${options.taskStatuses.map(() => '?').join(',')})`;
      params.push(...options.taskStatuses);
    }

    if (options.dateFrom) {
      query += ' AND created_at >= ?';
      params.push(options.dateFrom.toISOString());
    }

    if (options.dateTo) {
      query += ' AND created_at <= ?';
      params.push(options.dateTo.toISOString());
    }

    query += ' ORDER BY created_at DESC';

    return this.db.query<Task>(query, params as any[]);
  }

  private async getTags(_options: ExportOptions): Promise<Tag[]> {
    return await this.db.query<Tag>('SELECT * FROM tags ORDER BY created_at DESC');
  }

  private async getTaskTags(
    _options: ExportOptions
  ): Promise<Array<{ task_id: string; tag_id: string }>> {
    return await this.db.query<{ task_id: string; tag_id: string }>(
      'SELECT task_id, tag_id FROM task_tags'
    );
  }

  private async getNotes(options: ExportOptions): Promise<Note[]> {
    let query = 'SELECT * FROM notes';
    const params: unknown[] = [];

    if (options.boardIds && options.boardIds.length > 0) {
      query += ` WHERE task_id IN (SELECT id FROM tasks WHERE board_id IN (${options.boardIds
        .map(() => '?')
        .join(',')}))`;
      params.push(...options.boardIds);
    }

    query += ' ORDER BY created_at DESC';

    return await this.db.query<Note>(query, params as any[]);
  }

  private static convertArrayToCSV(data: unknown[], columns: string[]): string {
    if (data.length === 0) return columns.join(',');

    const header = columns.join(',');
    const rows = data.map(item =>
      columns
        .map(col => {
          const value = (item as Record<string, unknown>)[col];
          if (value === null || value === undefined) return '';
          return String(value).includes(',') ? `"${String(value)}"` : String(value);
        })
        .join(',')
    );

    return `${header}\n${rows.join('\n')}`;
  }

  private async importBoards(boards: Board[], options: ImportOptions): Promise<ImportResult> {
    const result: ImportResult = { imported: 0, skipped: 0, errors: [], conflicts: [] };

    for (const board of boards) {
      try {
        // Check if board already exists
        // eslint-disable-next-line no-await-in-loop
        const existingBoard = await this.db.queryOne<Board>('SELECT * FROM boards WHERE id = ?', [
          board.id,
        ]);

        if (existingBoard) {
          if (options.conflictResolution === 'skip') {
            result.skipped += 1;
            continue;
          } else if (options.conflictResolution === 'rename') {
            board.name = `${board.name} (imported ${new Date().toISOString()})`;
          }
        }

        // eslint-disable-next-line no-await-in-loop
        await this.db.execute(
          'INSERT OR REPLACE INTO boards (id, name, description, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          [
            board.id,
            board.name,
            board.description || null,
            (board as Board & { is_active?: boolean }).is_active ?? true,
            board.created_at,
            board.updated_at,
          ]
        );
        result.imported += 1;
      } catch (error: unknown) {
        result.errors.push(
          `Failed to import board ${board.name}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return result;
  }

  private async importColumns(columns: Column[], _options: ImportOptions): Promise<ImportResult> {
    const result: ImportResult = { imported: 0, skipped: 0, errors: [], conflicts: [] };

    for (const column of columns) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.db.execute(
          'INSERT OR REPLACE INTO columns (id, board_id, name, position, wip_limit, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            column.id,
            column.board_id,
            column.name,
            column.position,
            column.wip_limit || null,
            column.created_at,
            column.updated_at,
          ]
        );
        result.imported += 1;
      } catch (error: unknown) {
        result.errors.push(
          `Failed to import column ${column.name}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return result;
  }

  private async importTasks(tasks: Task[], options: ImportOptions): Promise<ImportResult> {
    const result: ImportResult = { imported: 0, skipped: 0, errors: [], conflicts: [] };

    // Sort tasks to import parents before children
    const sortedTasks = [...tasks].sort((a, b) => {
      if (!a.parent_task_id && b.parent_task_id) return -1;
      if (a.parent_task_id && !b.parent_task_id) return 1;
      return 0;
    });

    for (const task of sortedTasks) {
      try {
        // Check if task already exists
        // eslint-disable-next-line no-await-in-loop
        const existingTask = await this.db.queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [
          task.id,
        ]);

        if (existingTask) {
          if (options.conflictResolution === 'skip') {
            result.skipped++;
            continue;
          }
        }

        // eslint-disable-next-line no-await-in-loop
        await this.db.execute(
          `INSERT OR REPLACE INTO tasks (
            id, title, description, board_id, column_id, position, priority,
            status, assignee, due_date, estimated_hours, actual_hours,
            parent_task_id, metadata, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            task.id,
            task.title,
            task.description || null,
            task.board_id,
            task.column_id,
            task.position,
            task.priority,
            task.status,
            task.assignee || null,
            task.due_date || null,
            task.estimated_hours || null,
            task.actual_hours || null,
            task.parent_task_id || null,
            task.metadata || null,
            task.created_at,
            task.updated_at,
          ]
        );
        result.imported++;
      } catch (error: unknown) {
        result.errors.push(
          `Failed to import task ${task.title}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return result;
  }

  private async importTags(tags: Tag[], options: ImportOptions): Promise<ImportResult> {
    const result: ImportResult = { imported: 0, skipped: 0, errors: [], conflicts: [] };

    // Sort tags to import parents before children
    const sortedTags = [...tags].sort((a, b) => {
      if (!a.parent_tag_id && b.parent_tag_id) return -1;
      if (a.parent_tag_id && !b.parent_tag_id) return 1;
      return 0;
    });

    for (const tag of sortedTags) {
      try {
        // Check if tag already exists
        // eslint-disable-next-line no-await-in-loop
        const existingTag = await this.db.queryOne<Tag>('SELECT * FROM tags WHERE name = ?', [
          tag.name,
        ]);

        if (existingTag) {
          if (options.conflictResolution === 'skip') {
            result.skipped++;
            continue;
          }
        }

        // eslint-disable-next-line no-await-in-loop
        await this.db.execute(
          'INSERT OR REPLACE INTO tags (id, name, color, description, parent_tag_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [tag.id, tag.name, tag.color || null, tag.description || null, tag.parent_tag_id || null, tag.created_at]
        );
        result.imported++;
      } catch (error: unknown) {
        result.errors.push(
          `Failed to import tag ${tag.name}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return result;
  }

  private async importNotes(notes: Note[], _options: ImportOptions): Promise<ImportResult> {
    const result: ImportResult = { imported: 0, skipped: 0, errors: [], conflicts: [] };

    for (const note of notes) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.db.execute(
          'INSERT OR REPLACE INTO notes (id, content, category, task_id, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            note.id,
            note.content,
            note.category,
            note.task_id,
            note.pinned,
            note.created_at,
            note.updated_at,
          ]
        );
        result.imported++;
      } catch (error: unknown) {
        result.errors.push(
          `Failed to import note: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return result;
  }

  private async importTaskTags(
    taskTags: Array<{ task_id: string; tag_id: string }>,
    _options: ImportOptions
  ): Promise<ImportResult> {
    const result: ImportResult = { imported: 0, skipped: 0, errors: [], conflicts: [] };

    for (const mapping of taskTags) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.db.execute(
          'INSERT OR IGNORE INTO task_tags (task_id, tag_id, created_at) VALUES (?, ?, ?)',
          [mapping.task_id, mapping.tag_id, new Date().toISOString()]
        );
        result.imported++;
      } catch (error: unknown) {
        result.errors.push(
          `Failed to import task-tag mapping: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return result;
  }

  private async writeToFile(content: unknown, outputPath: string, format: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `export-${timestamp}.${format}`;
    const fullPath = path.join(outputPath, filename);

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(
      fullPath,
      typeof content === 'string' ? content : JSON.stringify(content, null, 2)
    );

    return fullPath;
  }

  // Anonymization methods

  /**
   * Generate deterministic anonymous text based on input
   */
  private anonymizeText(text: string, prefix: string, hashSeed?: string): string {
    const seed = hashSeed ?? 'default-seed';
    const hash = crypto
      .createHash('sha256')
      .update(seed + text)
      .digest('hex');
    return `${prefix}_${hash.substring(0, 8)}`;
  }

  /**
   * Anonymize board data
   */
  private anonymizeBoards(boards: Board[], options?: AnonymizationOptions): Board[] {
    return boards.map(board => ({
      ...board,
      name: options?.preserveStructure
        ? board.name
        : this.anonymizeText(board.name, 'Board', options?.hashSeed),
      description:
        board.description && options?.anonymizeDescriptions
          ? this.anonymizeText(board.description, 'BoardDesc', options?.hashSeed)
          : board.description,
    }));
  }

  /**
   * Anonymize column data
   */
  private anonymizeColumns(columns: Column[], options?: AnonymizationOptions): Column[] {
    return columns.map(column => ({
      ...column,
      name: options?.preserveStructure
        ? column.name
        : this.anonymizeText(column.name, 'Column', options?.hashSeed),
    }));
  }

  /**
   * Anonymize task data
   */
  private anonymizeTasks(tasks: Task[], options?: AnonymizationOptions): Task[] {
    return tasks.map(task => ({
      ...task,
      title: options?.anonymizeTaskTitles
        ? this.anonymizeText(task.title, 'Task', options?.hashSeed)
        : task.title,
      description:
        task.description && options?.anonymizeDescriptions
          ? this.anonymizeText(task.description, 'TaskDesc', options?.hashSeed)
          : task.description,
      assignee: options?.anonymizeUserData
        ? this.anonymizeText(task.assignee ?? 'unknown', 'User', options?.hashSeed)
        : task.assignee,
    }));
  }

  /**
   * Anonymize tag data
   */
  private anonymizeTags(tags: Tag[], options?: AnonymizationOptions): Tag[] {
    return tags.map(tag => ({
      ...tag,
      name: options?.preserveStructure
        ? tag.name
        : this.anonymizeText(tag.name, 'Tag', options?.hashSeed),
      description:
        tag.description && options?.anonymizeDescriptions
          ? this.anonymizeText(tag.description, 'TagDesc', options?.hashSeed)
          : tag.description,
    }));
  }

  /**
   * Anonymize note data
   */
  private anonymizeNotes(notes: Note[], options?: AnonymizationOptions): Note[] {
    return notes.map(note => ({
      ...note,
      content: options?.anonymizeNotes
        ? this.anonymizeText(note.content, 'Note', options?.hashSeed)
        : note.content,
    }));
  }
}
