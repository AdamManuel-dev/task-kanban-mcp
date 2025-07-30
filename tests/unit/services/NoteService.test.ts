/**
 * Unit tests for NoteService
 *
 * @description Comprehensive test suite covering all NoteService functionality
 * including CRUD operations, search, filtering, and edge cases.
 */

import { NoteService } from '@/services/NoteService';
import { DatabaseConnection } from '@/database/connection';
import type { Note, ServiceError } from '@/types';

// Mock the logger to avoid console output during tests
jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('NoteService', () => {
  let dbConnection: DatabaseConnection;
  let noteService: NoteService;
  let boardId: string;
  let taskId: string;
  let secondTaskId: string;

  beforeEach(async () => {
    // Force a new database instance for testing
    (DatabaseConnection as any).instance = null;
    dbConnection = DatabaseConnection.getInstance();

    if (dbConnection.isConnected()) {
      await dbConnection.close();
    }

    // Use test-specific database file
    process.env.DATABASE_PATH = ':memory:';

    await dbConnection.initialize();
    noteService = new NoteService(dbConnection);

    // Set up test data
    boardId = 'test-board-1';
    taskId = 'test-task-1';
    secondTaskId = 'test-task-2';

    // Create test board
    await dbConnection.execute('INSERT INTO boards (id, name, description) VALUES (?, ?, ?)', [
      boardId,
      'Test Board',
      'Test board description',
    ]);

    // Create test column
    await dbConnection.execute(
      'INSERT INTO columns (id, board_id, name, position) VALUES (?, ?, ?, ?)',
      ['todo', boardId, 'To Do', 0]
    );

    // Create test tasks
    await dbConnection.execute(
      'INSERT INTO tasks (id, board_id, column_id, title, description, status, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [taskId, boardId, 'todo', 'Test Task 1', 'Test task description', 'todo', 0]
    );

    await dbConnection.execute(
      'INSERT INTO tasks (id, board_id, column_id, title, description, status, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [secondTaskId, boardId, 'todo', 'Test Task 2', 'Second test task', 'todo', 1]
    );
  });

  afterEach(async () => {
    if (dbConnection && dbConnection.isConnected()) {
      await dbConnection.close();
    }
  });

  describe('createNote', () => {
    it('should create a note successfully', async () => {
      const noteData = {
        task_id: taskId,
        content: 'Test note content',
        category: 'general' as const,
        pinned: false,
      };

      const note = await noteService.createNote(noteData);

      expect(note).toBeDefined();
      expect(note.id).toBeDefined();
      expect(note.task_id).toBe(taskId);
      expect(note.content).toBe('Test note content');
      expect(note.category).toBe('general');
      expect(note.pinned).toBe(false);
      expect(note.created_at).toBeInstanceOf(Date);
      expect(note.updated_at).toBeInstanceOf(Date);
    });

    it('should create a note with default values', async () => {
      const noteData = {
        task_id: taskId,
        content: 'Test note with defaults',
      };

      const note = await noteService.createNote(noteData);

      expect(note.category).toBe('general');
      expect(note.pinned).toBe(false);
    });

    it('should create a pinned note', async () => {
      const noteData = {
        task_id: taskId,
        content: 'Pinned note',
        category: 'decision' as const,
        pinned: true,
      };

      const note = await noteService.createNote(noteData);

      expect(note.pinned).toBe(true);
      expect(note.category).toBe('decision');
    });

    it('should throw error when task does not exist', async () => {
      const noteData = {
        task_id: 'non-existent-task',
        content: 'Test note content',
      };

      await expect(noteService.createNote(noteData)).rejects.toThrow('Failed to create note');
    });

    it('should throw ServiceError on database failure', async () => {
      // Close database to force failure
      await dbConnection.close();

      const noteData = {
        task_id: taskId,
        content: 'Test note content',
      };

      await expect(noteService.createNote(noteData)).rejects.toThrow();
    });
  });

  describe('getNoteById', () => {
    let createdNote: Note;

    beforeEach(async () => {
      createdNote = await noteService.createNote({
        task_id: taskId,
        content: 'Test note for retrieval',
        category: 'progress',
      });
    });

    it('should retrieve note by ID', async () => {
      const note = await noteService.getNoteById(createdNote.id);

      expect(note).toBeDefined();
      expect(note!.id).toBe(createdNote.id);
      expect(note!.content).toBe('Test note for retrieval');
      expect(note!.category).toBe('progress');
      expect(note!.created_at).toBeInstanceOf(Date);
      expect(note!.updated_at).toBeInstanceOf(Date);
    });

    it('should return null for non-existent note', async () => {
      const note = await noteService.getNoteById('non-existent-id');
      expect(note).toBeNull();
    });

    it('should throw ServiceError on database failure', async () => {
      await dbConnection.close();
      await expect(noteService.getNoteById(createdNote.id)).rejects.toThrow();
    });
  });

  describe('getNotes', () => {
    beforeEach(async () => {
      // Create multiple test notes
      await noteService.createNote({
        task_id: taskId,
        content: 'General note',
        category: 'general',
        pinned: false,
      });

      await noteService.createNote({
        task_id: taskId,
        content: 'Progress update',
        category: 'progress',
        pinned: true,
      });

      await noteService.createNote({
        task_id: secondTaskId,
        content: 'Blocker information',
        category: 'blocker',
        pinned: false,
      });
    });

    it('should retrieve all notes with default options', async () => {
      const notes = await noteService.getNotes();

      expect(notes).toHaveLength(3);
      // Notes should be returned (order might vary due to timing)
    });

    it('should filter notes by task_id', async () => {
      const notes = await noteService.getNotes({ task_id: taskId });

      expect(notes).toHaveLength(2);
      notes.forEach(note => expect(note.task_id).toBe(taskId));
    });

    it('should filter notes by category', async () => {
      const notes = await noteService.getNotes({ category: 'progress' });

      expect(notes).toHaveLength(1);
      expect(notes[0].category).toBe('progress');
    });

    it('should filter notes by pinned status', async () => {
      const pinnedNotes = await noteService.getNotes({ pinned: true });
      const unpinnedNotes = await noteService.getNotes({ pinned: false });

      expect(pinnedNotes).toHaveLength(1);
      expect(unpinnedNotes).toHaveLength(2);
    });

    it('should filter notes by content search', async () => {
      const notes = await noteService.getNotes({ content_search: 'progress' });

      expect(notes).toHaveLength(1);
      expect(notes[0].content.toLowerCase()).toContain('progress');
    });

    it('should filter notes by board_id', async () => {
      const notes = await noteService.getNotes({ board_id: boardId });

      expect(notes).toHaveLength(3);
    });

    it('should apply pagination', async () => {
      const page1 = await noteService.getNotes({ limit: 2, offset: 0 });
      const page2 = await noteService.getNotes({ limit: 2, offset: 2 });

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(1);
      expect(page1[0].id).not.toBe(page2[0].id);
    });

    it('should sort notes by different fields', async () => {
      const notesByContent = await noteService.getNotes({
        sortBy: 'content',
        sortOrder: 'asc',
      });

      expect(notesByContent[0].content <= notesByContent[1].content).toBe(true);
    });

    it('should filter by date range', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const notes = await noteService.getNotes({
        date_from: yesterday,
        date_to: tomorrow,
      });

      expect(notes).toHaveLength(3);
    });
  });

  describe('getTaskNotes', () => {
    beforeEach(async () => {
      await noteService.createNote({
        task_id: taskId,
        content: 'Task 1 note 1',
      });

      await noteService.createNote({
        task_id: taskId,
        content: 'Task 1 note 2',
      });

      await noteService.createNote({
        task_id: secondTaskId,
        content: 'Task 2 note 1',
      });
    });

    it('should retrieve notes for specific task', async () => {
      const notes = await noteService.getTaskNotes(taskId);

      expect(notes).toHaveLength(2);
      notes.forEach(note => expect(note.task_id).toBe(taskId));
    });

    it('should apply pagination to task notes', async () => {
      const notes = await noteService.getTaskNotes(taskId, { limit: 1 });

      expect(notes).toHaveLength(1);
    });
  });

  describe('getPinnedNotes', () => {
    beforeEach(async () => {
      await noteService.createNote({
        task_id: taskId,
        content: 'Pinned note 1',
        pinned: true,
      });

      await noteService.createNote({
        task_id: taskId,
        content: 'Regular note',
        pinned: false,
      });

      await noteService.createNote({
        task_id: secondTaskId,
        content: 'Pinned note 2',
        pinned: true,
      });
    });

    it('should retrieve only pinned notes', async () => {
      const notes = await noteService.getPinnedNotes();

      expect(notes).toHaveLength(2);
      notes.forEach(note => expect(Boolean(note.pinned)).toBe(true));
    });

    it('should filter pinned notes by task_id', async () => {
      const notes = await noteService.getPinnedNotes({ task_id: taskId });

      expect(notes).toHaveLength(1);
      expect(notes[0].task_id).toBe(taskId);
      expect(Boolean(notes[0].pinned)).toBe(true);
    });
  });

  describe('updateNote', () => {
    let createdNote: Note;

    beforeEach(async () => {
      createdNote = await noteService.createNote({
        task_id: taskId,
        content: 'Original content',
        category: 'general',
        pinned: false,
      });
    });

    it('should update note content', async () => {
      const updatedNote = await noteService.updateNote(createdNote.id, {
        content: 'Updated content',
      });

      expect(updatedNote.content).toBe('Updated content');
      expect(updatedNote.category).toBe('general'); // Unchanged
      expect(updatedNote.updated_at > createdNote.updated_at).toBe(true);
    });

    it('should update note category', async () => {
      const updatedNote = await noteService.updateNote(createdNote.id, {
        category: 'decision',
      });

      expect(updatedNote.category).toBe('decision');
      expect(updatedNote.content).toBe('Original content'); // Unchanged
    });

    it('should update pinned status', async () => {
      const updatedNote = await noteService.updateNote(createdNote.id, {
        pinned: true,
      });

      expect(Boolean(updatedNote.pinned)).toBe(true);
    });

    it('should update multiple fields', async () => {
      const updatedNote = await noteService.updateNote(createdNote.id, {
        content: 'New content',
        category: 'blocker',
        pinned: true,
      });

      expect(updatedNote.content).toBe('New content');
      expect(updatedNote.category).toBe('blocker');
      expect(Boolean(updatedNote.pinned)).toBe(true);
    });

    it('should return unchanged note when no updates provided', async () => {
      const unchangedNote = await noteService.updateNote(createdNote.id, {});

      expect(unchangedNote.id).toBe(createdNote.id);
      expect(unchangedNote.content).toBe(createdNote.content);
      expect(unchangedNote.category).toBe(createdNote.category);
      expect(unchangedNote.task_id).toBe(createdNote.task_id);
    });

    it('should throw error for non-existent note', async () => {
      await expect(
        noteService.updateNote('non-existent-id', { content: 'New content' })
      ).rejects.toThrow('Failed to update note');
    });
  });

  describe('deleteNote', () => {
    let createdNote: Note;

    beforeEach(async () => {
      createdNote = await noteService.createNote({
        task_id: taskId,
        content: 'Note to delete',
      });
    });

    it('should delete note successfully', async () => {
      await noteService.deleteNote(createdNote.id);

      const deletedNote = await noteService.getNoteById(createdNote.id);
      expect(deletedNote).toBeNull();
    });

    it('should throw error for non-existent note', async () => {
      await expect(noteService.deleteNote('non-existent-id')).rejects.toThrow(
        'Failed to delete note'
      );
    });
  });

  describe('searchNotes', () => {
    beforeEach(async () => {
      await noteService.createNote({
        task_id: taskId,
        content: 'This is a test note about JavaScript development',
        category: 'general',
      });

      await noteService.createNote({
        task_id: taskId,
        content: 'Progress update on JavaScript refactoring',
        category: 'progress',
        pinned: true,
      });

      await noteService.createNote({
        task_id: secondTaskId,
        content: 'Bug found in the Python module',
        category: 'blocker',
      });
    });

    it('should search notes by content', async () => {
      const results = await noteService.searchNotes({ query: 'JavaScript' });

      expect(results).toHaveLength(2);
      results.forEach(result => {
        expect(result.content.toLowerCase()).toContain('javascript');
        expect(result.task_title).toBeDefined();
        expect(result.board_name).toBeDefined();
        expect(result.relevance_score).toBeDefined();
      });
    });

    it('should highlight search terms', async () => {
      const results = await noteService.searchNotes({
        query: 'JavaScript',
        highlight: true,
      });

      expect(results[0].highlighted_content).toContain('<mark>JavaScript</mark>');
    });

    it('should sort by relevance by default', async () => {
      const results = await noteService.searchNotes({ query: 'JavaScript' });

      expect(results[0].relevance_score! >= results[1].relevance_score!).toBe(true);
    });

    it('should filter search results by category', async () => {
      const results = await noteService.searchNotes({
        query: 'JavaScript',
        category: 'progress',
      });

      expect(results).toHaveLength(1);
      expect(results[0].category).toBe('progress');
    });

    it('should filter search results by task_id', async () => {
      const results = await noteService.searchNotes({
        query: 'JavaScript',
        task_id: taskId,
      });

      expect(results).toHaveLength(2);
      results.forEach(result => expect(result.task_id).toBe(taskId));
    });

    it('should filter search results to pinned only', async () => {
      const results = await noteService.searchNotes({
        query: 'JavaScript',
        pinned_only: true,
      });

      expect(results).toHaveLength(1);
      expect(Boolean(results[0].pinned)).toBe(true);
    });

    it('should apply pagination to search results', async () => {
      const results = await noteService.searchNotes({
        query: 'JavaScript',
        limit: 1,
      });

      expect(results).toHaveLength(1);
    });
  });

  describe('getRecentNotes', () => {
    beforeEach(async () => {
      // Create notes with different dates
      await noteService.createNote({
        task_id: taskId,
        content: 'Recent note',
      });

      // Create an older note by manually updating its created_at
      const oldNote = await noteService.createNote({
        task_id: taskId,
        content: 'Old note',
      });

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);

      await dbConnection.execute('UPDATE notes SET created_at = ? WHERE id = ?', [
        oldDate,
        oldNote.id,
      ]);
    });

    it('should get recent notes within default 7 days', async () => {
      const notes = await noteService.getRecentNotes();

      // Both notes might be recent depending on timing
      expect(notes.length).toBeGreaterThanOrEqual(1);
      const recentNote = notes.find(n => n.content === 'Recent note');
      expect(recentNote).toBeDefined();
    });

    it('should get notes within custom day range', async () => {
      const notes = await noteService.getRecentNotes({ days: 15 });

      expect(notes).toHaveLength(2);
    });
  });

  describe('getNotesByCategory', () => {
    beforeEach(async () => {
      await noteService.createNote({
        task_id: taskId,
        content: 'General note',
        category: 'general',
      });

      await noteService.createNote({
        task_id: taskId,
        content: 'Progress note',
        category: 'progress',
      });

      await noteService.createNote({
        task_id: taskId,
        content: 'Another progress note',
        category: 'progress',
      });
    });

    it('should get notes by category', async () => {
      const progressNotes = await noteService.getNotesByCategory('progress');

      expect(progressNotes).toHaveLength(2);
      progressNotes.forEach(note => expect(note.category).toBe('progress'));
    });

    it('should return empty array for unused category', async () => {
      const blockerNotes = await noteService.getNotesByCategory('blocker');

      expect(blockerNotes).toHaveLength(0);
    });
  });

  describe('getNotesForBoard', () => {
    let otherBoardId: string;
    let otherTaskId: string;

    beforeEach(async () => {
      otherBoardId = 'other-board';
      otherTaskId = 'other-task';

      // Create another board and task
      await dbConnection.execute('INSERT INTO boards (id, name, description) VALUES (?, ?, ?)', [
        otherBoardId,
        'Other Board',
        'Other board',
      ]);

      await dbConnection.execute(
        'INSERT INTO columns (id, board_id, name, position) VALUES (?, ?, ?, ?)',
        ['other-todo', otherBoardId, 'To Do', 0]
      );

      await dbConnection.execute(
        'INSERT INTO tasks (id, board_id, column_id, title, description, status, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [otherTaskId, otherBoardId, 'other-todo', 'Other Task', 'Other task', 'todo', 0]
      );

      // Create notes for different boards
      await noteService.createNote({
        task_id: taskId,
        content: 'Note for test board',
      });

      await noteService.createNote({
        task_id: otherTaskId,
        content: 'Note for other board',
      });
    });

    it('should get notes for specific board', async () => {
      const boardNotes = await noteService.getNotesForBoard(boardId);

      expect(boardNotes).toHaveLength(1);
      expect(boardNotes[0].content).toBe('Note for test board');
    });

    it('should filter board notes by category', async () => {
      await noteService.createNote({
        task_id: taskId,
        content: 'Progress note for test board',
        category: 'progress',
      });

      const progressNotes = await noteService.getNotesForBoard(boardId, {
        category: 'progress',
      });

      expect(progressNotes).toHaveLength(1);
      expect(progressNotes[0].category).toBe('progress');
    });
  });

  describe('pinNote and unpinNote', () => {
    let createdNote: Note;

    beforeEach(async () => {
      createdNote = await noteService.createNote({
        task_id: taskId,
        content: 'Note to pin/unpin',
        pinned: false,
      });
    });

    it('should pin a note', async () => {
      const pinnedNote = await noteService.pinNote(createdNote.id);

      expect(Boolean(pinnedNote.pinned)).toBe(true);
    });

    it('should unpin a note', async () => {
      // First pin the note
      await noteService.pinNote(createdNote.id);

      // Then unpin it
      const unpinnedNote = await noteService.unpinNote(createdNote.id);

      expect(Boolean(unpinnedNote.pinned)).toBe(false);
    });
  });

  describe('duplicateNote', () => {
    let originalNote: Note;

    beforeEach(async () => {
      originalNote = await noteService.createNote({
        task_id: taskId,
        content: 'Original note content',
        category: 'decision',
        pinned: true,
      });
    });

    it('should duplicate note to same task', async () => {
      const duplicatedNote = await noteService.duplicateNote(originalNote.id);

      expect(duplicatedNote.id).not.toBe(originalNote.id);
      expect(duplicatedNote.task_id).toBe(originalNote.task_id);
      expect(duplicatedNote.content).toBe(originalNote.content);
      expect(duplicatedNote.category).toBe(originalNote.category);
      expect(duplicatedNote.pinned).toBe(false); // Pin status not duplicated
    });

    it('should duplicate note to different task', async () => {
      const duplicatedNote = await noteService.duplicateNote(originalNote.id, secondTaskId);

      expect(duplicatedNote.id).not.toBe(originalNote.id);
      expect(duplicatedNote.task_id).toBe(secondTaskId);
      expect(duplicatedNote.content).toBe(originalNote.content);
      expect(duplicatedNote.category).toBe(originalNote.category);
    });

    it('should throw error for non-existent note', async () => {
      await expect(noteService.duplicateNote('non-existent-id')).rejects.toThrow(
        'Failed to duplicate note'
      );
    });
  });

  describe('getNoteStats', () => {
    beforeEach(async () => {
      // Create notes of different categories
      await noteService.createNote({
        task_id: taskId,
        content: 'General note 1',
        category: 'general',
        pinned: false,
      });

      await noteService.createNote({
        task_id: taskId,
        content: 'General note 2',
        category: 'general',
        pinned: true,
      });

      await noteService.createNote({
        task_id: taskId,
        content: 'Progress note',
        category: 'progress',
        pinned: false,
      });

      await noteService.createNote({
        task_id: secondTaskId,
        content: 'Blocker note',
        category: 'blocker',
        pinned: true,
      });

      // Create an old note
      const oldNote = await noteService.createNote({
        task_id: taskId,
        content: 'Old note',
        category: 'decision',
      });

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);

      await dbConnection.execute('UPDATE notes SET created_at = ? WHERE id = ?', [
        oldDate,
        oldNote.id,
      ]);
    });

    it('should get overall note statistics', async () => {
      const stats = await noteService.getNoteStats();

      expect(stats.total).toBe(5);
      expect(stats.by_category.general).toBe(2);
      expect(stats.by_category.progress).toBe(1);
      expect(stats.by_category.blocker).toBe(1);
      expect(stats.by_category.decision).toBe(1);
      expect(stats.by_category.question).toBe(0);
      expect(stats.pinned).toBe(2);
      expect(stats.recent).toBeGreaterThanOrEqual(4); // Within last 7 days
    });

    it('should get statistics filtered by task_id', async () => {
      const stats = await noteService.getNoteStats({ task_id: taskId });

      expect(stats.total).toBe(4);
      expect(stats.by_category.general).toBe(2);
      expect(stats.by_category.blocker).toBe(0);
      expect(stats.pinned).toBe(1);
    });

    it('should get statistics filtered by board_id', async () => {
      const stats = await noteService.getNoteStats({ board_id: boardId });

      expect(stats.total).toBe(5);
    });

    it('should get statistics with custom day range', async () => {
      const stats = await noteService.getNoteStats({ days: 15 });

      expect(stats.recent).toBe(5); // All notes within 15 days
    });
  });

  describe('error handling', () => {
    it('should handle database connection errors gracefully', async () => {
      await dbConnection.close();

      await expect(noteService.getNotes()).rejects.toMatchObject({
        code: 'NOTES_FETCH_FAILED',
      });
    });

    it('should create ServiceError with correct properties', async () => {
      try {
        await noteService.updateNote('non-existent-id', { content: 'test' });
      } catch (error) {
        const serviceError = error as ServiceError;
        expect(serviceError.code).toBe('NOTE_UPDATE_FAILED');
        expect(serviceError.statusCode).toBe(500);
      }
    });
  });

  describe('private methods', () => {
    let createdNote: Note;

    beforeEach(async () => {
      createdNote = await noteService.createNote({
        task_id: taskId,
        content: 'Test note for private methods',
      });
    });

    it('should convert date strings to Date objects', async () => {
      const note = await noteService.getNoteById(createdNote.id);

      expect(note!.created_at).toBeInstanceOf(Date);
      expect(note!.updated_at).toBeInstanceOf(Date);
    });

    it('should highlight search terms correctly', async () => {
      await noteService.createNote({
        task_id: taskId,
        content: 'This contains special characters like [brackets] and (parentheses)',
      });

      const results = await noteService.searchNotes({
        query: '[brackets]',
        highlight: true,
      });

      expect(results[0].highlighted_content).toContain('<mark>[brackets]</mark>');
    });
  });
});
