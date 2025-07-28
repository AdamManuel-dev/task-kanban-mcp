/**
 * Format Converters - Convert between different export formats
 *
 * @module utils/formatConverters
 * @description Provides utilities to convert data between different export formats
 * including JSON, CSV, and other formats. Useful for data migration and format compatibility.
 */

import type { ExportData, ExportFileFormat } from '@/services/ExportService';
import { logger } from '@/utils/logger';

export interface FormatConverterOptions {
  preserveMetadata?: boolean;
  includeHeaders?: boolean;
  delimiter?: string;
  quoteChar?: string;
  escapeChar?: string;
  dateFormat?: string;
  timezone?: string;
}

export interface ConversionResult {
  success: boolean;
  data?: string;
  format: string;
  itemCount: number;
  errors: string[];
  warnings: string[];
}

/**
 * Convert JSON export data to CSV format
 */
export function jsonToCsv(
  jsonData: ExportData | ExportFileFormat,
  options: FormatConverterOptions = {}
): ConversionResult {
  const result: ConversionResult = {
    success: false,
    format: 'csv',
    itemCount: 0,
    errors: [],
    warnings: [],
  };

  try {
    const data = 'data' in jsonData ? jsonData.data : jsonData;
    const csvLines: string[] = [];
    let totalItems = 0;

    const delimiter = options.delimiter ?? ',';
    const quoteChar = options.quoteChar ?? '"';
    const escapeChar = options.escapeChar ?? '\\';

    // Helper function to escape CSV values
    const escapeCsvValue = (value: string): string => {
      if (value.includes(delimiter) || value.includes(quoteChar) || value.includes('\n')) {
        return `${quoteChar}${value.replace(new RegExp(quoteChar, 'g'), `${escapeChar}${quoteChar}`)}${quoteChar}`;
      }
      return value;
    };

    // Convert boards to CSV
    if (data.boards && data.boards.length > 0) {
      csvLines.push('=== BOARDS ===');
      const boardHeaders = ['id', 'name', 'description', 'is_active', 'created_at', 'updated_at'];
      csvLines.push(boardHeaders.join(delimiter));

      data.boards.forEach(board => {
        const row = [
          board.id,
          escapeCsvValue(board.name),
          board.description ? escapeCsvValue(board.description) : '',
          (board as any).is_active ? 'true' : 'false',
          board.created_at,
          board.updated_at,
        ];
        csvLines.push(row.join(delimiter));
        totalItems++;
      });
      csvLines.push(''); // Empty line separator
    }

    // Convert tasks to CSV
    if (data.tasks && data.tasks.length > 0) {
      csvLines.push('=== TASKS ===');
      const taskHeaders = [
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
      ];
      csvLines.push(taskHeaders.join(delimiter));

      data.tasks.forEach(task => {
        const row = [
          task.id,
          escapeCsvValue(task.title),
          task.description ? escapeCsvValue(task.description) : '',
          task.board_id,
          task.column_id,
          task.position,
          task.priority ?? '',
          task.status,
          task.assignee ? escapeCsvValue(task.assignee) : '',
          task.due_date ?? '',
          task.created_at,
          task.updated_at,
        ];
        csvLines.push(row.join(delimiter));
        totalItems++;
      });
      csvLines.push(''); // Empty line separator
    }

    // Convert tags to CSV
    if (data.tags && data.tags.length > 0) {
      csvLines.push('=== TAGS ===');
      const tagHeaders = ['id', 'name', 'color', 'description', 'parent_tag_id', 'created_at'];
      csvLines.push(tagHeaders.join(delimiter));

      data.tags.forEach(tag => {
        const row = [
          tag.id,
          escapeCsvValue(tag.name),
          tag.color,
          tag.description ? escapeCsvValue(tag.description) : '',
          tag.parent_tag_id ?? '',
          tag.created_at,
        ];
        csvLines.push(row.join(delimiter));
        totalItems++;
      });
      csvLines.push(''); // Empty line separator
    }

    // Convert notes to CSV
    if (data.notes && data.notes.length > 0) {
      csvLines.push('=== NOTES ===');
      const noteHeaders = [
        'id',
        'content',
        'category',
        'task_id',
        'pinned',
        'created_at',
        'updated_at',
      ];
      csvLines.push(noteHeaders.join(delimiter));

      data.notes.forEach(note => {
        const row = [
          note.id,
          escapeCsvValue(note.content),
          note.category,
          note.task_id,
          note.pinned ? 'true' : 'false',
          note.created_at,
          note.updated_at,
        ];
        csvLines.push(row.join(delimiter));
        totalItems++;
      });
      csvLines.push(''); // Empty line separator
    }

    // Convert task-tag relationships to CSV
    if (data.taskTags && data.taskTags.length > 0) {
      csvLines.push('=== TASK_TAGS ===');
      const taskTagHeaders = ['task_id', 'tag_id'];
      csvLines.push(taskTagHeaders.join(delimiter));

      data.taskTags.forEach(mapping => {
        const row = [mapping.task_id, mapping.tag_id];
        csvLines.push(row.join(delimiter));
        totalItems++;
      });
      csvLines.push(''); // Empty line separator
    }

    // Add metadata if requested
    if (options.preserveMetadata && data.metadata) {
      csvLines.push('=== METADATA ===');
      csvLines.push('key,value');
      csvLines.push(`exportDate,${data.metadata.exportDate}`);
      csvLines.push(`version,${data.metadata.version}`);
      csvLines.push(`totalItems,${data.metadata.totalItems}`);
    }

    result.success = true;
    result.data = csvLines.join('\n');
    result.itemCount = totalItems;

    logger.info('JSON to CSV conversion completed', { itemCount: totalItems });
  } catch (error) {
    result.errors.push(
      `Conversion failed: ${error instanceof Error ? error.message : String(error)}`
    );
    logger.error('JSON to CSV conversion failed:', error);
  }

  return result;
}

/**
 * Convert CSV data to JSON format
 */
export function csvToJson(csvData: string, options: FormatConverterOptions = {}): ConversionResult {
  const result: ConversionResult = {
    success: false,
    format: 'json',
    itemCount: 0,
    errors: [],
    warnings: [],
  };

  try {
    const lines = csvData.split('\n').filter(line => line.trim() !== '');
    const data: ExportData = {};
    let currentSection = '';
    let headers: string[] = [];
    let totalItems = 0;

    const delimiter = options.delimiter ?? ',';
    const quoteChar = options.quoteChar ?? '"';

    // Helper function to parse CSV line
    const parseCsvLine = (line: string): string[] => {
      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      let i = 0;

      while (i < line.length) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === quoteChar && !inQuotes) {
          inQuotes = true;
        } else if (char === quoteChar && inQuotes && nextChar === quoteChar) {
          current += quoteChar;
          i++; // Skip next quote
        } else if (char === quoteChar && inQuotes) {
          inQuotes = false;
        } else if (char === delimiter && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
        i++;
      }

      values.push(current.trim());
      return values;
    };

    for (const line of lines) {
      if (line.startsWith('===') && line.endsWith('===')) {
        // Section header
        currentSection = line.replace(/===/g, '').trim().toLowerCase();
        headers = [];
        continue;
      }

      if (headers.length === 0) {
        // First line after section header is headers
        headers = parseCsvLine(line);
        continue;
      }

      // Data line
      const values = parseCsvLine(line);
      if (values.length !== headers.length) {
        result.warnings.push(`Skipping malformed line in ${currentSection}: ${line}`);
        continue;
      }

      const item: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        const value = values[index];
        // Convert string values to appropriate types
        if (value === 'true') {
          item[header] = true;
        } else if (value === 'false') {
          item[header] = false;
        } else if (value === '') {
          item[header] = null;
        } else {
          item[header] = value;
        }
      });

      // Add to appropriate section
      switch (currentSection) {
        case 'boards':
          if (!data.boards) data.boards = [];
          data.boards.push(item as any);
          break;
        case 'tasks':
          if (!data.tasks) data.tasks = [];
          data.tasks.push(item as any);
          break;
        case 'tags':
          if (!data.tags) data.tags = [];
          data.tags.push(item as any);
          break;
        case 'notes':
          if (!data.notes) data.notes = [];
          data.notes.push(item as any);
          break;
        case 'task_tags':
          if (!data.taskTags) data.taskTags = [];
          data.taskTags.push(item as any);
          break;
        case 'metadata':
          if (!data.metadata) data.metadata = {} as any;
          (data.metadata as any)[item['key'] as string] = item['value'];
          break;
        default:
          result.warnings.push(`Unknown section: ${currentSection}`);
      }

      totalItems++;
    }

    // Add metadata if not present
    if (!data.metadata) {
      data.metadata = {
        exportDate: new Date().toISOString(),
        version: '1.0',
        totalItems,
      };
    }

    result.success = true;
    result.data = JSON.stringify(data, null, 2);
    result.itemCount = totalItems;

    logger.info('CSV to JSON conversion completed', { itemCount: totalItems });
  } catch (error) {
    result.errors.push(
      `Conversion failed: ${error instanceof Error ? error.message : String(error)}`
    );
    logger.error('CSV to JSON conversion failed:', error);
  }

  return result;
}

/**
 * Convert data to XML format (basic implementation)
 */
export function jsonToXml(
  jsonData: ExportData | ExportFileFormat,
  options: FormatConverterOptions = {}
): ConversionResult {
  const result: ConversionResult = {
    success: false,
    format: 'xml',
    itemCount: 0,
    errors: [],
    warnings: [],
  };

  try {
    const data = 'data' in jsonData ? jsonData.data : jsonData;
    const xmlLines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', '<kanban-export>'];
    let totalItems = 0;

    // Helper function to escape XML content
    const escapeXml = (text: string): string =>
      text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    // Convert boards to XML
    if (data.boards && data.boards.length > 0) {
      xmlLines.push('  <boards>');
      data.boards.forEach(board => {
        xmlLines.push('    <board>');
        xmlLines.push(`      <id>${escapeXml(board.id)}</id>`);
        xmlLines.push(`      <name>${escapeXml(board.name)}</name>`);
        if (board.description) {
          xmlLines.push(`      <description>${escapeXml(board.description)}</description>`);
        }
        xmlLines.push(`      <is_active>${(board as any).is_active}</is_active>`);
        xmlLines.push(`      <created_at>${board.created_at}</created_at>`);
        xmlLines.push(`      <updated_at>${board.updated_at}</updated_at>`);
        xmlLines.push('    </board>');
        totalItems++;
      });
      xmlLines.push('  </boards>');
    }

    // Convert tasks to XML
    if (data.tasks && data.tasks.length > 0) {
      xmlLines.push('  <tasks>');
      data.tasks.forEach(task => {
        xmlLines.push('    <task>');
        xmlLines.push(`      <id>${escapeXml(task.id)}</id>`);
        xmlLines.push(`      <title>${escapeXml(task.title)}</title>`);
        if (task.description) {
          xmlLines.push(`      <description>${escapeXml(task.description)}</description>`);
        }
        xmlLines.push(`      <board_id>${escapeXml(task.board_id)}</board_id>`);
        xmlLines.push(`      <column_id>${escapeXml(task.column_id)}</column_id>`);
        xmlLines.push(`      <position>${task.position}</position>`);
        xmlLines.push(`      <priority>${task.priority ?? ''}</priority>`);
        xmlLines.push(`      <status>${escapeXml(task.status)}</status>`);
        if (task.assignee) {
          xmlLines.push(`      <assignee>${escapeXml(task.assignee)}</assignee>`);
        }
        if (task.due_date) {
          xmlLines.push(`      <due_date>${task.due_date}</due_date>`);
        }
        xmlLines.push(`      <created_at>${task.created_at}</created_at>`);
        xmlLines.push(`      <updated_at>${task.updated_at}</updated_at>`);
        xmlLines.push('    </task>');
        totalItems++;
      });
      xmlLines.push('  </tasks>');
    }

    // Convert tags to XML
    if (data.tags && data.tags.length > 0) {
      xmlLines.push('  <tags>');
      data.tags.forEach(tag => {
        xmlLines.push('    <tag>');
        xmlLines.push(`      <id>${escapeXml(tag.id)}</id>`);
        xmlLines.push(`      <name>${escapeXml(tag.name)}</name>`);
        xmlLines.push(`      <color>${escapeXml(tag.color)}</color>`);
        if (tag.description) {
          xmlLines.push(`      <description>${escapeXml(tag.description)}</description>`);
        }
        if (tag.parent_tag_id) {
          xmlLines.push(`      <parent_tag_id>${escapeXml(tag.parent_tag_id)}</parent_tag_id>`);
        }
        xmlLines.push(`      <created_at>${tag.created_at}</created_at>`);
        xmlLines.push('    </tag>');
        totalItems++;
      });
      xmlLines.push('  </tags>');
    }

    // Convert notes to XML
    if (data.notes && data.notes.length > 0) {
      xmlLines.push('  <notes>');
      data.notes.forEach(note => {
        xmlLines.push('    <note>');
        xmlLines.push(`      <id>${escapeXml(note.id)}</id>`);
        xmlLines.push(`      <content>${escapeXml(note.content)}</content>`);
        xmlLines.push(`      <category>${escapeXml(note.category)}</category>`);
        xmlLines.push(`      <task_id>${escapeXml(note.task_id)}</task_id>`);
        xmlLines.push(`      <pinned>${note.pinned}</pinned>`);
        xmlLines.push(`      <created_at>${note.created_at}</created_at>`);
        xmlLines.push(`      <updated_at>${note.updated_at}</updated_at>`);
        xmlLines.push('    </note>');
        totalItems++;
      });
      xmlLines.push('  </notes>');
    }

    // Add metadata
    if (data.metadata) {
      xmlLines.push('  <metadata>');
      xmlLines.push(`    <exportDate>${data.metadata.exportDate}</exportDate>`);
      xmlLines.push(`    <version>${data.metadata.version}</version>`);
      xmlLines.push(`    <totalItems>${data.metadata.totalItems}</totalItems>`);
      xmlLines.push('  </metadata>');
    }

    xmlLines.push('</kanban-export>');

    result.success = true;
    result.data = xmlLines.join('\n');
    result.itemCount = totalItems;

    logger.info('JSON to XML conversion completed', { itemCount: totalItems });
  } catch (error) {
    result.errors.push(
      `Conversion failed: ${error instanceof Error ? error.message : String(error)}`
    );
    logger.error('JSON to XML conversion failed:', error);
  }

  return result;
}

/**
 * Get supported format conversions
 */
export function getSupportedConversions(): Record<string, string[]> {
  return {
    from: ['json', 'csv'],
    to: ['json', 'csv', 'xml'],
    conversions: [
      { from: 'json', to: 'csv', function: 'jsonToCsv' },
      { from: 'csv', to: 'json', function: 'csvToJson' },
      { from: 'json', to: 'xml', function: 'jsonToXml' },
    ],
  };
}
