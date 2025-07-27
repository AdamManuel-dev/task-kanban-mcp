import type { Database } from 'sqlite';
import type { Database as SQLiteDB } from 'sqlite3';

export const name = 'Sample Tasks';
export const description =
  'Create sample tasks with various statuses, priorities, and relationships';

export async function run(): Promise<void>(db: Database<SQLiteDB>): Promise<void> {
  // Create sample tasks for Development Board
  await db.run(`
    INSERT INTO tasks (id, title, description, board_id, column_id, position, priority, status, due_date, estimated_hours) VALUES 
    ('task-1', 'Implement user authentication', 'Add JWT-based authentication system with login/logout functionality', 'board-1', 'col-3', 1, 100, 'in_progress', datetime('now', '+7 days'), 16.0),
    ('task-2', 'Design database schema', 'Create comprehensive database schema for the kanban system', 'board-1', 'col-6', 1, 90, 'done', NULL, 8.0),
    ('task-3', 'Set up CI/CD pipeline', 'Configure GitHub Actions for automated testing and deployment', 'board-1', 'col-2', 1, 80, 'todo', datetime('now', '+14 days'), 4.0),
    ('task-4', 'Write API documentation', 'Create comprehensive API documentation using OpenAPI/Swagger', 'board-1', 'col-2', 2, 70, 'todo', datetime('now', '+21 days'), 12.0),
    ('task-5', 'Implement real-time updates', 'Add WebSocket support for real-time task updates', 'board-1', 'col-1', 1, 85, 'todo', datetime('now', '+30 days'), 20.0),
    ('task-6', 'Fix drag and drop bug', 'Resolve issue with tasks not updating position correctly when dragged', 'board-1', 'col-4', 1, 95, 'in_progress', datetime('now', '+2 days'), 4.0),
    ('task-7', 'Add task filtering', 'Implement filtering by status, assignee, and tags', 'board-1', 'col-1', 2, 60, 'todo', NULL, 8.0)
  `);

  // Create sample tasks for Personal Tasks
  await db.run(`
    INSERT INTO tasks (id, title, description, board_id, column_id, position, priority, status) VALUES 
    ('task-8', 'Buy groceries', 'Weekly grocery shopping - milk, bread, vegetables', 'board-2', 'col-7', 1, 50, 'todo'),
    ('task-9', 'Read Node.js book', 'Continue reading "Node.js Design Patterns" - Chapter 5', 'board-2', 'col-8', 1, 30, 'in_progress'),
    ('task-10', 'Exercise routine', 'Complete 30-minute workout routine', 'board-2', 'col-9', 1, 40, 'done')
  `);

  // Create sample tasks for Project Planning
  await db.run(`
    INSERT INTO tasks (id, title, description, board_id, column_id, position, priority, status, estimated_hours) VALUES 
    ('task-11', 'Mobile app development', 'Plan and develop mobile app for the kanban system', 'board-3', 'col-11', 1, 90, 'todo', 160.0),
    ('task-12', 'Integration with Slack', 'Add Slack integration for notifications and updates', 'board-3', 'col-10', 1, 70, 'todo', 24.0),
    ('task-13', 'Performance optimization', 'Analyze and optimize application performance', 'board-3', 'col-12', 1, 80, 'in_progress', 32.0)
  `);

  // Create subtasks
  await db.run(`
    INSERT INTO tasks (id, title, description, board_id, column_id, position, priority, status, parent_task_id, estimated_hours) VALUES 
    ('task-14', 'Set up JWT middleware', 'Create middleware for JWT token validation', 'board-1', 'col-3', 2, 100, 'in_progress', 'task-1', 4.0),
    ('task-15', 'Create login API endpoint', 'Implement POST /auth/login endpoint', 'board-1', 'col-2', 3, 100, 'todo', 'task-1', 3.0),
    ('task-16', 'Create logout API endpoint', 'Implement POST /auth/logout endpoint', 'board-1', 'col-2', 4, 100, 'todo', 'task-1', 2.0),
    ('task-17', 'Add password hashing', 'Implement bcrypt password hashing', 'board-1', 'col-6', 2, 100, 'done', 'task-1', 2.0)
  `);

  logger.log('Sample tasks and subtasks created');
}
