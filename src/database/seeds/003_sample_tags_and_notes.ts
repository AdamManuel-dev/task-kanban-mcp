import type { Database } from 'sqlite';
import type { Database as SQLiteDB } from 'sqlite3';
import { logger } from '@/utils/logger';

export const name = 'Sample Tags and Notes';
export const description = 'Create sample tags, task-tag relationships, and notes';

export async function run(db: Database<SQLiteDB>): Promise<void> {
  // Create sample tags
  await db.run(`
    INSERT INTO tags (id, name, color, description) VALUES 
    ('tag-1', 'bug', '#F44336', 'Issues that need to be fixed'),
    ('tag-2', 'feature', '#2196F3', 'New functionality to be implemented'),
    ('tag-3', 'enhancement', '#4CAF50', 'Improvements to existing features'),
    ('tag-4', 'documentation', '#FF9800', 'Documentation-related tasks'),
    ('tag-5', 'urgent', '#E91E63', 'High priority tasks that need immediate attention'),
    ('tag-6', 'backend', '#9C27B0', 'Backend development tasks'),
    ('tag-7', 'frontend', '#00BCD4', 'Frontend development tasks'),
    ('tag-8', 'database', '#795548', 'Database-related tasks'),
    ('tag-9', 'security', '#607D8B', 'Security-related improvements'),
    ('tag-10', 'performance', '#FF5722', 'Performance optimization tasks')
  `);

  // Create hierarchical tags
  await db.run(`
    INSERT INTO tags (id, name, color, description, parent_tag_id) VALUES 
    ('tag-11', 'critical-bug', '#D32F2F', 'Critical bugs that break functionality', 'tag-1'),
    ('tag-12', 'minor-bug', '#FFCDD2', 'Minor bugs with low impact', 'tag-1'),
    ('tag-13', 'api-feature', '#1976D2', 'New API endpoints and functionality', 'tag-2'),
    ('tag-14', 'ui-feature', '#0288D1', 'New user interface features', 'tag-2')
  `);

  // Create task-tag relationships
  await db.run(`
    INSERT INTO task_tags (task_id, tag_id) VALUES 
    ('task-1', 'tag-2'),   -- Implement user authentication: feature
    ('task-1', 'tag-6'),   -- Implement user authentication: backend
    ('task-1', 'tag-9'),   -- Implement user authentication: security
    ('task-2', 'tag-8'),   -- Design database schema: database
    ('task-3', 'tag-3'),   -- Set up CI/CD pipeline: enhancement
    ('task-4', 'tag-4'),   -- Write API documentation: documentation
    ('task-5', 'tag-2'),   -- Implement real-time updates: feature
    ('task-5', 'tag-6'),   -- Implement real-time updates: backend
    ('task-6', 'tag-1'),   -- Fix drag and drop bug: bug
    ('task-6', 'tag-5'),   -- Fix drag and drop bug: urgent
    ('task-6', 'tag-7'),   -- Fix drag and drop bug: frontend
    ('task-7', 'tag-2'),   -- Add task filtering: feature
    ('task-7', 'tag-7'),   -- Add task filtering: frontend
    ('task-11', 'tag-2'),  -- Mobile app development: feature
    ('task-12', 'tag-3'),  -- Integration with Slack: enhancement
    ('task-13', 'tag-10')  -- Performance optimization: performance
  `);

  // Create sample notes
  await db.run(`
    INSERT INTO notes (id, task_id, content, category, pinned) VALUES 
    ('note-1', 'task-1', 'Research JWT libraries - jsonwebtoken vs jose. Leaning towards jsonwebtoken for better documentation.', 'progress', false),
    ('note-2', 'task-1', 'Security considerations: token expiration, refresh tokens, and secure storage on client side.', 'decision', true),
    ('note-3', 'task-2', 'Database schema design completed. All tables, relationships, and indexes defined. Migration system in place.', 'progress', false),
    ('note-4', 'task-5', 'WebSocket implementation will use Socket.io for real-time communication. Need to handle connection state and reconnection logic.', 'general', false),
    ('note-5', 'task-6', 'Bug occurs when dragging tasks between columns - position updates but UI doesnt reflect changes immediately. Likely a state management issue.', 'blocker', true),
    ('note-6', 'task-6', 'Investigated drag and drop library. Issue is with React state updates not triggering re-renders. Need to ensure proper key props.', 'progress', false),
    ('note-7', 'task-7', 'Filtering requirements: by status (todo/in_progress/done), by tags (multiple selection), by assignee, by date range. Need search functionality too.', 'general', false),
    ('note-8', 'task-9', 'Currently on Chapter 5: Asynchronous Control Flow Patterns. Learning about promises, async/await, and streams.', 'progress', false),
    ('note-9', 'task-11', 'Mobile app requirements: React Native vs Flutter vs native. Need to support iOS and Android. Priority: MVP with basic task management.', 'decision', false),
    ('note-10', 'task-13', 'Performance analysis shows database queries are the bottleneck. Need to optimize indexes and implement query caching.', 'blocker', true)
  `);

  // Create task dependencies
  await db.run(`
    INSERT INTO task_dependencies (id, task_id, depends_on_task_id, dependency_type) VALUES 
    ('dep-1', 'task-15', 'task-14', 'blocks'),  -- Create login API depends on JWT middleware
    ('dep-2', 'task-16', 'task-14', 'blocks'),  -- Create logout API depends on JWT middleware
    ('dep-3', 'task-5', 'task-1', 'blocks'),    -- Real-time updates depend on authentication
    ('dep-4', 'task-7', 'task-5', 'relates_to') -- Task filtering relates to real-time updates
  `);

  logger.info('Sample tags, notes, and dependencies created');
}
