import { logger } from '@/utils/logger';
import type { DatabaseConnection } from '@/database/connection';
import type { Board, Task, Tag, Note, Column } from '@/types';
import { BaseServiceError } from '@/utils/errors';
import * as fs from 'fs/promises';
import * as path from 'path';

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
  metadata?: {
    exportDate: string;
    version: string;
    totalItems: number;
  };
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
  constructor(private db: DatabaseConnection) {}

  /**
   * Export data to JSON format
   */
  async exportToJSON(options: ExportOptions): Promise<ExportResult> {
    logger.info('Starting JSON export', { options });

    try {
      const data: { version: string; exportDate: string; data: ExportData } = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        data: {}
      };

      let itemCount = 0;

      // Export boards
      if (options.includeBoards !== false) {
        const boards = await this.getBoards(options);
        data.data.boards = boards;
        itemCount += boards.length;
        
        // Include columns with boards
        const columns = await this.getColumns(boards.map(b => b.id));
        data.data.columns = columns;
        itemCount += columns.length;
      }

      // Export tasks
      if (options.includeTasks !== false) {
        const tasks = await this.getTasks(options);
        data.data.tasks = tasks;
        itemCount += tasks.length;
      }

      // Export tags
      if (options.includeTags !== false) {
        const tags = await this.getTags(options);
        data.data.tags = tags;
        itemCount += tags.length;
        
        // Include task-tag mappings
        const taskTags = await this.getTaskTags(options);
        data.data.taskTags = taskTags;
        itemCount += taskTags.length;
      }

      // Export notes
      if (options.includeNotes !== false) {
        const notes = await this.getNotes(options);
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
        itemCount
      };
      
      if (options.outputPath) {
        result.filePath = options.outputPath;
      } else {
        result.data = data;
      }
      
      return result;
    } catch (error) {
      logger.error('JSON export failed', { error });
      throw new BaseServiceError('EXPORT_FAILED', 'Failed to export data to JSON', 500, { error });
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
        const boardsCsv = this.convertToCSV(boards, ['id', 'name', 'description', 'is_active', 'created_at', 'updated_at']);
        const boardsFile = path.join(baseDir, `${baseName}_boards.csv`);
        await fs.writeFile(boardsFile, boardsCsv);
        csvFiles.push(boardsFile);
        totalItems += boards.length;
      }

      // Export tasks to CSV
      if (options.includeTasks !== false) {
        const tasks = await this.getTasks(options);
        const tasksCsv = this.convertToCSV(tasks, [
          'id', 'title', 'description', 'board_id', 'column_id', 'position',
          'priority', 'status', 'assignee', 'due_date', 'estimated_hours',
          'actual_hours', 'parent_task_id', 'created_at', 'updated_at'
        ]);
        const tasksFile = path.join(baseDir, `${baseName}_tasks.csv`);
        await fs.writeFile(tasksFile, tasksCsv);
        csvFiles.push(tasksFile);
        totalItems += tasks.length;
      }

      // Export tags to CSV
      if (options.includeTags !== false) {
        const tags = await this.getTags(options);
        const tagsCsv = this.convertToCSV(tags, ['id', 'name', 'color', 'description', 'parent_tag_id', 'created_at']);
        const tagsFile = path.join(baseDir, `${baseName}_tags.csv`);
        await fs.writeFile(tagsFile, tagsCsv);
        csvFiles.push(tagsFile);
        totalItems += tags.length;
      }

      // Export notes to CSV
      if (options.includeNotes !== false) {
        const notes = await this.getNotes(options);
        const notesCsv = this.convertToCSV(notes, [
          'id', 'content', 'category', 'task_id', 'is_pinned', 'created_at', 'updated_at'
        ]);
        const notesFile = path.join(baseDir, `${baseName}_notes.csv`);
        await fs.writeFile(notesFile, notesCsv);
        csvFiles.push(notesFile);
        totalItems += notes.length;
      }

      return {
        format: 'csv',
        itemCount: totalItems,
        filePath: csvFiles.join(', ')
      };
    } catch (error) {
      logger.error('CSV export failed', { error });
      throw new BaseServiceError('EXPORT_FAILED', 'Failed to export data to CSV', 500, { error });
    }
  }

  /**
   * Import data from JSON
   */
  async importFromJSON(data: ExportData | { data: ExportData }, options: ImportOptions): Promise<ImportResult> {
    logger.info('Starting JSON import', { options });
    
    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      errors: [],
      conflicts: []
    };

    try {
      // Validate JSON structure
      if (!data.version || !data.data) {
        throw new BaseServiceError('INVALID_FORMAT', 'Invalid JSON format', 400);
      }

      // Use transaction
      if (options.validateOnly) {
        // For validation, we'll use a transaction that always rolls back
        try {
          await this.db.transaction(async () => {
            // Import in correct order to maintain referential integrity
            
            // 1. Import boards
            if (data.data.boards) {
              const boardResult = await this.importBoards(data.data.boards, options);
              result.imported += boardResult.imported;
              result.skipped += boardResult.skipped;
              result.errors.push(...boardResult.errors);
              result.conflicts.push(...boardResult.conflicts);
            }

            // 2. Import columns
            if (data.data.columns) {
              const columnResult = await this.importColumns(data.data.columns, options);
              result.imported += columnResult.imported;
              result.skipped += columnResult.skipped;
              result.errors.push(...columnResult.errors);
              result.conflicts.push(...columnResult.conflicts);
            }

            // 3. Import tasks
            if (data.data.tasks) {
              const taskResult = await this.importTasks(data.data.tasks, options);
              result.imported += taskResult.imported;
              result.skipped += taskResult.skipped;
              result.errors.push(...taskResult.errors);
              result.conflicts.push(...taskResult.conflicts);
            }

            // 4. Import tags
            if (data.data.tags) {
              const tagResult = await this.importTags(data.data.tags, options);
              result.imported += tagResult.imported;
              result.skipped += tagResult.skipped;
              result.errors.push(...tagResult.errors);
              result.conflicts.push(...tagResult.conflicts);
            }

            // 5. Import notes
            if (data.data.notes) {
              const noteResult = await this.importNotes(data.data.notes, options);
              result.imported += noteResult.imported;
              result.skipped += noteResult.skipped;
              result.errors.push(...noteResult.errors);
              result.conflicts.push(...noteResult.conflicts);
            }

            // 6. Import task-tag mappings
            if (data.data.taskTags) {
              const taskTagResult = await this.importTaskTags(data.data.taskTags, options);
              result.imported += taskTagResult.imported;
              result.skipped += taskTagResult.skipped;
              result.errors.push(...taskTagResult.errors);
              result.conflicts.push(...taskTagResult.conflicts);
            }
            
            // Force rollback for validation
            throw new Error('VALIDATION_ONLY');
          });
        } catch (error: unknown) {
          if (error.message !== 'VALIDATION_ONLY') {
            throw error;
          }
          logger.info('Validation complete, transaction rolled back');
        }
      } else {
        // Regular import with commit
        await this.db.transaction(async () => {
          // Import in correct order to maintain referential integrity
          
          // 1. Import boards
          if (data.data.boards) {
            const boardResult = await this.importBoards(data.data.boards, options);
            result.imported += boardResult.imported;
            result.skipped += boardResult.skipped;
            result.errors.push(...boardResult.errors);
            result.conflicts.push(...boardResult.conflicts);
          }

          // 2. Import columns
          if (data.data.columns) {
            const columnResult = await this.importColumns(data.data.columns, options);
            result.imported += columnResult.imported;
            result.skipped += columnResult.skipped;
            result.errors.push(...columnResult.errors);
            result.conflicts.push(...columnResult.conflicts);
          }

          // 3. Import tasks
          if (data.data.tasks) {
            const taskResult = await this.importTasks(data.data.tasks, options);
            result.imported += taskResult.imported;
            result.skipped += taskResult.skipped;
            result.errors.push(...taskResult.errors);
            result.conflicts.push(...taskResult.conflicts);
          }

          // 4. Import tags
          if (data.data.tags) {
            const tagResult = await this.importTags(data.data.tags, options);
            result.imported += tagResult.imported;
            result.skipped += tagResult.skipped;
            result.errors.push(...tagResult.errors);
            result.conflicts.push(...tagResult.conflicts);
          }

          // 5. Import notes
          if (data.data.notes) {
            const noteResult = await this.importNotes(data.data.notes, options);
            result.imported += noteResult.imported;
            result.skipped += noteResult.skipped;
            result.errors.push(...noteResult.errors);
            result.conflicts.push(...noteResult.conflicts);
          }

          // 6. Import task-tag mappings
          if (data.data.taskTags) {
            const taskTagResult = await this.importTaskTags(data.data.taskTags, options);
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
      throw new BaseServiceError('IMPORT_FAILED', 'Failed to import data from JSON', 500, { error });
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

  private async getTaskTags(_options: ExportOptions): Promise<Array<{ task_id: string; tag_id: string }>> {
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
    const rows = data.map(item => {
      return columns.map(col => {
        const value = item[col];
        if (value === null || value === undefined) return '';
        if (typeof value === 'string' && (value.includes(',') || value.includes('\n') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',');
    });
    return [header, ...rows].join('\n');
  }

  private async importBoards(boards: Board[], options: ImportOptions): Promise<ImportResult> {
    const result: ImportResult = { imported: 0, skipped: 0, errors: [], conflicts: [] };
    
    for (const board of boards) {
      try {
        const existing = await this.db.queryOne<Board>('SELECT * FROM boards WHERE id = ?', [board.id]);
        
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
          [board.id, board.name, board.description, (board as Board & { is_active?: boolean }).is_active ?? true, board.created_at, board.updated_at]
        );
        result.imported++;
      } catch (error: unknown) {
        result.errors.push(`Failed to import board ${board.name}: ${error.message}`);
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
          [column.id, column.board_id, column.name, column.position, column.wip_limit, column.created_at, column.updated_at]
        );
        result.imported++;
      } catch (error: unknown) {
        result.errors.push(`Failed to import column ${column.name}: ${error.message}`);
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
        const existing = await this.db.queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [task.id]);
        
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
            task.id, task.title, task.description, task.board_id, task.column_id,
            task.position, task.priority, task.status, task.assignee, task.due_date,
            task.estimated_hours, task.actual_hours, task.parent_task_id,
            task.metadata, task.created_at, task.updated_at
          ]
        );
        result.imported++;
      } catch (error: unknown) {
        result.errors.push(`Failed to import task ${task.title}: ${error.message}`);
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
        const existing = await this.db.queryOne<Tag>('SELECT * FROM tags WHERE name = ?', [tag.name]);
        
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
        result.errors.push(`Failed to import tag ${tag.name}: ${error.message}`);
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
          [note.id, note.content, note.category, note.task_id, note.pinned, note.created_at, note.updated_at]
        );
        result.imported++;
      } catch (error: unknown) {
        result.errors.push(`Failed to import note: ${error.message}`);
      }
    }
    
    return result;
  }

  private async importTaskTags(taskTags: Array<{ task_id: string; tag_id: string }>, _options: ImportOptions): Promise<ImportResult> {
    const result: ImportResult = { imported: 0, skipped: 0, errors: [], conflicts: [] };
    
    for (const mapping of taskTags) {
      try {
        await this.db.execute(
          'INSERT OR IGNORE INTO task_tags (task_id, tag_id, created_at) VALUES (?, ?, ?)',
          [mapping.task_id, mapping.tag_id, mapping.created_at]
        );
        result.imported++;
      } catch (error: unknown) {
        result.errors.push(`Failed to import task-tag mapping: ${error.message}`);
      }
    }
    
    return result;
  }
}