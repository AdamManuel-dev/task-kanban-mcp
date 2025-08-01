/**
 * @fileoverview Note management CLI commands
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Note CRUD operations, search, categorization, pinning capabilities
 * Main APIs: registerNoteCommands() - comprehensive note CLI command suite
 * Constraints: Requires API client, handles task-note relationships
 * Patterns: Interactive prompts, category filtering, search functionality
 */

import type { Command } from 'commander';
import inquirer from 'inquirer';
import type { CliComponents, CreateNoteRequest, UpdateNoteRequest } from '../types';
import type { Note } from '../../types';
import { buildSearchNotesParams } from '../utils/parameter-builder';
import { formatErrorMessage } from '../../utils/type-guards';

export function registerNoteCommands(program: Command): void {
  const noteCmd = program.command('note').alias('n').description('Manage notes');

  // Get global components with proper typing
  const getComponents = (): CliComponents => {
    if (!global.cliComponents) {
      throw new Error('CLI components not initialized. Please initialize the CLI first.');
    }
    return global.cliComponents;
  };

  noteCmd
    .command('list')
    .alias('ls')
    .description('List all notes')
    .option('-l, --limit <number>', 'limit number of results', '20')
    .option('--sort <field>', 'sort by field', 'createdAt')
    .option('--order <direction>', 'sort order (asc/desc)', 'desc')
    .option('--category <category>', 'filter by category')
    .option('--task <taskId>', 'filter by task ID')
    .option('--pinned', 'show only pinned notes')
    .action(
      async (options: {
        limit?: string;
        sort?: string;
        order?: string;
        category?: string;
        task?: string;
        pinned?: boolean;
      }) => {
        const { apiClient, formatter } = getComponents();

        try {
          const params = buildSearchNotesParams({
            limit: parseInt(options.limit ?? '20', 10),
            ...(options.category && { category: options.category }),
            ...(options.task && { taskId: options.task }),
            ...(options.pinned && { pinned: 'true' }),
          });

          // Convert params to Record<string, string> format
          const queryParams: Record<string, string> = {};
          if (params.category) queryParams.category = params.category;
          if (params.limit) queryParams.limit = params.limit;
          if (params.search) queryParams.search = params.search;

          const notes = await apiClient.getNotes(queryParams);

          if (!Array.isArray(notes) || notes.length === 0) {
            formatter.info('No notes found');
            return;
          }

          formatter.output(notes, {
            fields: ['id', 'title', 'category', 'pinned', 'taskId', 'createdAt'],
            headers: ['ID', 'Title', 'Category', 'Pinned', 'Task ID', 'Created'],
          });
        } catch (error) {
          formatter.error(
            `Failed to list notes: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
          process.exit(1);
        }
      }
    );

  noteCmd
    .command('show <id>')
    .description('Show note details')
    .action(async (id: string) => {
      const { apiClient, formatter } = getComponents();

      try {
        const note = await apiClient.getNote(id);

        if (!('data' in note)) {
          formatter.error(`Note ${String(id)} not found`);
          process.exit(1);
        }

        formatter.output(note);
      } catch (error) {
        formatter.error(
          `Failed to get note: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  noteCmd
    .command('add')
    .alias('create')
    .description('Add a new note')
    .option('-t, --title <title>', 'note title')
    .option('-c, --content <content>', 'note content')
    .option('--category <category>', 'note category')
    .option('--task <taskId>', 'link to task ID')
    .option('--pin', 'pin the note')
    .option('-i, --interactive', 'interactive mode')
    .action(
      async (options: {
        title?: string;
        content?: string;
        category?: string;
        task?: string;
        pin?: boolean;
        interactive?: boolean;
      }) => {
        const { apiClient, formatter } = getComponents();

        let noteData: Partial<CreateNoteRequest> = {};

        if (options.interactive ?? !options.title) {
          const questions: Array<{
            type: string;
            name: string;
            message: string;
            validate?: (input: string) => true | string;
            choices?: string[];
            default?: string | boolean;
          }> = [];

          if (!options.title) {
            questions.push({
              type: 'input',
              name: 'title',
              message: 'Note title:',
              validate: (input: string) => input.length > 0 || 'Title is required',
            });
          }

          if (!options.content) {
            questions.push({
              type: 'editor',
              name: 'content',
              message: 'Note content:',
            });
          }

          if (!options.category) {
            questions.push({
              type: 'list',
              name: 'category',
              message: 'Note category:',
              choices: ['general', 'implementation', 'research', 'blocker', 'idea'],
              default: 'general',
            });
          }

          if (!options.task) {
            questions.push({
              type: 'input',
              name: 'taskId',
              message: 'Link to task ID (optional):',
            });
          }

          if (!options.pin) {
            questions.push({
              type: 'confirm',
              name: 'pinned',
              message: 'Pin this note?',
              default: false,
            });
          }

          const answers = await inquirer.prompt(questions);
          noteData = { ...noteData, ...answers };
        }

        // Use command line options or answers
        noteData.content = options.content ?? noteData.content ?? '';
        noteData.category = (options.category ?? noteData.category ?? 'general') as NonNullable<
          CreateNoteRequest['category']
        >;
        noteData.taskId = options.task ?? noteData.taskId;
        noteData.pinned = options.pin ?? noteData.pinned ?? false;

        try {
          const note = await apiClient.createNote(noteData as CreateNoteRequest);
          formatter.success(`Note created successfully: ${note.data.id}`);
          formatter.output(note);
        } catch (error) {
          formatter.error(`Failed to create note: ${formatErrorMessage(error)}`);
          process.exit(1);
        }
      }
    );

  noteCmd
    .command('update <id>')
    .description('Update a note')
    .option('-t, --title <title>', 'note title')
    .option('-c, --content <content>', 'note content')
    .option('--category <category>', 'note category')
    .option('--task <taskId>', 'link to task ID')
    .option('--pin', 'pin the note')
    .option('--unpin', 'unpin the note')
    .option('-i, --interactive', 'interactive mode')
    .action(
      async (
        id: string,
        options: {
          title?: string;
          content?: string;
          category?: string;
          task?: string;
          pin?: boolean;
          unpin?: boolean;
          interactive?: boolean;
        }
      ) => {
        const { apiClient, formatter } = getComponents();

        try {
          // Get current note data
          const noteResponse = await apiClient.getNote(id);
          if (!('data' in noteResponse)) {
            formatter.error(`Note ${String(id)} not found`);
            process.exit(1);
          }

          const currentNote = noteResponse.data as Note;

          let updates: UpdateNoteRequest = {};

          if (options.interactive) {
            const answers = await inquirer.prompt([
              {
                type: 'editor',
                name: 'content',
                message: 'Note content:',
                default: currentNote.content || '',
              },
              {
                type: 'list',
                name: 'category',
                message: 'Note category:',
                choices: ['general', 'implementation', 'research', 'blocker', 'idea'],
                default: currentNote.category,
              },
              {
                type: 'confirm',
                name: 'pinned',
                message: 'Pin this note?',
                default: currentNote.pinned || false,
              },
            ]);
            updates = answers;
          } else {
            // Use command line options
            if (options.content) updates.content = options.content;
            if (options.category)
              updates.category = options.category as UpdateNoteRequest['category'];
            if (options.pin) updates.pinned = true;
            if (options.unpin) updates.pinned = false;
          }

          if (Object.keys(updates).length === 0) {
            formatter.warn('No updates specified');
            return;
          }

          const updatedNote = (await apiClient.updateNote(id, updates)) as unknown;
          formatter.success('Note updated successfully');
          formatter.output(updatedNote);
        } catch (error) {
          formatter.error(`Failed to update note: ${formatErrorMessage(error)}`);
          process.exit(1);
        }
      }
    );

  noteCmd
    .command('delete <id>')
    .alias('rm')
    .description('Delete a note')
    .option('-f, --force', 'skip confirmation')
    .action(async (id: string, options: { force?: boolean }) => {
      const { apiClient, formatter } = getComponents();

      try {
        if (!options.force) {
          const noteResponse = await apiClient.getNote(id);
          if (!('data' in noteResponse)) {
            formatter.error(`Note ${String(id)} not found`);
            process.exit(1);
          }

          const note = noteResponse.data as Note;

          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Delete note "${String(note.id)}"?`,
              default: false,
            },
          ]);

          if (!confirm) {
            formatter.info('Delete cancelled');
            return;
          }
        }

        await apiClient.deleteNote(id);
        formatter.success(`Note ${String(id)} deleted successfully`);
      } catch (error) {
        formatter.error(`Failed to delete note: ${formatErrorMessage(error)}`);
        process.exit(1);
      }
    });

  noteCmd
    .command('search <query>')
    .alias('find')
    .description('Search notes')
    .option('-c, --category <category>', 'filter by category')
    .option('-l, --limit <number>', 'limit number of results', '10')
    .action(async (query: string, options: { category?: string; limit?: string }) => {
      const { apiClient, formatter } = getComponents();

      try {
        const searchParams: Record<string, string> = {};
        if (options.category) searchParams.category = options.category;
        if (options.limit) searchParams.limit = options.limit;

        const notes = (await apiClient.searchNotes(query)) as unknown[];

        if (notes.length === 0) {
          formatter.info(`No notes found matching "${String(query)}"`);
          return;
        }

        formatter.output(notes, {
          fields: ['id', 'title', 'category', 'content'],
          headers: ['ID', 'Title', 'Category', 'Content'],
        });
      } catch (error) {
        formatter.error(`Failed to search notes: ${formatErrorMessage(error)}`);
        process.exit(1);
      }
    });

  noteCmd
    .command('pin <id>')
    .description('Pin a note')
    .action(async (id: string) => {
      const { apiClient, formatter } = getComponents();

      try {
        await apiClient.updateNote(id, { pinned: true });
        formatter.success(`Note ${String(id)} pinned successfully`);
      } catch (error) {
        formatter.error(`Failed to pin note: ${formatErrorMessage(error)}`);
        process.exit(1);
      }
    });

  noteCmd
    .command('unpin <id>')
    .description('Unpin a note')
    .action(async (id: string) => {
      const { apiClient, formatter } = getComponents();

      try {
        await apiClient.updateNote(id, { pinned: false });
        formatter.success(`Note ${String(id)} unpinned successfully`);
      } catch (error) {
        formatter.error(`Failed to unpin note: ${formatErrorMessage(error)}`);
        process.exit(1);
      }
    });
}
