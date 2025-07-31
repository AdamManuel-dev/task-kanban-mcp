import type { Command } from 'commander';
import inquirer from 'inquirer';
import type { CliComponents, CreateTagRequest } from '../types';
import type { OutputFormatter } from '../formatter';
import { logger } from '../../utils/logger';
import { isSuccessResponse } from '../api-client-wrapper';

/**
 * @fileoverview Tag management CLI commands
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Tag CRUD operations, hierarchical structures, search, merge capabilities
 * Main APIs: registerTagCommands() - comprehensive tag CLI command suite
 * Constraints: Requires API client, handles hierarchical relationships
 * Patterns: Interactive prompts, tree display, confirmation dialogs, type guards
 */

/**
 * Type guard to check if an unknown value is a Tag
 */
function isTag(value: unknown): value is { id: string; name: string; color: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).id === 'string' &&
    typeof (value as Record<string, unknown>).name === 'string' &&
    typeof (value as Record<string, unknown>).color === 'string'
  );
}

// Helper function to display tag tree (declared first to avoid hoisting issues)
function displayTagTree(
  tags: Array<{ id: string; name: string; parentId?: string; color?: string }>,
  allTags: Array<{ id: string; name: string; parentId?: string; color?: string }>,
  formatter: OutputFormatter,
  depth: number
): void {
  tags.forEach(tag => {
    const indent = '  '.repeat(depth);
    const coloredName = tag.color ? `${tag.name} (${tag.color})` : tag.name;
    logger.info(`${indent}${depth > 0 ? '└─ ' : ''}${coloredName} (${tag.id})`);

    // Find and display children
    const children = allTags.filter(t => t.parentId === tag.id);
    if (children.length > 0) {
      displayTagTree(children, allTags, formatter, depth + 1);
    }
  });
}

interface ListTagOptions {
  usage?: boolean;
  tree?: boolean;
  limit?: string;
}

interface ShowTagOptions {
  tasks?: boolean;
  usage?: boolean;
}

interface CreateTagOptions {
  name?: string;
  color?: string;
  description?: string;
  parent?: string;
  interactive?: boolean;
}

interface TagData {
  id: string;
  name: string;
  color?: string;
  description?: string;
  parentId?: string;
  taskCount?: number;
  children?: TagData[];
  createdAt?: string;
  updatedAt?: string;
}

interface TagsApiResponse {
  data: TagData[];
  success: boolean;
  error?: string;
}

interface TagApiResponse {
  data: TagData;
  success: boolean;
  error?: string;
}

// Removed unused interfaces

export function registerTagCommands(program: Command): void {
  const getComponents = (): CliComponents => {
    if (!global.cliComponents) {
      throw new Error('CLI components not initialized. Please initialize the CLI first.');
    }
    return global.cliComponents;
  };

  const tagCmd = program.command('tags').alias('tag').description('Manage tags');

  tagCmd
    .command('list')
    .alias('ls')
    .description('List all tags')
    .option('-u, --usage', 'show usage statistics')
    .option('-t, --tree', 'show as tree structure')
    .option('-l, --limit <number>', 'limit number of results', '50')
    .action(async (options: ListTagOptions) => {
      const { apiClient, formatter } = getComponents();

      try {
        const tagsResponse = (await apiClient.getTags()) as TagsApiResponse;
        const tags = tagsResponse.data;

        if (tags.length === 0) {
          formatter.info('No tags found');
          return;
        }

        if (options.tree) {
          // Display as tree structure
          const rootTags = tags.filter((tag: TagData) => !tag.parentId);
          displayTagTree(rootTags, tags, formatter, 0);
        } else {
          // Display as list
          const displayTags = options.usage
            ? tags.map((tag: TagData) => ({
                ...tag,
                usage: `${tag.taskCount ?? 0} tasks`,
              }))
            : tags;

          formatter.output(displayTags.slice(0, parseInt(options.limit ?? '50', 10)), {
            fields: options.usage
              ? ['id', 'name', 'color', 'usage', 'description']
              : ['id', 'name', 'color', 'description'],
            headers: options.usage
              ? ['ID', 'Name', 'Color', 'Usage', 'Description']
              : ['ID', 'Name', 'Color', 'Description'],
          });
        }
      } catch (error) {
        formatter.error(
          `Failed to list tags: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  tagCmd
    .command('show <id>')
    .description('Show tag details')
    .option('-t, --tasks', 'show tasks with this tag')
    .option('-u, --usage', 'show usage statistics')
    .action(async (id: string, options: ShowTagOptions) => {
      const { apiClient, formatter } = getComponents();

      try {
        const tagResponse = (await apiClient.getTag(id)) as TagApiResponse;
        if (!isSuccessResponse(tagResponse)) {
          formatter.error(`Tag ${String(id)} not found`);
          process.exit(1);
        }
        const tag = tagResponse.data;

        formatter.output(tag, {
          fields: options.usage
            ? ['id', 'name', 'color', 'description', 'taskCount', 'createdAt']
            : ['id', 'name', 'color', 'description', 'createdAt'],
          headers: options.usage
            ? ['ID', 'Name', 'Color', 'Description', 'Task Count', 'Created']
            : ['ID', 'Name', 'Color', 'Description', 'Created'],
        });

        if (options.tasks) {
          // Get tasks with this tag
          const tasksResponse = await apiClient.getTasks({ tags: id });
          if (
            isSuccessResponse(tasksResponse) &&
            Array.isArray(tasksResponse.data) &&
            tasksResponse.data.length > 0
          ) {
            formatter.info(`\n📋 Tasks with tag "${tag.name}":`);
            formatter.output(tasksResponse.data, {
              fields: ['id', 'title', 'status', 'priority'],
              headers: ['ID', 'Title', 'Status', 'Priority'],
            });
          } else {
            formatter.info(`No tasks found with tag "${tag.name}"`);
          }
        }
      } catch (error) {
        formatter.error(
          `Failed to get tag: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  tagCmd
    .command('create')
    .alias('add')
    .description('Create a new tag')
    .option('-n, --name <name>', 'tag name')
    .option('-d, --description <desc>', 'tag description')
    .option('-c, --color <color>', 'tag color (hex code)')
    .option('-p, --parent <parentId>', 'parent tag ID')
    .option('-i, --interactive', 'interactive mode')
    .action(async (options: CreateTagOptions) => {
      const { apiClient, formatter } = getComponents();

      let tagData: { name?: string; description?: string; color?: string; parentId?: string } = {};

      if (options.interactive || !options.name) {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: 'Tag name:',
            validate: (input: string) => input.length > 0 || 'Name is required',
          },
          {
            type: 'input',
            name: 'description',
            message: 'Tag description:',
          },
          {
            type: 'input',
            name: 'color',
            message: 'Tag color (hex code):',
            default: '#007acc',
            validate: (input: string) => {
              if (!input) return true;
              return /^#[0-9A-Fa-f]{6}$/.test(input) || 'Invalid hex color format (use #RRGGBB)';
            },
          },
        ]);
        tagData = answers;
      } else {
        // Use command line options
        tagData = {
          name: options.name,
          description: options.description,
          color: options.color,
          parentId: options.parent,
        };
      }

      // Ensure name is present (required field)
      if (!tagData.name) {
        formatter.error('Tag name is required');
        process.exit(1);
      }

      try {
        const createdTag = await apiClient.createTag(tagData as CreateTagRequest);
        const tagWithId = createdTag.data;
        formatter.success(`Tag created successfully: ${tagWithId.id}`);
        formatter.output(createdTag);
      } catch (error) {
        formatter.error(
          `Failed to create tag: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  tagCmd
    .command('update <id>')
    .description('Update a tag')
    .option('-n, --name <name>', 'tag name')
    .option('-d, --description <desc>', 'tag description')
    .option('-c, --color <color>', 'tag color (hex code)')
    .option('-p, --parent <parentId>', 'parent tag ID')
    .option('-i, --interactive', 'interactive mode')
    .action(async (id: string, options) => {
      const { apiClient, formatter } = getComponents();

      try {
        // Get current tag data
        const currentTagResponse = await apiClient.getTag(id);
        if (!isTag(currentTagResponse)) {
          formatter.error(`Tag ${String(id)} not found or invalid`);
          process.exit(1);
        }
        const currentTag = currentTagResponse;

        let updates: Partial<{
          name: string;
          description: string;
          color: string;
          parentId: string;
        }> = {};

        if (options.interactive) {
          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'name',
              message: 'Tag name:',
              default: (currentTag as { name: string }).name,
            },
            {
              type: 'input',
              name: 'description',
              message: 'Tag description:',
              default: (currentTag as { description?: string }).description || '',
            },
            {
              type: 'input',
              name: 'color',
              message: 'Tag color (hex code):',
              default: (currentTag as { color?: string }).color || '#007acc',
              validate: (input: string) => {
                if (!input) return true;
                return /^#[0-9A-Fa-f]{6}$/.test(input) || 'Invalid hex color format (use #RRGGBB)';
              },
            },
          ]);
          updates = answers;
        } else {
          // Use command line options
          if (options.name) updates.name = options.name;
          if (options.description) updates.description = options.description;
          if (options.color) updates.color = options.color;
          if (options.parent) updates.parentId = options.parent;
        }

        if (Object.keys(updates).length === 0) {
          formatter.warn('No updates specified');
          return;
        }

        const updatedTagResponse = await apiClient.updateTag(id, updates);
        if (!isTag(updatedTagResponse)) {
          formatter.error(`Failed to update tag ${String(id)}`);
          process.exit(1);
        }
        const updatedTag = updatedTagResponse;
        formatter.success('Tag updated successfully');
        formatter.output(updatedTag);
      } catch (error) {
        formatter.error(
          `Failed to update tag: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  tagCmd
    .command('delete <id>')
    .alias('rm')
    .description('Delete a tag')
    .option('-f, --force', 'skip confirmation')
    .action(async (id: string, options) => {
      const { apiClient, formatter } = getComponents();

      try {
        if (!options.force) {
          const tagResponse = await apiClient.getTag(id);
          if (!isTag(tagResponse)) {
            formatter.error(`Tag ${String(id)} not found`);
            process.exit(1);
          }
          const tag = tagResponse;

          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Delete tag "${(tag as { name: string }).name}"?`,
              default: false,
            },
          ]);

          if (!confirm) {
            formatter.info('Delete cancelled');
            return;
          }
        }

        await apiClient.deleteTag(id);
        formatter.success(`Tag ${id} deleted successfully`);
      } catch (error) {
        formatter.error(
          `Failed to delete tag: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  tagCmd
    .command('search <query>')
    .alias('find')
    .description('Search tags by name')
    .option('-l, --limit <number>', 'limit number of results', '10')
    .action(async (query: string, options) => {
      const { apiClient, formatter } = getComponents();

      try {
        const response = await apiClient.searchTags(query);

        if (!isSuccessResponse(response) || response.data.length === 0) {
          formatter.info(`No tags found matching "${query}"`);
          return;
        }

        const searchResults = response.data;

        const limitNumber = parseInt(options.limit ?? '20', 10);
        formatter.output(searchResults.slice(0, limitNumber), {
          fields: ['id', 'name', 'color', 'description'],
          headers: ['ID', 'Name', 'Color', 'Description'],
        });
      } catch (error) {
        formatter.error(
          `Failed to search tags: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  tagCmd
    .command('merge <fromId> <toId>')
    .description('Merge one tag into another')
    .option('-f, --force', 'skip confirmation')
    .action(async (fromId: string, toId: string, options) => {
      const { apiClient, formatter } = getComponents();

      try {
        if (!options.force) {
          const fromTagResponse = await apiClient.getTag(fromId);
          const toTagResponse = await apiClient.getTag(toId);

          if (!isTag(fromTagResponse) || !isTag(toTagResponse)) {
            formatter.error('One or both tags not found');
            process.exit(1);
          }

          const fromTag = fromTagResponse;
          const toTag = toTagResponse;

          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Merge tag "${fromTag.name}" into "${toTag.name}"? This will delete "${fromTag.name}".`,
              default: false,
            },
          ]);

          if (!confirm) {
            formatter.info('Merge cancelled');
            return;
          }
        }

        await apiClient.mergeTags(fromId, toId);
        formatter.success(`Merged tag ${fromId} into ${toId}`);
      } catch (error) {
        formatter.error(
          `Failed to merge tags: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });
}
