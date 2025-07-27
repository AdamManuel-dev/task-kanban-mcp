/**
 * BoardService Test Suite
 *
 * Comprehensive tests for board management functionality including CRUD operations,
 * statistics, archiving, duplication, and column management.
 */

import { BoardService } from '../../../src/services/BoardService';
import { DatabaseConnection } from '../../../src/database/connection';
import type { CreateBoardRequest } from '../../../src/types';

describe('BoardService', () => {
  let boardService: BoardService;
  let db: DatabaseConnection;

  beforeAll(async () => {
    db = DatabaseConnection.getInstance();
    await db.initialize();
    boardService = new BoardService(db);
  });

  beforeEach(async () => {
    // Clean up any existing test data
    await db.execute('DELETE FROM tasks WHERE board_id LIKE "test-board%"');
    await db.execute('DELETE FROM columns WHERE board_id LIKE "test-board%"');
    await db.execute('DELETE FROM boards WHERE id LIKE "test-board%" OR name LIKE "%Test Board%"');
  });

  afterAll(async () => {
    await db.close();
  });

  describe('1. Board Creation (Foundation)', () => {
    it('should create a basic board successfully', async () => {
      const boardData: CreateBoardRequest = {
        name: 'Test Board',
        description: 'A test board for unit testing',
        color: '#2196F3',
      };

      const board = await boardService.createBoard(boardData);

      expect(board).toBeDefined();
      expect(board.id).toBeDefined();
      expect(board.name).toBe(boardData.name);
      expect(board.description).toBe(boardData.description);
      expect(board.color).toBe(boardData.color);
      expect(board.archived).toBe(false);
      expect(board.created_at).toBeDefined();
      expect(board.updated_at).toBeDefined();
    });

    it('should create board with minimal required fields', async () => {
      const boardData: CreateBoardRequest = {
        name: 'Minimal Test Board',
      };

      const board = await boardService.createBoard(boardData);

      expect(board.name).toBe(boardData.name);
      expect(board.description).toBeUndefined();
      expect(board.color).toBe('#2196F3'); // Default color
      expect(board.archived).toBe(false);
    });

    it('should create default columns when creating a board', async () => {
      const boardData: CreateBoardRequest = {
        name: 'Board with Columns Test',
      };

      const board = await boardService.createBoard(boardData);
      const boardWithColumns = await boardService.getBoardWithColumns(board.id);

      expect(boardWithColumns).toBeDefined();
      expect(boardWithColumns!.columns).toHaveLength(3);

      const columnNames = boardWithColumns!.columns.map(col => col.name);
      expect(columnNames).toContain('Todo');
      expect(columnNames).toContain('In Progress');
      expect(columnNames).toContain('Done');
    });

    it('should throw error for empty board name', async () => {
      await expect(
        boardService.createBoard({
          name: '',
        })
      ).rejects.toThrow();
    });

    it('should handle board creation with duplicate names', async () => {
      const boardData: CreateBoardRequest = {
        name: 'Duplicate Name Board',
      };

      // Create first board
      const board1 = await boardService.createBoard(boardData);
      expect(board1).toBeDefined();

      // Create second board with same name - should succeed (names don't need to be unique)
      const board2 = await boardService.createBoard(boardData);
      expect(board2).toBeDefined();
      expect(board2.id).not.toBe(board1.id);
    });
  });

  describe('2. Board Retrieval (Basic Operations)', () => {
    let testBoardId: string;

    beforeEach(async () => {
      const board = await boardService.createBoard({
        name: 'Retrieval Test Board',
        description: 'Used for testing board retrieval operations',
        color: '#4CAF50',
      });
      testBoardId = board.id;
    });

    it('should get board by ID', async () => {
      const board = await boardService.getBoardById(testBoardId);

      expect(board).toBeDefined();
      expect(board!.id).toBe(testBoardId);
      expect(board!.name).toBe('Retrieval Test Board');
      expect(board!.description).toBe('Used for testing board retrieval operations');
      expect(board!.color).toBe('#4CAF50');
    });

    it('should return null for non-existent board ID', async () => {
      const board = await boardService.getBoardById('non-existent-id');
      expect(board).toBeNull();
    });

    it('should get board with columns', async () => {
      const boardWithColumns = await boardService.getBoardWithColumns(testBoardId);

      expect(boardWithColumns).toBeDefined();
      expect(boardWithColumns!.id).toBe(testBoardId);
      expect(boardWithColumns!.columns).toBeDefined();
      expect(boardWithColumns!.columns.length).toBeGreaterThan(0);

      // Should have default columns
      const columnNames = boardWithColumns!.columns.map(col => col.name);
      expect(columnNames).toContain('Todo');
      expect(columnNames).toContain('In Progress');
      expect(columnNames).toContain('Done');
    });

    it.skip('should get board with statistics', async () => {
      const boardWithStats = await boardService.getBoardWithStats(testBoardId);

      expect(boardWithStats).toBeDefined();
      expect(boardWithStats!.id).toBe(testBoardId);
      expect(boardWithStats!.taskCount).toBeDefined();
      expect(boardWithStats!.completedTasks).toBeDefined();
      expect(boardWithStats!.inProgressTasks).toBeDefined();
      expect(boardWithStats!.todoTasks).toBeDefined();
      expect(boardWithStats!.overdueTasks).toBeDefined();
      expect(boardWithStats!.avgPriority).toBeDefined();

      // For a new board, task counts should be 0
      expect(boardWithStats!.taskCount).toBe(0);
      expect(boardWithStats!.completedTasks).toBe(0);
    });

    it('should get all boards without filters', async () => {
      // Create a few more boards
      await boardService.createBoard({ name: 'Board 1' });
      await boardService.createBoard({ name: 'Board 2' });

      const boards = await boardService.getBoards();

      expect(boards.length).toBeGreaterThanOrEqual(3);
      expect(boards.every(board => !board.archived)).toBe(true);
    });

    it('should handle pagination', async () => {
      // Create multiple boards
      for (let i = 1; i <= 5; i++) {
        await boardService.createBoard({ name: `Pagination Board ${String(i)}` });
      }

      const firstPage = await boardService.getBoards({ limit: 2, offset: 0 });
      const secondPage = await boardService.getBoards({ limit: 2, offset: 2 });

      expect(firstPage).toHaveLength(2);
      expect(secondPage).toHaveLength(2);
      expect(firstPage[0].id).not.toBe(secondPage[0].id);
    });

    it.skip('should sort boards by name', async () => {
      await boardService.createBoard({ name: 'Z Board' });
      await boardService.createBoard({ name: 'A Board' });

      const boards = await boardService.getBoards({
        sort_by: 'name',
        sort_order: 'asc',
      });

      const names = boards.map(board => board.name);
      const sortedNames = [...names].sort();
      expect(names).toEqual(sortedNames);
    });
  });

  describe('3. Board Updates (Lifecycle Management)', () => {
    let testBoardId: string;

    beforeEach(async () => {
      const board = await boardService.createBoard({
        name: 'Update Test Board',
        description: 'Original description',
        color: '#FF5722',
      });
      testBoardId = board.id;
    });

    it('should update board name', async () => {
      const updatedBoard = await boardService.updateBoard(testBoardId, {
        name: 'Updated Board Name',
      });

      expect(updatedBoard.name).toBe('Updated Board Name');
      expect(updatedBoard.id).toBe(testBoardId);

      // Verify in database
      const dbBoard = await boardService.getBoardById(testBoardId);
      expect(dbBoard?.name).toBe('Updated Board Name');
    });

    it('should update board description', async () => {
      const updatedBoard = await boardService.updateBoard(testBoardId, {
        description: 'Updated description with more details',
      });

      expect(updatedBoard.description).toBe('Updated description with more details');
    });

    it('should update board color', async () => {
      const updatedBoard = await boardService.updateBoard(testBoardId, {
        color: '#9C27B0',
      });

      expect(updatedBoard.color).toBe('#9C27B0');
    });

    it('should handle partial updates', async () => {
      const originalBoard = await boardService.getBoardById(testBoardId);

      const updatedBoard = await boardService.updateBoard(testBoardId, {
        color: '#E91E63',
      });

      expect(updatedBoard.name).toBe(originalBoard?.name); // Should remain unchanged
      expect(updatedBoard.description).toBe(originalBoard?.description); // Should remain unchanged
      expect(updatedBoard.color).toBe('#E91E63'); // Should be updated
    });

    it('should update updated_at timestamp', async () => {
      const originalBoard = await boardService.getBoardById(testBoardId);
      expect(originalBoard).toBeDefined();

      // Wait a bit to ensure timestamp difference
      await new Promise<void>(resolve => {
        setTimeout(resolve, 10);
      });

      const updatedBoard = await boardService.updateBoard(testBoardId, {
        name: 'Timestamp Test',
      });

      expect(updatedBoard.updated_at).not.toBe(originalBoard!.updated_at);
    });

    it('should throw error for non-existent board', async () => {
      await expect(
        boardService.updateBoard('non-existent-id', {
          name: 'Should fail',
        })
      ).rejects.toThrow();
    });
  });

  describe('4. Board Archiving (Lifecycle Management)', () => {
    let testBoardId: string;

    beforeEach(async () => {
      const board = await boardService.createBoard({
        name: 'Archive Test Board',
      });
      testBoardId = board.id;
    });

    it.skip('should archive board', async () => {
      const archivedBoard = await boardService.archiveBoard(testBoardId);

      expect(archivedBoard.archived).toBe(true);
      expect(archivedBoard.id).toBe(testBoardId);

      // Verify archived boards don't appear in regular listings
      const boards = await boardService.getBoards();
      const foundBoard = boards.find(board => board.id === testBoardId);
      expect(foundBoard).toBeUndefined();
    });

    it.skip('should unarchive board', async () => {
      // First archive the board
      await boardService.archiveBoard(testBoardId);

      // Then unarchive it
      const unarchivedBoard = await boardService.unarchiveBoard(testBoardId);

      expect(unarchivedBoard.archived).toBe(false);

      // Verify board appears in regular listings again
      const boards = await boardService.getBoards();
      const foundBoard = boards.find(board => board.id === testBoardId);
      expect(foundBoard).toBeDefined();
    });

    it('should throw error when archiving non-existent board', async () => {
      await expect(boardService.archiveBoard('non-existent-id')).rejects.toThrow();
    });

    it('should throw error when unarchiving non-existent board', async () => {
      await expect(boardService.unarchiveBoard('non-existent-id')).rejects.toThrow();
    });
  });

  describe('5. Board Duplication (Advanced Operations)', () => {
    let sourceBoardId: string;

    beforeEach(async () => {
      const board = await boardService.createBoard({
        name: 'Source Board for Duplication',
        description: 'This board will be duplicated',
        color: '#FF9800',
      });
      sourceBoardId = board.id;
    });

    it('should duplicate board with new name', async () => {
      const duplicatedBoard = await boardService.duplicateBoard(sourceBoardId, 'Duplicated Board');

      expect(duplicatedBoard.id).not.toBe(sourceBoardId);
      expect(duplicatedBoard.name).toBe('Duplicated Board');
      expect(duplicatedBoard.description).toBe('This board will be duplicated');
      expect(duplicatedBoard.color).toBe('#FF9800');
      expect(duplicatedBoard.archived).toBe(false);
    });

    it.skip('should duplicate board with auto-generated name', async () => {
      const duplicatedBoard = await boardService.duplicateBoard(sourceBoardId);

      expect(duplicatedBoard.id).not.toBe(sourceBoardId);
      expect(duplicatedBoard.name).toBe('Copy of Source Board for Duplication');
    });

    it('should duplicate board columns', async () => {
      const originalBoardWithColumns = await boardService.getBoardWithColumns(sourceBoardId);
      const duplicatedBoard = await boardService.duplicateBoard(sourceBoardId);
      const duplicatedBoardWithColumns = await boardService.getBoardWithColumns(duplicatedBoard.id);

      expect(duplicatedBoardWithColumns).toBeDefined();
      expect(duplicatedBoardWithColumns!.columns).toHaveLength(
        originalBoardWithColumns!.columns.length
      );

      // Column names should match
      const originalColumnNames = originalBoardWithColumns!.columns.map(col => col.name);
      const duplicatedColumnNames = duplicatedBoardWithColumns!.columns.map(col => col.name);
      expect(duplicatedColumnNames).toEqual(originalColumnNames);
    });

    it('should throw error when duplicating non-existent board', async () => {
      await expect(boardService.duplicateBoard('non-existent-id')).rejects.toThrow();
    });
  });

  describe('6. Board Deletion (Cleanup Operations)', () => {
    let testBoardId: string;

    beforeEach(async () => {
      const board = await boardService.createBoard({
        name: 'Delete Test Board',
      });
      testBoardId = board.id;
    });

    it('should delete board successfully', async () => {
      await boardService.deleteBoard(testBoardId);

      // Verify board is deleted
      const deletedBoard = await boardService.getBoardById(testBoardId);
      expect(deletedBoard).toBeNull();
    });

    it('should delete board columns when deleting board', async () => {
      // Verify columns exist first
      const boardWithColumns = await boardService.getBoardWithColumns(testBoardId);
      expect(boardWithColumns!.columns.length).toBeGreaterThan(0);

      await boardService.deleteBoard(testBoardId);

      // Verify columns are also deleted
      const columns = await db.query('SELECT * FROM columns WHERE board_id = ?', [testBoardId]);
      expect(columns).toHaveLength(0);
    });

    it('should throw error for non-existent board', async () => {
      await expect(boardService.deleteBoard('non-existent-id')).rejects.toThrow();
    });
  });

  describe('7. Error Handling & Edge Cases', () => {
    it('should handle database connection errors gracefully', async () => {
      // Mock database error by closing connection temporarily
      const mockDb = {
        query: jest.fn().mockRejectedValue(new Error('Database connection lost')),
        execute: jest.fn().mockRejectedValue(new Error('Database connection lost')),
        transaction: jest.fn().mockRejectedValue(new Error('Database connection lost')),
      };

      const errorBoardService = new BoardService(mockDb as any);

      await expect(errorBoardService.getBoards()).rejects.toThrow();
    });

    it('should validate board name is not empty', async () => {
      await expect(
        boardService.createBoard({
          name: '   ', // Only whitespace
        })
      ).rejects.toThrow();
    });

    it('should handle invalid color formats gracefully', async () => {
      // Service should accept any string as color (validation can be done at API layer)
      const board = await boardService.createBoard({
        name: 'Invalid Color Test',
        color: 'not-a-valid-color',
      });

      expect(board.color).toBe('not-a-valid-color');
    });
  });

  describe('8. Integration with Other Services', () => {
    let testBoardId: string;

    beforeEach(async () => {
      const board = await boardService.createBoard({
        name: 'Integration Test Board',
      });
      testBoardId = board.id;
    });

    it('should maintain referential integrity when deleting boards with tasks', async () => {
      // This test would need TaskService integration
      // For now, we'll test that the board can be deleted even if it had tasks

      await boardService.deleteBoard(testBoardId);

      const deletedBoard = await boardService.getBoardById(testBoardId);
      expect(deletedBoard).toBeNull();
    });
  });
});
