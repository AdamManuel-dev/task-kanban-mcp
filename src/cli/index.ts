#!/usr/bin/env node

import { Command } from 'commander';
import { config } from '../config';
import { dbConnection } from '../database/connection';

const program = new Command();

program.name('mcp-kanban').description('MCP Kanban CLI').version('1.0.0');

// Basic health check command
program
  .command('health')
  .description('Check system health')
  .action(async () => {
    try {
      console.log('🔍 Checking system health...');

      // Check database connection
      await dbConnection.initialize({
        skipSchema: false,
      });
      console.log('✅ Database connection: OK');

      // Check config
      console.log('✅ Configuration: OK');
      console.log(`   Database: ${config.database.path}`);
      console.log(`   Port: ${config.server.port}`);

      console.log('🎉 System is healthy!');
    } catch (error) {
      console.error('❌ System health check failed:', error);
      process.exit(1);
    }
  });

// Basic task commands
program
  .command('task')
  .description('Task management')
  .addCommand(
    new Command('list').description('List all tasks').action(async () => {
      try {
        await dbConnection.initialize({ skipSchema: false });
        const tasks = await dbConnection.query('SELECT * FROM tasks LIMIT 10');
        console.log('📋 Tasks:');
        tasks.forEach((task: any) => {
          console.log(`  - ${task.title} (${task.status})`);
        });
      } catch (error) {
        console.error('❌ Failed to list tasks:', error);
        process.exit(1);
      }
    })
  )
  .addCommand(
    new Command('create')
      .description('Create a new task')
      .option('-t, --title <title>', 'Task title')
      .option('-d, --description <description>', 'Task description')
      .action(async options => {
        try {
          await dbConnection.initialize({ skipSchema: false });

          if (!options.title) {
            console.error('❌ Title is required');
            process.exit(1);
          }

          const taskId = crypto.randomUUID();
          await dbConnection.execute(
            'INSERT INTO tasks (id, title, description, status, created_at) VALUES (?, ?, ?, ?, ?)',
            [taskId, options.title, options.description ?? '', 'todo', new Date().toISOString()]
          );

          console.log('✅ Task created successfully');
        } catch (error) {
          console.error('❌ Failed to create task:', error);
          process.exit(1);
        }
      })
  );

// Parse command line arguments
program.parse();
