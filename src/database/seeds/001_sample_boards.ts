import type { Database } from 'sqlite';
import type { Database as SQLiteDB } from 'sqlite3';

export const name = 'Sample Boards';
export const description = 'Create sample boards with columns for development';

export async function run(): Promise<void>(db: Database<SQLiteDB>): Promise<void> {
  // Create sample boards
  await db.run(`
    INSERT INTO boards (id, name, description, color) VALUES 
    ('board-1', 'Development Board', 'Main development board for tracking features and bugs', '#2196F3'),
    ('board-2', 'Personal Tasks', 'Personal task management board', '#4CAF50'),
    ('board-3', 'Project Planning', 'Long-term project planning and roadmap', '#FF9800')
  `);

  // Create columns for Development Board
  await db.run(`
    INSERT INTO columns (id, board_id, name, position, wip_limit) VALUES 
    ('col-1', 'board-1', 'Backlog', 1, NULL),
    ('col-2', 'board-1', 'To Do', 2, 5),
    ('col-3', 'board-1', 'In Progress', 3, 3),
    ('col-4', 'board-1', 'Code Review', 4, 2),
    ('col-5', 'board-1', 'Testing', 5, 3),
    ('col-6', 'board-1', 'Done', 6, NULL)
  `);

  // Create columns for Personal Tasks
  await db.run(`
    INSERT INTO columns (id, board_id, name, position, wip_limit) VALUES 
    ('col-7', 'board-2', 'To Do', 1, NULL),
    ('col-8', 'board-2', 'Doing', 2, 3),
    ('col-9', 'board-2', 'Done', 3, NULL)
  `);

  // Create columns for Project Planning
  await db.run(`
    INSERT INTO columns (id, board_id, name, position, wip_limit) VALUES 
    ('col-10', 'board-3', 'Ideas', 1, NULL),
    ('col-11', 'board-3', 'Planned', 2, NULL),
    ('col-12', 'board-3', 'In Progress', 3, 2),
    ('col-13', 'board-3', 'Completed', 4, NULL)
  `);

  logger.log('Sample boards and columns created');
}
