const { DatabaseConnection } = require('./dist/database/connection');

async function debugTaskTable() {
  try {
    console.log('Starting debug...');

    // Initialize database
    const dbConnection = DatabaseConnection.getInstance();
    process.env.DATABASE_PATH = ':memory:';
    await dbConnection.initialize();

    console.log('Database initialized');

    // Check if tasks table exists
    const tables = await dbConnection.query(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='tasks'
    `);

    console.log('Tasks table exists:', tables);

    // Check all tables
    const allTables = await dbConnection.query(`
      SELECT name FROM sqlite_master 
      WHERE type='table'
    `);

    console.log('All tables:', allTables);

    // Try to query tasks table
    try {
      const tasks = await dbConnection.query('SELECT COUNT(*) as count FROM tasks');
      console.log('Tasks count:', tasks);
    } catch (error) {
      console.error('Error querying tasks table:', error.message);
    }

    await dbConnection.close();
    console.log('Debug complete');
  } catch (error) {
    console.error('Debug error:', error);
  }
}

debugTaskTable();
