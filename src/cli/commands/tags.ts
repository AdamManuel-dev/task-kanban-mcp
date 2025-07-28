import type { Command } from 'commander';
import inquirer from 'inquirer';
import type { CliComponents } from '../types';
import type { OutputFormatter } from '../formatter';
import { logger } from '../../utils/logger';

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
  const getComponents = (): CliComponents => global.cliComponents;

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

        if (!tags || tags.length === 0) {
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
                usage: `${String(String(tag.taskCount || 0))} tasks`,
              }))
            : tags;

          formatter.output(displayTags.slice(0, parseInt(options.limit || '50', 10)), {
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
        const tag = tagResponse.data;
        if (!tag) {
          formatter.error(`Tag ${String(id)} not found`);
          process.exit(1);
        }

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
          if (tasksResponse && 'data' in tasksResponse && tasksResponse.data) {
            formatter.info(`\n📋 Tasks with tag "${tag.name}":`);
            formatter.output(tasksResponse, {
              fields: ['id', 'title', 'status', 'priority'],
              headers: ['ID', 'Title', 'Status', 'Priority']
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

      try {
        const tag = (await apiClient.createTag(tagData)) as any;
        formatter.success(`Tag created successfully: ${String(tag.id)}`);
        formatter.output(tag);
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
        const currentTag = (await apiClient.getTag(id)) as any;
        if (!currentTag) {
          formatter.error(`Tag ${String(id)} not found`);
          process.exit(1);
        }

        let updates: Partial<{ name: string; description: string; color: string; parentId: string }> = {};

        if (options.interactive) {
          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'name',
              message: 'Tag name:',
              default: currentTag.name,
            },
            {
              type: 'input',
              name: 'description',
              message: 'Tag description:',
              default: currentTag.description || '',
            },
            {
              type: 'input',
              name: 'color',
              message: 'Tag color (hex code):',
              default: currentTag.color || '#007acc',
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

        const updatedTag = (await apiClient.updateTag(id, updates)) as any;
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
          const tag = (await apiClient.getTag(id)) as any;
          if (!tag) {
            formatter.error(`Tag ${String(id)} not found`);
            process.exit(1);
          }

          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Delete tag "${String(tag.name)}"?`,
              default: false,
            },
          ]);

          if (!confirm) {
            formatter.info('Delete cancelled');
            return;
          }
        }

        await apiClient.deleteTag(id);
        formatter.success(`Tag ${String(id)} deleted successfully`);
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
        const tags = (await apiClient.searchTags(query)) as any;

        if (!tags || tags.length === 0) {
          formatter.info(`No tags found matching "${String(query)}"`);
          return;
        }

        formatter.output(tags.slice(0, parseInt(options.limit, 10)), {
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
          const fromTag = (await apiClient.getTag(fromId)) as any;
          const toTag = (await apiClient.getTag(toId)) as any;

          if (!fromTag || !toTag) {
            formatter.error('One or both tags not found');
            process.exit(1);
          }

          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Merge tag "${String(fromTag.name)}" into "${String(toTag.name)}"? This will delete "${String(fromTag.name)}".`,
              default: false,
            },
          ]);

          if (!confirm) {
            formatter.info('Merge cancelled');
            return;
          }
        }

        await apiClient.mergeTags(fromId, toId);
        formatter.success(`Merged tag ${String(fromId)} into ${String(toId)}`);
      } catch (error) {
        formatter.error(
          `Failed to merge tags: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });
}

// Helper function to display tag tree
function displayTagTree(
  tags: Array<{ id: string; name: string; parentId?: string }>,
  allTags: Array<{ id: string; name: string; parentId?: string }>,
  formatter: OutputFormatter,
  depth: number
): void {
  tags.forEach(tag => {
    const indent = '  '.repeat(depth);
    const name = tag.color ? `${String(tag.name)} (${String(tag.color)})` : tag.name;
    logger.info(
      `${String(indent)}${String(depth > 0 ? '└─ ' : '')}${String(name)} (${String(tag.id)})`
    );

    // Find and display children
    const children = allTags.filter((t) => t.parentId === tag.id);
    if (children.length > 0) {
      displayTagTree(children, allTags, formatter, depth + 1);
    }
  });
}
