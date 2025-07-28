/**
 * @fileoverview Task commands module - compatibility wrapper
 * @lastmodified 2025-07-28T10:30:00Z
 * 
 * Features: Re-exports task commands from modular structure
 * Main APIs: registerTaskCommands() - main entry point for CLI
 * Constraints: Maintains backward compatibility with existing imports
 * Patterns: Simple re-export pattern, modular organization
 */

// Re-export the main registration function from the new modular structure
export { registerTaskCommands } from './tasks';

// Re-export types for compatibility
export type * from './tasks/types';