import type { Command } from 'commander';
import type { CliComponents } from '../types';

export function registerSearchCommands(program: Command): void {
  const searchCmd = program.command('search').alias('s').description('Search tasks and content');

  // Get global components with proper typing
  const getComponents = (): CliComponents => global.cliComponents;

  searchCmd
    .command('tasks <query>')
    .description('Search tasks')
    .option('-b, --board <id>', 'search within specific board')
    .option('-s, --status <status>', 'filter by status')
    .option('-t, --tags <tags>', 'filter by tags (comma-separated)')
    .option('-l, --limit <number>', 'limit number of results', '20')
    .option('--sort <field>', 'sort by field', 'relevance')
    .option('--order <direction>', 'sort order (asc/desc)', 'desc')
    .action(async (query: string, options) => {
      const { config, apiClient, formatter } = getComponents();

      try {
        const params: Record<string, string> = {
          q: query,
          limit: options.limit,
          sort: options.sort,
          order: options.order,
        };

        if (options.board) params.board = options.board;
        if (options.status) params.status = options.status;
        if (options.tags) params.tags = options.tags;

        // Use default board if no board specified
        if (!options.board && config.getDefaultBoard()) {
          params.board = config.getDefaultBoard()!;
        }

        const results = await apiClient.searchTasks(query, params);

        if (!results || (results as any).length === 0) {
          formatter.info(`No tasks found for "${query}"`);
          return;
        }

        formatter.success(`Found ${(results as any).length} tasks matching "${query}"`);
        formatter.output(results, {
          fields: ['id', 'title', 'status', 'priority', 'relevance', 'board'],
          headers: ['ID', 'Title', 'Status', 'Priority', 'Relevance', 'Board'],
        });
      } catch (error) {
        formatter.error(
          `Failed to search tasks: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  searchCmd
    .command('notes <query>')
    .description('Search notes')
    .option('-c, --category <category>', 'filter by category')
    .option('-l, --limit <number>', 'limit number of results', '20')
    .option('--sort <field>', 'sort by field', 'relevance')
    .option('--order <direction>', 'sort order (asc/desc)', 'desc')
    .action(async (query: string, options) => {
      const { apiClient, formatter } = getComponents();

      try {
        const params: Record<string, string> = {
          q: query,
          limit: options.limit,
          sort: options.sort,
          order: options.order,
        };

        if (options.category) params.category = options.category;

        const results = await apiClient.searchNotes(query);

        if (!results || (results as any).length === 0) {
          formatter.info(`No notes found for "${query}"`);
          return;
        }

        formatter.success(`Found ${(results as any).length} notes matching "${query}"`);
        formatter.output(results, {
          fields: ['id', 'title', 'category', 'relevance', 'createdAt'],
          headers: ['ID', 'Title', 'Category', 'Relevance', 'Created'],
        });
      } catch (error) {
        formatter.error(
          `Failed to search notes: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  searchCmd
    .command('tags <query>')
    .description('Search tags')
    .option('-l, --limit <number>', 'limit number of results', '20')
    .action(async (query: string, _options) => {
      const { apiClient, formatter } = getComponents();

      try {
        const results = await apiClient.searchTags(query);

        if (!results || (results as any).length === 0) {
          formatter.info(`No tags found for "${query}"`);
          return;
        }

        formatter.success(`Found ${(results as any).length} tags matching "${query}"`);
        formatter.output(results, {
          fields: ['id', 'name', 'description', 'taskCount', 'parentId'],
          headers: ['ID', 'Name', 'Description', 'Tasks', 'Parent'],
        });
      } catch (error) {
        formatter.error(
          `Failed to search tags: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  searchCmd
    .command('all <query>')
    .description('Search all content (tasks, notes, tags)')
    .option('-l, --limit <number>', 'limit number of results per type', '10')
    .option('--tasks-only', 'search only tasks')
    .option('--notes-only', 'search only notes')
    .option('--tags-only', 'search only tags')
    .action(async (query: string, options) => {
      const { apiClient, formatter } = getComponents();

      try {
        const searchPromises: Promise<any>[] = [];
        const searchTypes: string[] = [];

        if (!options.notesOnly && !options.tagsOnly) {
          searchPromises.push(apiClient.searchTasks(query, { limit: options.limit }));
          searchTypes.push('tasks');
        }

        if (!options.tasksOnly && !options.tagsOnly) {
          searchPromises.push(apiClient.searchNotes(query));
          searchTypes.push('notes');
        }

        if (!options.tasksOnly && !options.notesOnly) {
          searchPromises.push(apiClient.searchTags(query));
          searchTypes.push('tags');
        }

        const results = await Promise.all(searchPromises);

        let totalResults = 0;
        results.forEach((result, index) => {
          const type = searchTypes[index];
          const count = result ? result.length : 0;
          totalResults += count;

          if (count > 0 && type) {
            console.log(`\n--- ${type.toUpperCase()} (${count} results) ---`);

            if (type === 'tasks') {
              formatter.output(result, {
                fields: ['id', 'title', 'status', 'priority'],
                headers: ['ID', 'Title', 'Status', 'Priority'],
              });
            } else if (type === 'notes') {
              formatter.output(result, {
                fields: ['id', 'title', 'category'],
                headers: ['ID', 'Title', 'Category'],
              });
            } else if (type === 'tags') {
              formatter.output(result, {
                fields: ['id', 'name', 'taskCount'],
                headers: ['ID', 'Name', 'Tasks'],
              });
            }
          }
        });

        if (totalResults === 0) {
          formatter.info(`No results found for "${query}"`);
        } else {
          formatter.success(`Found ${totalResults} total results for "${query}"`);
        }
      } catch (error) {
        formatter.error(
          `Failed to search: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  // Advanced search with filters
  searchCmd
    .command('advanced')
    .description('Advanced search with multiple filters')
    .option('--title <query>', 'search in titles')
    .option('--description <query>', 'search in descriptions')
    .option('--tags <tags>', 'filter by tags (comma-separated)')
    .option('--status <status>', 'filter by status')
    .option('--priority-min <number>', 'minimum priority')
    .option('--priority-max <number>', 'maximum priority')
    .option('--created-after <date>', 'created after date (YYYY-MM-DD)')
    .option('--created-before <date>', 'created before date (YYYY-MM-DD)')
    .option('--due-after <date>', 'due after date (YYYY-MM-DD)')
    .option('--due-before <date>', 'due before date (YYYY-MM-DD)')
    .option('-l, --limit <number>', 'limit number of results', '20')
    .action(async options => {
      const { apiClient, formatter } = getComponents();

      try {
        const params: Record<string, string> = {
          limit: options.limit,
        };

        if (options.title) params.title = options.title;
        if (options.description) params.description = options.description;
        if (options.tags) params.tags = options.tags;
        if (options.status) params.status = options.status;
        if (options.priorityMin) params.priorityMin = options.priorityMin;
        if (options.priorityMax) params.priorityMax = options.priorityMax;
        if (options.createdAfter) params.createdAfter = options.createdAfter;
        if (options.createdBefore) params.createdBefore = options.createdBefore;
        if (options.dueAfter) params.dueAfter = options.dueAfter;
        if (options.dueBefore) params.dueBefore = options.dueBefore;

        const results = (await apiClient.request('/api/search/advanced', { params })) as any;

        if (!results || results.length === 0) {
          formatter.info('No results found with the specified filters');
          return;
        }

        formatter.success(`Found ${results.length} results with advanced filters`);
        formatter.output(results, {
          fields: ['id', 'title', 'status', 'priority', 'dueDate', 'createdAt'],
          headers: ['ID', 'Title', 'Status', 'Priority', 'Due Date', 'Created'],
        });
      } catch (error) {
        formatter.error(
          `Failed to perform advanced search: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });
}
