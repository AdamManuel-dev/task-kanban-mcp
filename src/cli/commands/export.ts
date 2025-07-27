import type { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import type {
  CliComponents,
  ExportParams,
  ImportValidationResponse,
  ImportResponse,
} from '../types';

export function registerExportCommands(program: Command): void {
  const exportCmd = program.command('export').description('Export kanban data');

  // Get global components with proper typing
  const getComponents = (): CliComponents => global.cliComponents;
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

        const params: ExportParams = {
          format: 'json',
          includeBoards: options.boards,
          includeTasks: options.tasks,
          includeTags: options.tags,
          includeNotes: options.notes,
        };

        if (options.boardIds) {
          params.boardIds = options.boardIds;
        }

        const response = await apiClient.get('/export', { params });

        if (file) {
          const outputPath = path.resolve(file);
          const jsonData = options.pretty
            ? JSON.stringify((response as any).data, null, 2)
            : JSON.stringify((response as any).data);

          await fs.writeFile(outputPath, jsonData);
          formatter.success(`Data exported to ${String(outputPath)}`);
        } else {
          formatter.output(JSON.stringify((response as any).data, null, 2));
        }
      } catch (error) {
        const { formatter } = getComponents();
        formatter.error(
          `Export failed: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
        );
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

        const params: ExportParams = {
          format: 'csv',
          includeBoards: options.boards,
          includeTasks: options.tasks,
          includeTags: options.tags,
          includeNotes: options.notes,
        };

        const response = await apiClient.get('/export', { params });

        formatter.success('CSV export completed');
        formatter.info(`Files: ${String(String((response as any).filePath))}`);
        formatter.info(`Items: ${String(String((response as any).itemCount))}`);
      } catch (error) {
        const { formatter } = getComponents();
        formatter.error(
          `Export failed: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
        );
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
        const response = await apiClient.post(endpoint, formData);

        if (options.validateOnly) {
          const validationData = response.data as ImportValidationResponse;
          formatter.success('Validation completed');
          formatter.info(`Valid: ${String(String(validationData.valid))}`);
          formatter.info(`Would import: ${String(String(validationData.wouldImport))} items`);
          formatter.info(`Would skip: ${String(String(validationData.wouldSkip))} items`);

          if (validationData.errors.length > 0) {
            formatter.error('Validation errors:');
            validationData.errors.forEach((err: string) => {
              formatter.error(`  • ${String(err)}`);
            });
          }
        } else {
          const importData = response.data as ImportResponse;
          formatter.success('Import completed');
          formatter.info(`Imported: ${String(String(importData.imported))} items`);
          formatter.info(`Skipped: ${String(String(importData.skipped))} items`);

          if (importData.errors.length > 0) {
            formatter.error('Import errors:');
            importData.errors.forEach((err: string) => {
              formatter.error(`  • ${String(err)}`);
            });
          }
        }
      } catch (error) {
        const { formatter } = getComponents();
        formatter.error(
          `Import failed: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`
        );
        process.exit(1);
      }
    });
}
