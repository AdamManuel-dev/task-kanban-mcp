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
  filePath?: string;
  data?: ExportData;
}

export interface ExportData {
  boards?: Board[];
  tasks?: Task[];
  tags?: Tag[];
  notes?: Note[];
  columns?: Column[];
  taskTags?: any[];
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
      const data: { version: string; exportDate: string; data: ExportData } = {
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

        // Include columns with boards
        let columns = await this.getColumns(boards.map(b => b.id));
        if (options.anonymize) {
          columns = this.anonymizeColumns(columns, options.anonymizationOptions);
        }
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

        // Include task-tag mappings
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

      // Save to file if path provided
      if (options.outputPath) {
        await fs.writeFile(options.outputPath, JSON.stringify(data, null, 2));
        logger.info('JSON export saved to file', { path: options.outputPath });
      }

      const result: ExportResult = {
        format: 'json',
        itemCount,
      };

      if (options.outputPath) {
        result.filePath = options.outputPath;
      } else {
        result.data = data.data;
      }

      return result;
    } catch (error) {
      logger.error('JSON export failed', { error });
      throw new BaseServiceError('EXPORT_FAILED', 'Failed to export data to JSON', 500, {
        originalError: String(error),
      });
    }
  }

  /**
   * Export data to CSV format
   */
  async exportToCSV(options: ExportOptions): Promise<ExportResult> {
    logger.info('Starting CSV export', { options });

    try {
      const csvFiles: string[] = [];
      let totalItems = 0;
      const baseDir = options.outputPath ? path.dirname(options.outputPath) : '.';
      const baseName = options.outputPath ? path.basename(options.outputPath, '.csv') : 'export';

      // Export boards to CSV
      if (options.includeBoards !== false) {
        const boards = await this.getBoards(options);
        const boardsCsv = this.convertToCSV(boards, [
          'id',
          'name',
          'description',
          'is_active',
          'created_at',
          'updated_at',
        ]);
        const boardsFile = path.join(baseDir, `${baseName}_boards.csv`);
        await fs.writeFile(boardsFile, boardsCsv);
        csvFiles.push(boardsFile);
        totalItems += boards.length;
      }

      // Export tasks to CSV
      if (options.includeTasks !== false) {
        const tasks = await this.getTasks(options);
        const tasksCsv = this.convertToCSV(tasks, [
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
          'estimated_hours',
          'actual_hours',
          'parent_task_id',
          'created_at',
          'updated_at',
        ]);
        const tasksFile = path.join(baseDir, `${baseName}_tasks.csv`);
        await fs.writeFile(tasksFile, tasksCsv);
        csvFiles.push(tasksFile);
        totalItems += tasks.length;
      }

      // Export tags to CSV
      if (options.includeTags !== false) {
        const tags = await this.getTags(options);
        const tagsCsv = this.convertToCSV(tags, [
          'id',
          'name',
          'color',
          'description',
          'parent_tag_id',
          'created_at',
        ]);
        const tagsFile = path.join(baseDir, `${baseName}_tags.csv`);
        await fs.writeFile(tagsFile, tagsCsv);
        csvFiles.push(tagsFile);
        totalItems += tags.length;
      }

      // Export notes to CSV
      if (options.includeNotes !== false) {
        const notes = await this.getNotes(options);
        const notesCsv = this.convertToCSV(notes, [
          'id',
          'content',
          'category',
          'task_id',
          'is_pinned',
          'created_at',
          'updated_at',
        ]);
        const notesFile = path.join(baseDir, `${baseName}_notes.csv`);
        await fs.writeFile(notesFile, notesCsv);
        csvFiles.push(notesFile);
        totalItems += notes.length;
      }

      return {
        format: 'csv',
        itemCount: totalItems,
        filePath: csvFiles.join(', '),
      };
    } catch (error) {
      logger.error('CSV export failed', { error });
      throw new BaseServiceError('EXPORT_FAILED', 'Failed to export data to CSV', 500, {
        originalError: String(error),
      });
    }
  }

  /**
   * Import data from JSON
   */
  async importFromJSON(
    data: ExportData | ExportFileFormat,
    options: ImportOptions
  ): Promise<ImportResult> {
    logger.info('Starting JSON import', { options });

    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      errors: [],
      conflicts: [],
    };

    try {
      // Validate JSON structure
      const isFileFormat = 'version' in data && 'data' in data;
      if (!isFileFormat) {
        throw new BaseServiceError('INVALID_FORMAT', 'Invalid JSON format', 400);
      }

      const exportData = data.data;

      // Use transaction
      if (options.validateOnly) {
        // For validation, we'll use a transaction that always rolls back
        try {
          await this.db.transaction(async () => {
            // Import in correct order to maintain referential integrity

            // 1. Import boards
            if (exportData.boards) {
              const boardResult = await this.importBoards(exportData.boards, options);
              result.imported += boardResult.imported;
              result.skipped += boardResult.skipped;
              result.errors.push(...boardResult.errors);
              result.conflicts.push(...boardResult.conflicts);
            }

            // 2. Import columns
            if (exportData.columns) {
              const columnResult = await this.importColumns(exportData.columns, options);
              result.imported += columnResult.imported;
              result.skipped += columnResult.skipped;
              result.errors.push(...columnResult.errors);
              result.conflicts.push(...columnResult.conflicts);
            }

            // 3. Import tasks
            if (exportData.tasks) {
              const taskResult = await this.importTasks(exportData.tasks, options);
              result.imported += taskResult.imported;
              result.skipped += taskResult.skipped;
              result.errors.push(...taskResult.errors);
              result.conflicts.push(...taskResult.conflicts);
            }

            // 4. Import tags
            if (exportData.tags) {
              const tagResult = await this.importTags(exportData.tags, options);
              result.imported += tagResult.imported;
              result.skipped += tagResult.skipped;
              result.errors.push(...tagResult.errors);
              result.conflicts.push(...tagResult.conflicts);
            }

            // 5. Import notes
            if (exportData.notes) {
              const noteResult = await this.importNotes(exportData.notes, options);
              result.imported += noteResult.imported;
              result.skipped += noteResult.skipped;
              result.errors.push(...noteResult.errors);
              result.conflicts.push(...noteResult.conflicts);
            }

            // 6. Import task-tag mappings
            if (exportData.taskTags) {
              const taskTagResult = await this.importTaskTags(exportData.taskTags, options);
              result.imported += taskTagResult.imported;
              result.skipped += taskTagResult.skipped;
              result.errors.push(...taskTagResult.errors);
              result.conflicts.push(...taskTagResult.conflicts);
            }

            // Force rollback for validation
            throw new Error('VALIDATION_ONLY');
          });
        } catch (error: unknown) {
          if (error instanceof Error && error.message !== 'VALIDATION_ONLY') {
            throw error;
          }
          logger.info('Validation complete, transaction rolled back');
        }
      } else {
        // Regular import with commit
        await this.db.transaction(async () => {
          // Import in correct order to maintain referential integrity

          // 1. Import boards
          if (exportData.boards) {
            const boardResult = await this.importBoards(exportData.boards, options);
            result.imported += boardResult.imported;
            result.skipped += boardResult.skipped;
            result.errors.push(...boardResult.errors);
            result.conflicts.push(...boardResult.conflicts);
          }

          // 2. Import columns
          if (exportData.columns) {
            const columnResult = await this.importColumns(exportData.columns, options);
            result.imported += columnResult.imported;
            result.skipped += columnResult.skipped;
            result.errors.push(...columnResult.errors);
            result.conflicts.push(...columnResult.conflicts);
          }

          // 3. Import tasks
          if (exportData.tasks) {
            const taskResult = await this.importTasks(exportData.tasks, options);
            result.imported += taskResult.imported;
            result.skipped += taskResult.skipped;
            result.errors.push(...taskResult.errors);
            result.conflicts.push(...taskResult.conflicts);
          }

          // 4. Import tags
          if (exportData.tags) {
            const tagResult = await this.importTags(exportData.tags, options);
            result.imported += tagResult.imported;
            result.skipped += tagResult.skipped;
            result.errors.push(...tagResult.errors);
            result.conflicts.push(...tagResult.conflicts);
          }

          // 5. Import notes
          if (exportData.notes) {
            const noteResult = await this.importNotes(exportData.notes, options);
            result.imported += noteResult.imported;
            result.skipped += noteResult.skipped;
            result.errors.push(...noteResult.errors);
            result.conflicts.push(...noteResult.conflicts);
          }

          // 6. Import task-tag mappings
          if (exportData.taskTags) {
            const taskTagResult = await this.importTaskTags(exportData.taskTags, options);
            result.imported += taskTagResult.imported;
            result.skipped += taskTagResult.skipped;
            result.errors.push(...taskTagResult.errors);
            result.conflicts.push(...taskTagResult.conflicts);
          }
        });

        logger.info('Import completed successfully');
      }

      return result;
    } catch (error) {
      logger.error('JSON import failed', { error });
      throw new BaseServiceError('IMPORT_FAILED', 'Failed to import data from JSON', 500, {
        originalError: String(error),
      });
    }
  }

  // Private helper methods

  private async getBoards(options: ExportOptions): Promise<Board[]> {
    let query = 'SELECT * FROM boards WHERE 1=1';
    const params: unknown[] = [];

    if (options.boardIds && options.boardIds.length > 0) {
      query += ` AND id IN (${options.boardIds.map(() => '?').join(',')})`;
      params.push(...options.boardIds);
    }

    query += ' ORDER BY created_at';
    return this.db.query<Board>(query, params);
  }

  private async getColumns(boardIds: string[]): Promise<Column[]> {
    if (boardIds.length === 0) return [];
    const query = `SELECT * FROM columns WHERE board_id IN (${boardIds.map(() => '?').join(',')}) ORDER BY position`;
    return this.db.query<Column>(query, boardIds);
  }

  private async getTasks(options: ExportOptions): Promise<Task[]> {
    let query = 'SELECT * FROM tasks WHERE 1=1';
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

    query += ' ORDER BY created_at';
    return this.db.query<Task>(query, params);
  }

  private async getTags(_options: ExportOptions): Promise<Tag[]> {
    return this.db.query<Tag>('SELECT * FROM tags ORDER BY name');
  }

  private async getTaskTags(
    _options: ExportOptions
  ): Promise<Array<{ task_id: string; tag_id: string }>> {
    return this.db.query('SELECT * FROM task_tags ORDER BY task_id, tag_id');
  }

  private async getNotes(options: ExportOptions): Promise<Note[]> {
    let query = 'SELECT * FROM notes WHERE 1=1';
    const params: unknown[] = [];

    if (options.dateFrom) {
      query += ' AND created_at >= ?';
      params.push(options.dateFrom.toISOString());
    }

    if (options.dateTo) {
      query += ' AND created_at <= ?';
      params.push(options.dateTo.toISOString());
    }

    query += ' ORDER BY created_at';
    return this.db.query<Note>(query, params);
  }

  private convertToCSV(data: unknown[], columns: string[]): string {
    const header = columns.join(',');
    const rows = data.map(item =>
      columns
        .map(col => {
          const value = (item as any)[col];
          if (value === null || value === undefined) return '';
          if (
            typeof value === 'string' &&
            (value.includes(',') || value.includes('\n') || value.includes('"'))
          ) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        })
        .join(',')
    );
    return [header, ...rows].join('\n');
  }

  private async importBoards(boards: Board[], options: ImportOptions): Promise<ImportResult> {
    const result: ImportResult = { imported: 0, skipped: 0, errors: [], conflicts: [] };

    for (const board of boards) {
      try {
        const existing = await this.db.queryOne<Board>('SELECT * FROM boards WHERE id = ?', [
          board.id,
        ]);

        if (existing) {
          if (options.conflictResolution === 'skip') {
            result.skipped++;
            continue;
          } else if (options.conflictResolution === 'rename') {
            board.name = `${board.name} (imported ${new Date().toISOString()})`;
          }
        }

        await this.db.execute(
          'INSERT OR REPLACE INTO boards (id, name, description, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          [
            board.id,
            board.name,
            board.description,
            (board as Board & { is_active?: boolean }).is_active ?? true,
            board.created_at,
            board.updated_at,
          ]
        );
        result.imported++;
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
        await this.db.execute(
          'INSERT OR REPLACE INTO columns (id, board_id, name, position, wip_limit, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            column.id,
            column.board_id,
            column.name,
            column.position,
            column.wip_limit,
            column.created_at,
            column.updated_at,
          ]
        );
        result.imported++;
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
        const existing = await this.db.queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [
          task.id,
        ]);

        if (existing && options.conflictResolution === 'skip') {
          result.skipped++;
          continue;
        }

        await this.db.execute(
          `INSERT OR REPLACE INTO tasks (
            id, title, description, board_id, column_id, position, priority,
            status, assignee, due_date, estimated_hours, actual_hours,
            parent_task_id, metadata, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            task.id,
            task.title,
            task.description,
            task.board_id,
            task.column_id,
            task.position,
            task.priority,
            task.status,
            task.assignee,
            task.due_date,
            task.estimated_hours,
            task.actual_hours,
            task.parent_task_id,
            task.metadata,
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
        const existing = await this.db.queryOne<Tag>('SELECT * FROM tags WHERE name = ?', [
          tag.name,
        ]);

        if (existing && options.conflictResolution === 'skip') {
          result.skipped++;
          continue;
        }

        await this.db.execute(
          'INSERT OR REPLACE INTO tags (id, name, color, description, parent_tag_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [tag.id, tag.name, tag.color, tag.description, tag.parent_tag_id, tag.created_at]
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
        await this.db.execute(
          'INSERT OR REPLACE INTO notes (id, content, category, task_id, is_pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
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

  // Anonymization methods

  /**
   * Generate deterministic anonymous text based on input
   */
  private anonymizeText(text: string, prefix: string, seed?: string): string {
    if (!text) return text;

    const hash = crypto
      .createHash('sha256')
      .update(text + (seed || 'default-seed'))
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
      createdBy:
        task.createdBy && options?.anonymizeUserData
          ? this.anonymizeText(task.createdBy, 'User', options?.hashSeed)
          : task.createdBy,
      assignedTo:
        task.assignedTo && options?.anonymizeUserData
          ? this.anonymizeText(task.assignedTo, 'User', options?.hashSeed)
          : task.assignedTo,
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
      createdBy:
        note.createdBy && options?.anonymizeUserData
          ? this.anonymizeText(note.createdBy, 'User', options?.hashSeed)
          : note.createdBy,
    }));
  }

  // Format converters

  /**
   * Convert between different export formats
   */
  async convertFormat(
    inputPath: string,
    outputFormat: 'json' | 'csv' | 'markdown' | 'html',
    outputPath: string
  ): Promise<void> {
    logger.info('Converting export format', { inputPath, outputFormat, outputPath });

    try {
      // Read input file (assuming JSON)
      const inputContent = await fs.readFile(inputPath, 'utf-8');
      const data = JSON.parse(inputContent) as ExportFileFormat;

      switch (outputFormat) {
        case 'csv':
          await this.convertToCSV(data, outputPath);
          break;
        case 'markdown':
          await this.convertToMarkdown(data, outputPath);
          break;
        case 'html':
          await this.convertToHTML(data, outputPath);
          break;
        case 'json':
          // Already in JSON format, just copy
          await fs.writeFile(outputPath, JSON.stringify(data, null, 2));
          break;
        default:
          throw new Error(`Unsupported output format: ${outputFormat}`);
      }

      logger.info('Format conversion completed', { outputPath });
    } catch (error) {
      logger.error('Format conversion failed', { error });
      throw new BaseServiceError('CONVERSION_FAILED', 'Failed to convert format', 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Convert to CSV format (tasks only for simplicity)
   */
  private async convertToCSV(data: ExportFileFormat, outputPath: string): Promise<void> {
    const rows: string[] = [];

    // Header row
    rows.push(
      'Board,Column,Title,Description,Status,Priority,Due Date,Created At,Created By,Assigned To'
    );

    // Data rows
    if (data.data.tasks && data.data.tasks.length > 0) {
      for (const task of data.data.tasks) {
        const board = data.data.boards?.find(b => b.id === task.boardId);
        const column = data.data.columns?.find(c => c.id === task.columnId);

        const row = [
          this.escapeCSV(board?.name || 'Unknown'),
          this.escapeCSV(column?.name || 'Unknown'),
          this.escapeCSV(task.title),
          this.escapeCSV(task.description || ''),
          this.escapeCSV(task.status),
          this.escapeCSV(task.priority || ''),
          task.dueDate ? new Date(task.dueDate).toISOString() : '',
          task.createdAt,
          this.escapeCSV(task.createdBy || ''),
          this.escapeCSV(task.assignedTo || ''),
        ].join(',');

        rows.push(row);
      }
    }

    await fs.writeFile(outputPath, rows.join('\n'));
  }

  /**
   * Escape CSV special characters
   */
  private escapeCSV(text: string): string {
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  /**
   * Convert to Markdown format
   */
  private async convertToMarkdown(data: ExportFileFormat, outputPath: string): Promise<void> {
    let markdown = '# Kanban Export\n\n';
    markdown += `**Export Date:** ${data.exportDate}\n`;
    markdown += `**Version:** ${data.version}\n\n`;

    // Boards section
    if (data.data.boards && data.data.boards.length > 0) {
      markdown += '## Boards\n\n';
      for (const board of data.data.boards) {
        markdown += `### ${board.name}\n`;
        if (board.description) {
          markdown += `> ${board.description}\n`;
        }
        markdown += '\n';
      }
    }

    // Tasks section
    if (data.data.tasks && data.data.tasks.length > 0) {
      markdown += '## Tasks\n\n';
      const tasksByBoard = this.groupTasksByBoard(data.data.tasks);

      for (const [boardId, tasks] of Object.entries(tasksByBoard)) {
        const board = data.data.boards?.find(b => b.id === boardId);
        markdown += `### ${board ? board.name : 'Unknown Board'}\n\n`;

        for (const task of tasks) {
          markdown += `- **${task.title}** (${task.status})\n`;
          if (task.description) {
            markdown += `  - ${task.description}\n`;
          }
          if (task.priority) {
            markdown += `  - Priority: ${task.priority}\n`;
          }
          if (task.dueDate) {
            markdown += `  - Due: ${new Date(task.dueDate).toLocaleDateString()}\n`;
          }
          markdown += '\n';
        }
      }
    }

    // Notes section
    if (data.data.notes && data.data.notes.length > 0) {
      markdown += '## Notes\n\n';
      for (const note of data.data.notes) {
        markdown += `### Note (${note.category || 'General'})\n`;
        markdown += `${note.content}\n\n`;
      }
    }

    await fs.writeFile(outputPath, markdown);
  }

  /**
   * Convert to HTML format
   */
  private async convertToHTML(data: ExportFileFormat, outputPath: string): Promise<void> {
    let html = `<!DOCTYPE html>
<html>
<head>
  <title>Kanban Export</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1, h2, h3 { color: #333; }
    .board { margin-bottom: 30px; }
    .task { margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 5px; }
    .priority-high { border-left: 3px solid #ff4444; }
    .priority-medium { border-left: 3px solid #ffaa00; }
    .priority-low { border-left: 3px solid #00aa00; }
    .note { margin: 10px 0; padding: 10px; background: #ffffcc; border-radius: 5px; }
  </style>
</head>
<body>
  <h1>Kanban Export</h1>
  <p><strong>Export Date:</strong> ${data.exportDate}</p>
  <p><strong>Version:</strong> ${data.version}</p>
`;

    // Boards section
    if (data.data.boards && data.data.boards.length > 0) {
      html += '<h2>Boards</h2>';
      for (const board of data.data.boards) {
        html += `<div class="board">`;
        html += `<h3>${this.escapeHtml(board.name)}</h3>`;
        if (board.description) {
          html += `<p>${this.escapeHtml(board.description)}</p>`;
        }
        html += '</div>';
      }
    }

    // Tasks section
    if (data.data.tasks && data.data.tasks.length > 0) {
      html += '<h2>Tasks</h2>';
      const tasksByBoard = this.groupTasksByBoard(data.data.tasks);

      for (const [boardId, tasks] of Object.entries(tasksByBoard)) {
        const board = data.data.boards?.find(b => b.id === boardId);
        html += `<h3>${board ? this.escapeHtml(board.name) : 'Unknown Board'}</h3>`;

        for (const task of tasks) {
          html += `<div class="task priority-${task.priority || 'medium'}">`;
          html += `<strong>${this.escapeHtml(task.title)}</strong> (${task.status})`;
          if (task.description) {
            html += `<p>${this.escapeHtml(task.description)}</p>`;
          }
          if (task.dueDate) {
            html += `<p>Due: ${new Date(task.dueDate).toLocaleDateString()}</p>`;
          }
          html += '</div>';
        }
      }
    }

    // Notes section
    if (data.data.notes && data.data.notes.length > 0) {
      html += '<h2>Notes</h2>';
      for (const note of data.data.notes) {
        html += `<div class="note">`;
        html += `<strong>${note.category || 'General'}</strong><br/>`;
        html += `${this.escapeHtml(note.content)}`;
        html += '</div>';
      }
    }

    html += '</body></html>';
    await fs.writeFile(outputPath, html);
  }

  /**
   * Group tasks by board ID
   */
  private groupTasksByBoard(tasks: Task[]): Record<string, Task[]> {
    return tasks.reduce(
      (acc, task) => {
        const { boardId } = task;
        if (!acc[boardId]) {
          acc[boardId] = [];
        }
        acc[boardId].push(task);
        return acc;
      },
      {} as Record<string, Task[]>
    );
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
}
