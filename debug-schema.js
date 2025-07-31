// Quick debug script to check table schema
const { DatabaseConnection } = require('./dist/database/connection');

async function checkSchema() {
  const db = DatabaseConnection.getInstance();

  try {
    await db.initialize();

    // Check if tasks table exists
    const tablesResult = await db.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'"
    );
    console.log('Tables found:', tablesResult);

    if (tablesResult.length > 0) {
      // Get table schema
      const schema = await db.query('PRAGMA table_info(tasks)');
      console.log('Tasks table schema:');
      schema.forEach(col => {
        console.log(`  ${col.name}: ${col.type} (${col.notnull ? 'NOT NULL' : 'NULLABLE'})`);
      });
    } else {
      console.log('Tasks table does not exist');
    }

    await db.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkSchema();
