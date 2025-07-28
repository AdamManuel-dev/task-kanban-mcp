import type { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { jsonToCsv, csvToJson, jsonToXml, getSupportedConversions } from '@/utils/formatConverters';
import type {
  CliComponents,
  ImportValidationResponse,
  ImportResponse,
  AnyApiResponse,
  ExportResponse,
} from '../types';
import { isSuccessResponse } from '../api-client-wrapper';

interface AnonymizeExportOptions {
  boards?: boolean;
  tasks?: boolean;
  tags?: boolean;
  notes?: boolean;
  boardIds?: string;
  format?: string;
  anonymizeUserData?: boolean;
  anonymizeTaskTitles?: boolean;
  anonymizeDescriptions?: boolean;
  anonymizeNotes?: boolean;
  preserveStructure?: boolean;
  hashSeed?: string;
}

interface ConvertOptions {
  from?: string;
  to?: string;
  delimiter?: string;
  pretty?: boolean;
}

export function registerExportCommands(program: Command): void {
  const exportCmd = program.command('export').alias('e').description('Export data');

  // Get global components with proper typing
  const getComponents = (): CliComponents => global.cliComponents;
  const importCmd = program.command('import').description('Import kanban data');

  // Export to JSON
  exportCmd
    .command('json [file]')
    .description('Export data to JSON file or stdout')
    .option('--boards', 'Include boards', true)
    .option('--tasks', 'Include tasks', true)
    .option('--tags', 'Include tags', true)
    .option('--notes', 'Include notes', true)
    .option('--board-ids <ids>', 'Specific board IDs to export')
    .option('--anonymize', 'Anonymize sensitive data')
    .option('--anonymize-user-data', 'Anonymize user data (assignees, etc.)')
    .option('--anonymize-task-titles', 'Anonymize task titles')
    .option('--anonymize-descriptions', 'Anonymize descriptions')
    .option('--anonymize-notes', 'Anonymize note content')
    .option('--preserve-structure', 'Preserve data structure while anonymizing')
    .option('--hash-seed <seed>', 'Custom hash seed for deterministic anonymization')
    .option('--pretty', 'Pretty print JSON output')
    .action(
      async (
        file: string | undefined,
        options: {
          boards?: boolean;
          tasks?: boolean;
          tags?: boolean;
          notes?: boolean;
          boardIds?: string;
          anonymize?: boolean;
          anonymizeUserData?: boolean;
          anonymizeTaskTitles?: boolean;
          anonymizeDescriptions?: boolean;
          anonymizeNotes?: boolean;
          preserveStructure?: boolean;
          hashSeed?: string;
          pretty?: boolean;
        }
      ) => {
        try {
          const { apiClient, formatter } = getComponents();

          formatter.info('Exporting data to JSON...');

          const params: Record<string, string> = {
            format: 'json',
            includeBoards: String(options.boards),
            includeTasks: String(options.tasks),
            includeTags: String(options.tags),
            includeNotes: String(options.notes),
          };

          if (options.boardIds) {
            params['boardIds'] = options.boardIds;
          }

          // Add anonymization options
          if (options.anonymize) {
            params['anonymize'] = 'true';
            params['anonymizationOptions'] = JSON.stringify({
              anonymizeUserData: options.anonymizeUserData ?? true,
              anonymizeTaskTitles: options.anonymizeTaskTitles ?? true,
              anonymizeDescriptions: options.anonymizeDescriptions ?? true,
              anonymizeNotes: options.anonymizeNotes ?? true,
              preserveStructure: options.preserveStructure ?? false,
              hashSeed: options.hashSeed,
            });
          }

          const response = await apiClient.request('GET', '/export', undefined, params);

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
            `Export failed: ${String(error instanceof Error ? error.message : 'Unknown error')}`
          );
          process.exit(1);
        }
      }
    );

  // Export to CSV
  exportCmd
    .command('csv <directory>')
    .description('Export data to CSV files')
    .option('--boards', 'Include boards', true)
    .option('--tasks', 'Include tasks', true)
    .option('--tags', 'Include tags', true)
    .option('--notes', 'Include notes', true)
    .option('--anonymize', 'Anonymize sensitive data')
    .option('--anonymize-user-data', 'Anonymize user data (assignees, etc.)')
    .option('--anonymize-task-titles', 'Anonymize task titles')
    .option('--anonymize-descriptions', 'Anonymize descriptions')
    .option('--anonymize-notes', 'Anonymize note content')
    .option('--preserve-structure', 'Preserve data structure while anonymizing')
    .option('--hash-seed <seed>', 'Custom hash seed for deterministic anonymization')
    .action(
      async (
        _directory: string,
        options: {
          boards?: boolean;
          tasks?: boolean;
          tags?: boolean;
          notes?: boolean;
          anonymize?: boolean;
          anonymizeUserData?: boolean;
          anonymizeTaskTitles?: boolean;
          anonymizeDescriptions?: boolean;
          anonymizeNotes?: boolean;
          preserveStructure?: boolean;
          hashSeed?: string;
        }
      ) => {
        try {
          const { apiClient, formatter } = getComponents();

          formatter.info('Exporting data to CSV...');

          const params: Record<string, string> = {
            format: 'csv',
            includeBoards: String(options.boards),
            includeTasks: String(options.tasks),
            includeTags: String(options.tags),
            includeNotes: String(options.notes),
          };

          // Add anonymization options
          if (options.anonymize) {
            params['anonymize'] = 'true';
            params['anonymizationOptions'] = JSON.stringify({
              anonymizeUserData: options.anonymizeUserData ?? true,
              anonymizeTaskTitles: options.anonymizeTaskTitles ?? true,
              anonymizeDescriptions: options.anonymizeDescriptions ?? true,
              anonymizeNotes: options.anonymizeNotes ?? true,
              preserveStructure: options.preserveStructure ?? false,
              hashSeed: options.hashSeed,
            });
          }

          const response = await apiClient.request('GET', '/export', undefined, params);

          formatter.success('CSV export completed');
          formatter.info(`Files: ${String((response as any).filePath)}`);
          formatter.info(`Items: ${String((response as any).itemCount)}`);
        } catch (error) {
          const { formatter } = getComponents();
          formatter.error(
            `CSV export failed: ${String(error instanceof Error ? error.message : 'Unknown error')}`
          );
          process.exit(1);
        }
      }
    );

  // Anonymized export command (convenience command)
  exportCmd
    .command('anonymized [file]')
    .description('Export anonymized data (convenience command)')
    .option('--format <format>', 'Export format (json|csv)', 'json')
    .option('--boards', 'Include boards', true)
    .option('--tasks', 'Include tasks', true)
    .option('--tags', 'Include tags', true)
    .option('--notes', 'Include notes', true)
    .option('--board-ids <ids...>', 'Filter by board IDs')
    .option('--pretty', 'Pretty print JSON', true)
    .option('--anonymize-user-data', 'Anonymize user data (assignees, etc.)', true)
    .option('--anonymize-task-titles', 'Anonymize task titles', true)
    .option('--anonymize-descriptions', 'Anonymize descriptions', true)
    .option('--anonymize-notes', 'Anonymize note content', true)
    .option('--preserve-structure', 'Preserve data structure while anonymizing')
    .option('--hash-seed <seed>', 'Custom hash seed for deterministic anonymization')
    .action(async (file: string | undefined, options: AnonymizeExportOptions) => {
      try {
        const { apiClient, formatter } = getComponents();

        formatter.info(`Exporting anonymized data to ${String(options.format).toUpperCase()}...`);

        const params: Record<string, string> = {
          format: options.format,
          includeBoards: String(options.boards),
          includeTasks: String(options.tasks),
          includeTags: String(options.tags),
          includeNotes: String(options.notes),
          anonymize: 'true',
          anonymizationOptions: JSON.stringify({
            anonymizeUserData: options.anonymizeUserData ?? true,
            anonymizeTaskTitles: options.anonymizeTaskTitles ?? true,
            anonymizeDescriptions: options.anonymizeDescriptions ?? true,
            anonymizeNotes: options.anonymizeNotes ?? true,
            preserveStructure: options.preserveStructure ?? false,
            hashSeed: options.hashSeed,
          }),
        };

        if (options.boardIds) {
          params['boardIds'] = options.boardIds;
        }

        const response = await apiClient.request<AnyApiResponse>(
          'GET',
          '/export/anonymized',
          undefined,
          params
        );

        const exportResponse = response as ExportResponse;
        if (file && options.format === 'json') {
          const outputPath = path.resolve(file);
          const jsonData = options.pretty
            ? JSON.stringify(exportResponse.data, null, 2)
            : JSON.stringify(exportResponse.data);

          await fs.writeFile(outputPath, jsonData);
          formatter.success(`Anonymized data exported to ${String(outputPath)}`);
        } else if (options.format === 'json') {
          formatter.output(JSON.stringify(exportResponse.data, null, 2));
        } else {
          formatter.success('Anonymized CSV export completed');
          if (exportResponse.filePath) {
            formatter.info(`Files: ${String(exportResponse.filePath)}`);
          }
          if (exportResponse.itemCount !== undefined) {
            formatter.info(`Items: ${String(exportResponse.itemCount)}`);
          }
        }
      } catch (error) {
        const { formatter } = getComponents();
        formatter.error(
          `Anonymized export failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  // Format conversion command
  exportCmd
    .command('convert <input> <output>')
    .description('Convert between export formats (json, csv, xml)')
    .option('--from <format>', 'Input format (json|csv)', 'json')
    .option('--to <format>', 'Output format (json|csv|xml)', 'csv')
    .option('--delimiter <delimiter>', 'CSV delimiter', ',')
    .option('--pretty', 'Pretty print JSON/XML output', false)
    .action(async (input: string, output: string, options: ConvertOptions) => {
      const { formatter } = getComponents();
      try {
        const fromFormat = (options.from || 'json').toLowerCase();
        const toFormat = (options.to || 'csv').toLowerCase();
        const supported = getSupportedConversions();
        if (!supported['from']?.includes(fromFormat) || !supported['to']?.includes(toFormat)) {
          formatter.error(`Unsupported conversion: ${fromFormat} → ${toFormat}`);
          process.exit(1);
        }

        const inputPath = path.resolve(input);
        const outputPath = path.resolve(output);
        const inputData = await fs.readFile(inputPath, 'utf-8');
        let result;

        if (fromFormat === 'json' && toFormat === 'csv') {
          const json = JSON.parse(inputData);
          result = jsonToCsv(json, { delimiter: options.delimiter });
        } else if (fromFormat === 'csv' && toFormat === 'json') {
          result = csvToJson(inputData, { delimiter: options.delimiter });
        } else if (fromFormat === 'json' && toFormat === 'xml') {
          const json = JSON.parse(inputData);
          result = jsonToXml(json);
        } else {
          formatter.error(`Conversion from ${fromFormat} to ${toFormat} is not supported.`);
          process.exit(1);
        }

        if (!result.success) {
          formatter.error(`Conversion failed: ${result.errors.join('; ')}`);
          process.exit(1);
        }

        let outputData = result.data ?? '';
        if ((toFormat === 'json' || toFormat === 'xml') && options.pretty) {
          try {
            outputData =
              toFormat === 'json' ? JSON.stringify(JSON.parse(outputData), null, 2) : outputData;
          } catch {
            // ignore pretty print if parse fails
          }
        }
        await fs.writeFile(outputPath, outputData);
        formatter.success(`Converted ${input} (${fromFormat}) → ${output} (${toFormat})`);
      } catch (error) {
        formatter.error(
          `Format conversion failed: ${error instanceof Error ? error.message : String(error)}`
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
        const response = await apiClient.request<AnyApiResponse>('POST', endpoint, formData);

        if (options.validateOnly) {
          if (isSuccessResponse(response)) {
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
          }
        } else if (isSuccessResponse(response)) {
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
