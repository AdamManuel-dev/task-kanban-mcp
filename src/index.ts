/**
 * Main entry point for the MCP Kanban Server
 */

// Register path alias resolver for production
import { logger } from '@/utils/logger';

if (process.env.NODE_ENV === 'production') {
  require('../resolve-aliases.config.js');
}

logger.info('MCP Kanban Server starting...');

// TODO: Implement main server initialization
export {};
