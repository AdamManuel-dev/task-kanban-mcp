import type { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import type { ConfigManager } from '../config';
import type { ApiClient } from '../client';
import type { OutputFormatter } from '../formatter';

export function registerExportCommands(program: Command): void {
  const exportCmd = program.command('export').description('Export kanban data');

  // Get global components
  const getComponents = () =>
    (global as any).cliComponents as {
      config: ConfigManager;
      apiClient: ApiClient;
      formatter: OutputFormatter;
    };
  const importCmd = program.command('import').description('Import kanban data');

  // Export to JSON
  exportCmd
    .command('json [file]')
    .description('Export data to JSON format')
    .option('--boards', 'Include boards', true)
    .option('--tasks', 'Include tasks', true)
    .option('--tags', 'Include tags', true)
    .option('--notes', 'Include notes', true)
    .option('--board-ids <ids...>', 'Filter by board IDs')
    .option('--pretty', 'Pretty print JSON', true)
    .action(async (file, options) => {
      try {
        const { apiClient, formatter } = getComponents();

        formatter.info('Exporting data to JSON...');

        const params: any = {
          format: 'json',
          includeBoards: options.boards,
          includeTasks: options.tasks,
          includeTags: options.tags,
          includeNotes: options.notes,
        };

        if (options.boardIds) {
          params.boardIds = options.boardIds;
        }

        const response = await apiClient.get('/export', { params }) as any;

        if (file) {
          const outputPath = path.resolve(file);
          const jsonData = options.pretty
            ? JSON.stringify(response.data, null, 2)
            : JSON.stringify(response.data);

          await fs.writeFile(outputPath, jsonData);
          formatter.success(`Data exported to ${outputPath}`);
        } else {
          formatter.output(JSON.stringify(response.data, null, 2));
        }
      } catch (error: any) {
        const { formatter } = getComponents();
        formatter.error(`Export failed: ${error.message}`);
        process.exit(1);
      }
    });

  // Export to CSV
  exportCmd
    .command('csv <directory>')
    .description('Export data to CSV files')
    .option('--boards', 'Include boards', true)
    .option('--tasks', 'Include tasks', true)
    .option('--tags', 'Include tags', true)
    .option('--notes', 'Include notes', true)
    .action(async (_directory, options) => {
      try {
        const { apiClient, formatter } = getComponents();

        formatter.info('Exporting data to CSV...');

        const params: any = {
          format: 'csv',
          includeBoards: options.boards,
          includeTasks: options.tasks,
          includeTags: options.tags,
          includeNotes: options.notes,
        };

        const response = await apiClient.get('/export', { params }) as any;

        formatter.success('CSV export completed');
        formatter.info(`Files: ${response.data.filePath}`);
        formatter.info(`Items: ${response.data.itemCount}`);
      } catch (error: any) {
        const { formatter } = getComponents();
        formatter.error(`Export failed: ${error.message}`);
        process.exit(1);
      }
    });

  // Import from JSON
  importCmd
    .command('json <file>')
    .description('Import data from JSON file')
    .option('--validate-only', 'Only validate without importing')
    .option('--conflict <resolution>', 'Conflict resolution (skip/overwrite/rename)', 'skip')
    .action(async (file, options) => {
      try {
        const { apiClient, formatter } = getComponents();

        formatter.info('Reading JSON file...');

        const filePath = path.resolve(file);
        const fileContent = await fs.readFile(filePath, 'utf-8');

        // Parse to validate JSON
        JSON.parse(fileContent);

        formatter.info('Uploading for import...');

        const formData = new FormData();
        formData.append('file', new Blob([fileContent]), path.basename(filePath));
        formData.append('format', 'json');
        formData.append('conflictResolution', options.conflict);

        if (options.validateOnly) {
          formData.append('validateOnly', 'true');
        }

        const endpoint = options.validateOnly ? '/import/validate' : '/import';
        const response = await apiClient.post(endpoint, formData) as any;

        if (options.validateOnly) {
          formatter.success('Validation completed');
          formatter.info(`Valid: ${response.data.valid}`);
          formatter.info(`Would import: ${response.data.wouldImport} items`);
          formatter.info(`Would skip: ${response.data.wouldSkip} items`);

          if (response.data.errors.length > 0) {
            formatter.error('Validation errors:');
            response.data.errors.forEach((err: string) => {
              formatter.error(`  • ${err}`);
            });
          }
        } else {
          formatter.success('Import completed');
          formatter.info(`Imported: ${response.data.imported} items`);
          formatter.info(`Skipped: ${response.data.skipped} items`);

          if (response.data.errors.length > 0) {
            formatter.error('Import errors:');
            response.data.errors.forEach((err: string) => {
              formatter.error(`  • ${err}`);
            });
          }
        }
      } catch (error: any) {
        const { formatter } = getComponents();
        formatter.error(`Import failed: ${error.message}`);
        process.exit(1);
      }
    });
}
