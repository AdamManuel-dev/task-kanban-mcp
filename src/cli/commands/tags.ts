import type { Command } from 'commander';
import inquirer from 'inquirer';

import type { CliComponents } from '../types';

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

interface UpdateTagOptions {
  name?: string;
  color?: string;
  description?: string;
  parent?: string;
  interactive?: boolean;
}

interface DeleteTagOptions {
  force?: boolean;
  cascade?: boolean;
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

export function registerTagCommands(program: Command): void {
  const tagCmd = program.command('tag').description('Manage tags');

  // Get global components with proper typing
  const getComponents = (): CliComponents => global.cliComponents;

  tagCmd
    .command('list')
    .alias('ls')
    .description('List tags')
    .option('--usage', 'include usage statistics')
    .option('--tree', 'show hierarchical tree structure')
    .option('-l, --limit <number>', 'limit number of results', '50')
    .action(async (options: ListTagOptions) => {
      const { apiClient, formatter } = getComponents();

      try {
        const tags = (await apiClient.getTags()) as TagData[];

        if (!tags || tags.length === 0) {
          formatter.info('No tags found');
          return;
        }

        if (options.tree) {
          // Display as hierarchical tree
          formatter.info('Hierarchical tag structure:');
          const rootTags = tags.filter((tag: TagData) => !tag.parentId);
          displayTagTree(rootTags, tags, formatter, 0);
        } else {
          // Regular table display
          const fields = options.usage
            ? ['id', 'name', 'color', 'description', 'taskCount', 'parentId']
            : ['id', 'name', 'color', 'description', 'parentId'];

          const headers = options.usage
            ? ['ID', 'Name', 'Color', 'Description', 'Task Count', 'Parent']
            : ['ID', 'Name', 'Color', 'Description', 'Parent'];

          formatter.output(tags.slice(0, parseInt(options.limit)), {
            fields,
            headers,
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
    .option('--tasks', 'include tasks with this tag')
    .action(async (id: string, options: ShowTagOptions) => {
      const { apiClient, formatter } = getComponents();

      try {
        const tag = (await apiClient.getTag(id)) as TagData;

        if (!tag) {
          formatter.error(`Tag ${id} not found`);
          process.exit(1);
        }

        formatter.output(tag);

        if (options.tasks && tag.tasks) {
          formatter.info('\n--- Tasks with this tag ---');
          formatter.output(tag.tasks, {
            fields: ['id', 'title', 'status', 'priority'],
            headers: ['ID', 'Title', 'Status', 'Priority'],
          });
        }
      } catch (error) {
        formatter.error(
          `Failed to get tag: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  tagCmd
    .command('create <name>')
    .alias('new')
    .description('Create a new tag')
    .option('-d, --description <desc>', 'tag description')
    .option('-c, --color <color>', 'tag color (hex code)')
    .option('-p, --parent <parentId>', 'parent tag ID for hierarchy')
    .option('-i, --interactive', 'interactive mode')
    .action(async (name: string, options: CreateTagOptions) => {
      const { apiClient, formatter } = getComponents();

      let tagData: Record<string, unknown> = { name };

      if (options.interactive) {
        const questions: Array<{
          type: string;
          name: string;
          message: string;
          default?: string;
          validate?: (input: string) => boolean | string;
        }> = [
          {
            type: 'input',
            name: 'description',
            message: 'Tag description (optional):',
            default: options.description || '',
          },
          {
            type: 'input',
            name: 'color',
            message: 'Tag color (hex code, optional):',
            default: options.color || '#007acc',
            validate: (input: string) => {
              if (!input) return true;
              return /^#[0-9A-Fa-f]{6}$/.test(input) || 'Invalid hex color format (use #RRGGBB)';
            },
          },
          {
            type: 'input',
            name: 'parentId',
            message: 'Parent tag ID (optional, for hierarchy):',
            default: options.parent || '',
          },
        ];

        const answers = await inquirer.prompt(questions);
        tagData = { ...tagData, ...answers };
      } else {
        tagData.description = options.description;
        tagData.color = options.color;
        tagData.parentId = options.parent;
      }

      try {
        const tag = (await apiClient.createTag(tagData)) as any;
        formatter.success(`Tag created successfully: ${tag.id}`);
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
          formatter.error(`Tag ${id} not found`);
          process.exit(1);
        }

        let updates: any = {};

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
            formatter.error(`Tag ${id} not found`);
            process.exit(1);
          }

          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Delete tag "${tag.name}"? This will remove it from all tasks.`,
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
    .command('add <taskId> <tags...>')
    .description('Add tags to a task')
    .action(async (taskId: string, tags: string[]) => {
      const { apiClient, formatter } = getComponents();

      try {
        await apiClient.addTagsToTask(taskId, tags);
        formatter.success(`Added tags [${tags.join(', ')}] to task ${taskId}`);
      } catch (error) {
        formatter.error(
          `Failed to add tags: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  tagCmd
    .command('remove <taskId> <tag>')
    .alias('rm-from-task')
    .description('Remove tag from a task')
    .action(async (taskId: string, tag: string) => {
      const { apiClient, formatter } = getComponents();

      try {
        await apiClient.removeTagFromTask(taskId, tag);
        formatter.success(`Removed tag "${tag}" from task ${taskId}`);
      } catch (error) {
        formatter.error(
          `Failed to remove tag: ${error instanceof Error ? error.message : 'Unknown error'}`
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
          formatter.info(`No tags found matching "${query}"`);
          return;
        }

        formatter.output(tags.slice(0, parseInt(options.limit)), {
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

// Helper function to display tag tree
function displayTagTree(
  tags: any[],
  allTags: any[],
  formatter: OutputFormatter,
  depth: number
): void {
  tags.forEach(tag => {
    const indent = '  '.repeat(depth);
    const name = tag.color ? `${tag.name} (${tag.color})` : tag.name;
    console.log(`${indent}${depth > 0 ? '└─ ' : ''}${name} (${tag.id})`);

    // Find and display children
    const children = allTags.filter((t: any) => t.parentId === tag.id);
    if (children.length > 0) {
      displayTagTree(children, allTags, formatter, depth + 1);
    }
  });
}
