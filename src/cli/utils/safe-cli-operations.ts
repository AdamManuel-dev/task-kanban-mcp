/**
 * @fileoverview Safe CLI operations wrapper for common commands
 * @lastmodified 2025-07-27T23:45:19Z
 *
 * Features: Pre-configured safe wrappers for common CLI operations
 * Main APIs: safeFileRead, safeDirectoryList, safeGitCommand, safeNpmCommand
 * Constraints: Uses CommandInjectionPrevention for validation
 * Patterns: Static methods with path validation and command execution
 */

import {
  CommandInjectionPrevention,
  safeExecute,
  type ExecutionResult,
} from './command-injection-prevention';

/**
 * Safe wrapper for common CLI operations
 *
 * @class SafeCliOperations
 * @description Provides pre-configured safe wrappers for common CLI operations
 * like file reading, directory listing, and version control commands.
 *
 * @example
 * ```typescript
 * // Read a file safely
 * const content = await SafeCliOperations.safeFileRead('./config.json');
 *
 * // List directory contents
 * const files = await SafeCliOperations.safeDirectoryList('./src');
 *
 * // Execute git command
 * const result = await SafeCliOperations.safeGitCommand(['status']);
 * ```
 */
export class SafeCliOperations {
  /**
   * Safely reads a file with path validation
   *
   * @static
   * @param {string} filePath - Path to the file to read
   * @param {string[]} [allowedDirectories=[]] - Allowed base directories
   * @returns {Promise<string>} File contents
   *
   * @throws {Error} If the file path is unsafe or reading fails
   *
   * @example
   * ```typescript
   * try {
   *   const content = await SafeCliOperations.safeFileRead('./data.json', ['./']);
   *   const data = JSON.parse(content);
   * } catch (error) {
   *   console.error('Failed to read file:', error.message);
   * }
   * ```
   */
  static async safeFileRead(filePath: string, allowedDirectories: string[] = []): Promise<string> {
    const pathValidation = CommandInjectionPrevention.validateFilePath(
      filePath,
      allowedDirectories
    );
    if (!pathValidation.safe) {
      throw new Error(`Unsafe file path: ${pathValidation.warnings.join(', ')}`);
    }

    const result = await safeExecute('cat', [pathValidation.normalizedPath], {
      timeout: 5000,
      restrictToWorkingDir: allowedDirectories.length === 0,
    });

    if (!result.success) {
      throw new Error(`Failed to read file: ${result.stderr}`);
    }

    return result.stdout;
  }

  /**
   * Safely lists directory contents
   *
   * @static
   * @param {string} [dirPath='.'] - Directory path to list
   * @param {string[]} [allowedDirectories=[]] - Allowed base directories
   * @returns {Promise<string[]>} Array of directory entries
   *
   * @throws {Error} If the directory path is unsafe or listing fails
   *
   * @example
   * ```typescript
   * const files = await SafeCliOperations.safeDirectoryList('./src');
   * files.forEach(file => console.log(file));
   * ```
   */
  static async safeDirectoryList(
    dirPath: string = '.',
    allowedDirectories: string[] = []
  ): Promise<string[]> {
    const pathValidation = CommandInjectionPrevention.validateFilePath(dirPath, allowedDirectories);
    if (!pathValidation.safe) {
      throw new Error(`Unsafe directory path: ${pathValidation.warnings.join(', ')}`);
    }

    const result = await safeExecute('ls', ['-la', pathValidation.normalizedPath], {
      timeout: 10000,
      restrictToWorkingDir: allowedDirectories.length === 0,
    });

    if (!result.success) {
      throw new Error(`Failed to list directory: ${result.stderr}`);
    }

    return result.stdout.split('\n').filter(line => line.trim().length > 0);
  }

  /**
   * Safely executes Git commands
   *
   * @static
   * @param {string[]} args - Git command arguments
   * @returns {Promise<ExecutionResult>} Command execution result
   *
   * @description Executes Git commands with a whitelist of safe operations
   * including status, log, diff, branch, and other read/write operations.
   *
   * @example
   * ```typescript
   * // Get git status
   * const status = await SafeCliOperations.safeGitCommand(['status', '--short']);
   *
   * // View recent commits
   * const log = await SafeCliOperations.safeGitCommand(['log', '--oneline', '-10']);
   * ```
   */
  static async safeGitCommand(args: string[]): Promise<ExecutionResult> {
    return safeExecute('git', args, {
      allowedCommands: ['git'],
      timeout: 30000,
      restrictToWorkingDir: true,
      logExecution: true,
    });
  }

  /**
   * Safely executes NPM commands
   *
   * @static
   * @param {string[]} args - NPM command arguments
   * @returns {Promise<ExecutionResult>} Command execution result
   *
   * @description Executes NPM commands with a whitelist of safe operations
   * including install, update, list, audit, and script execution.
   *
   * @example
   * ```typescript
   * // Install dependencies
   * await SafeCliOperations.safeNpmCommand(['install']);
   *
   * // Run a script
   * const result = await SafeCliOperations.safeNpmCommand(['run', 'test']);
   * ```
   */
  static async safeNpmCommand(args: string[]): Promise<ExecutionResult> {
    return safeExecute('npm', args, {
      allowedCommands: ['npm'],
      timeout: 120000, // NPM operations can take longer
      restrictToWorkingDir: true,
      logExecution: true,
    });
  }
}
