/**
 * Command Injection Prevention Module
 * Addresses TASK-120: Add command injection prevention
 *
 * This module provides comprehensive protection against command injection attacks
 * in CLI applications by sanitizing inputs and preventing execution of malicious commands.
 */

// import type { SpawnOptions } from 'child_process';
import { spawn } from 'child_process';
import path from 'path';
import { logger } from '@/utils/logger';
import { inputSanitizer, InputSanitizer } from './input-sanitizer';

/**
 * Options for command execution with security controls
 *
 * @interface CommandExecutionOptions
 * @property {string[]} [allowedCommands] - Whitelist of allowed commands
 * @property {string[]} [allowedFlags] - Whitelist of allowed command flags
 * @property {boolean} [restrictToWorkingDir] - Restrict file paths to current working directory
 * @property {number} [timeout] - Command execution timeout in milliseconds
 * @property {Record<string, string>} [env] - Additional environment variables
 * @property {boolean} [validateArgs] - Whether to validate arguments
 * @property {boolean} [logExecution] - Whether to log command execution
 */
export interface CommandExecutionOptions {
  allowedCommands?: string[];
  allowedFlags?: string[];
  restrictToWorkingDir?: boolean;
  timeout?: number;
  env?: Record<string, string>;
  validateArgs?: boolean;
  logExecution?: boolean;
}

/**
 * Result of command validation with security analysis
 *
 * @interface CommandValidationResult
 * @property {boolean} safe - Whether the command is safe to execute
 * @property {string} sanitizedCommand - Sanitized command name
 * @property {string[]} sanitizedArgs - Sanitized command arguments
 * @property {string[]} warnings - Non-critical security warnings
 * @property {string[]} blockedPatterns - Critical patterns that blocked execution
 */
export interface CommandValidationResult {
  safe: boolean;
  sanitizedCommand: string;
  sanitizedArgs: string[];
  warnings: string[];
  blockedPatterns: string[];
}

/**
 * Result of safe command execution
 *
 * @interface ExecutionResult
 * @property {boolean} success - Whether the command executed successfully
 * @property {string} stdout - Standard output from the command
 * @property {string} stderr - Standard error output from the command
 * @property {number} exitCode - Process exit code
 * @property {number} duration - Execution duration in milliseconds
 * @property {string} command - The command that was executed
 * @property {string[]} args - The arguments that were passed
 */
export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  command: string;
  args: string[];
}

/**
 * Command injection prevention class with comprehensive security measures
 *
 * @class CommandInjectionPrevention
 * @description Provides robust protection against command injection attacks by
 * validating, sanitizing, and safely executing CLI commands. Uses multiple
 * layers of security including whitelisting, pattern detection, and path validation.
 *
 * @example
 * ```typescript
 * const cip = CommandInjectionPrevention.getInstance();
 *
 * // Validate a command before execution
 * const validation = cip.validateCommand('git', ['status']);
 * if (validation.safe) {
 *   const result = await cip.safeExecute('git', ['status']);
 * }
 * ```
 */
export class CommandInjectionPrevention {
  private static instance: CommandInjectionPrevention;

  private readonly dangerousCommands: Set<string>;

  private readonly dangerousPatterns: RegExp[];

  private readonly allowedCommands: Set<string>;

  private readonly maxArgLength: number;

  private readonly maxTotalArgsLength: number;

  constructor() {
    // Commands that should never be executed
    this.dangerousCommands = new Set([
      'rm',
      'rmdir',
      'del',
      'format',
      'fdisk',
      'wget',
      'curl',
      'nc',
      'netcat',
      'telnet',
      'ssh',
      'scp',
      'ftp',
      'tftp',
      'python',
      'python3',
      'node',
      'ruby',
      'perl',
      'php',
      'sh',
      'bash',
      'zsh',
      'fish',
      'csh',
      'tcsh',
      'cmd',
      'powershell',
      'pwsh',
      'eval',
      'exec',
      'source',
      'sudo',
      'su',
      'chmod',
      'chown',
      'mount',
      'umount',
      'iptables',
      'ufw',
      'firewalld',
      'systemctl',
      'service',
      'launchctl',
      'reboot',
      'shutdown',
      'halt',
      'poweroff',
    ]);

    // Dangerous patterns that indicate injection attempts
    this.dangerousPatterns = [
      // Command chaining
      /[;&|`]/,
      // Process substitution
      /<\(|>\(/,
      // Command substitution
      /\$\(/,
      // Backticks
      /`/,
      // Redirection attempts
      /[<>]+/,
      // Null bytes
      /\u0000/,
      // Path traversal
      /\.\.[/\\]/,
      // Variable expansion
      /\$\{[^}]*\}/,
      // Globbing attempts
      /\*|\?|\[.*\]/,
      // Script execution
      /\.(sh|bat|cmd|ps1|py|rb|pl|php)(\s|$)/i,
      // Network operations
      /(wget|curl|nc|netcat)\s+/i,
      // Remote execution
      /(ssh|scp|ftp|telnet)\s+/i,
    ];

    // Safe commands that are allowed by default
    this.allowedCommands = new Set([
      'echo',
      'printf',
      'cat',
      'head',
      'tail',
      'ls',
      'dir',
      'pwd',
      'whoami',
      'id',
      'date',
      'uptime',
      'uname',
      'git',
      'npm',
      'yarn',
      'pnpm',
      'node',
      'tsc',
      'eslint',
      'prettier',
      'grep',
      'find',
      'sort',
      'uniq',
      'wc',
    ]);

    this.maxArgLength = 1000;
    this.maxTotalArgsLength = 10000;
  }

  /**
   * Gets the singleton instance of CommandInjectionPrevention
   *
   * @static
   * @returns {CommandInjectionPrevention} The singleton instance
   *
   * @example
   * ```typescript
   * const cip = CommandInjectionPrevention.getInstance();
   * ```
   */
  static getInstance(): CommandInjectionPrevention {
    if (!CommandInjectionPrevention.instance) {
      CommandInjectionPrevention.instance = new CommandInjectionPrevention();
    }
    return CommandInjectionPrevention.instance;
  }

  /**
   * Validates and sanitizes a command before execution
   *
   * @param {string} command - The command to validate
   * @param {string[]} [args=[]] - Command arguments to validate
   * @param {CommandExecutionOptions} [options={}] - Execution options with security controls
   * @returns {CommandValidationResult} Validation result with sanitized values
   *
   * @description Performs comprehensive security validation including:
   * - Command name sanitization and whitelisting
   * - Argument length and content validation
   * - Dangerous pattern detection (command chaining, injection attempts)
   * - Path traversal prevention
   * - Working directory restriction
   *
   * @example
   * ```typescript
   * const result = cip.validateCommand('ls', ['-la', '/etc/passwd']);
   * if (!result.safe) {
   *   console.error('Blocked:', result.blockedPatterns);
   * }
   * ```
   */
  validateCommand(
    command: string,
    args: string[] = [],
    options: CommandExecutionOptions = {}
  ): CommandValidationResult {
    const warnings: string[] = [];
    const blockedPatterns: string[] = [];
    let safe = true;

    // Sanitize command name
    const commandSanitized = inputSanitizer.sanitizeText(command, {
      allowHtml: false,
      maxLength: 100,
      stripControlChars: true,
      preventInjection: true,
      escapeSpecialChars: false,
      allowedCharacters: /[\w\-_.]/,
    });

    if (commandSanitized.modified) {
      warnings.push('Command was sanitized');
      if (commandSanitized.warnings.length > 0) {
        warnings.push(...commandSanitized.warnings);
      }
    }

    const sanitizedCommand = commandSanitized.sanitized;

    // Check if command was modified during sanitization (indicates injection attempt)
    if (command !== sanitizedCommand) {
      safe = false;
      blockedPatterns.push(
        `Command was modified during sanitization: "${command}" -> "${sanitizedCommand}"`
      );
    }

    // Check if command is in dangerous list
    if (this.dangerousCommands.has(sanitizedCommand.toLowerCase())) {
      safe = false;
      blockedPatterns.push(`Dangerous command: ${String(sanitizedCommand)}`);
    }

    // Check if command is allowed (if allowlist is specified)
    if (options.allowedCommands && !options.allowedCommands.includes(sanitizedCommand)) {
      safe = false;
      blockedPatterns.push(`Command not in allowlist: ${String(sanitizedCommand)}`);
    } else if (
      !options.allowedCommands &&
      !this.allowedCommands.has(sanitizedCommand.toLowerCase())
    ) {
      // Default allowlist check
      warnings.push(`Command not in default safe list: ${String(sanitizedCommand)}`);
    }

    // Sanitize arguments
    const sanitizedArgs: string[] = [];
    let totalArgsLength = 0;

    args.forEach((arg, index) => {
      // Check individual arg length
      if (arg.length > this.maxArgLength) {
        safe = false;
        blockedPatterns.push(
          `Argument ${String(index)} exceeds maximum length (${String(String(this.maxArgLength))})`
        );
        return;
      }

      totalArgsLength += arg.length;

      // Sanitize the argument
      const argSanitized = inputSanitizer.sanitizeText(arg, {
        allowHtml: false,
        maxLength: this.maxArgLength,
        stripControlChars: true,
        preventInjection: true,
        escapeSpecialChars: true,
      });

      if (argSanitized.modified) {
        warnings.push(`Argument ${String(index)} was sanitized`);
      }

      // Check for dangerous patterns in arguments
      this.dangerousPatterns.forEach(pattern => {
        if (pattern.test(arg)) {
          safe = false;
          blockedPatterns.push(
            `Dangerous pattern in argument ${String(index)}: ${String(String(pattern.source))}`
          );
        }
      });

      // Validate flags if specified
      if (options.allowedFlags && arg.startsWith('-')) {
        const flag = arg.replace(/^-+/, '');
        // Handle combined flags like -la (both -l and -a must be allowed)
        const isValidFlag =
          flag.split('').every(char => options.allowedFlags!.includes(char)) ||
          options.allowedFlags.includes(flag);

        if (!isValidFlag) {
          safe = false;
          blockedPatterns.push(`Flag not allowed: ${String(arg)}`);
        }
      }

      // Path traversal protection
      if (arg.includes('../') || arg.includes('..\\')) {
        safe = false;
        blockedPatterns.push(`Path traversal attempt in argument ${String(index)}`);
      }

      // Working directory restriction
      if (options.restrictToWorkingDir && path.isAbsolute(arg)) {
        const resolved = path.resolve(arg);
        const cwd = process.cwd();
        if (!resolved.startsWith(cwd)) {
          safe = false;
          blockedPatterns.push(`Argument ${String(index)} points outside working directory`);
        }
      }

      sanitizedArgs.push(argSanitized.sanitized);
    });

    // Check total arguments length
    if (totalArgsLength > this.maxTotalArgsLength) {
      safe = false;
      blockedPatterns.push(
        `Total arguments length exceeds maximum (${String(String(this.maxTotalArgsLength))})`
      );
    }

    // Additional security checks for the complete command
    const fullCommand = `${sanitizedCommand} ${sanitizedArgs.join(' ')}`;
    const suspiciousCheck = InputSanitizer.detectSuspiciousPatterns(fullCommand) as {
      suspicious: boolean;
      patterns: string[];
    };
    if (suspiciousCheck.suspicious) {
      warnings.push(`Suspicious patterns detected: ${suspiciousCheck.patterns.join(', ')}`);
      // Mark as unsafe if critical patterns are detected
      const criticalPatterns = ['Script tag', 'JavaScript protocol', 'Remote script execution'];
      if (suspiciousCheck.patterns.some((p: string) => criticalPatterns.includes(p))) {
        safe = false;
        blockedPatterns.push(...suspiciousCheck.patterns);
      }
    }

    return {
      safe,
      sanitizedCommand,
      sanitizedArgs,
      warnings,
      blockedPatterns,
    };
  }

  /**
   * Safely executes a command with comprehensive protection
   *
   * @param {string} command - The command to execute
   * @param {string[]} [args=[]] - Command arguments
   * @param {CommandExecutionOptions} [options={}] - Execution options
   * @returns {Promise<ExecutionResult>} Execution result with output and status
   *
   * @throws {Error} If command validation fails or is deemed unsafe
   *
   * @description Validates the command and arguments, then executes in a
   * controlled environment with timeout, environment isolation, and output capture.
   *
   * @example
   * ```typescript
   * try {
   *   const result = await cip.safeExecute('git', ['log', '--oneline', '-5']);
   *   console.log(result.stdout);
   * } catch (error) {
   *   console.error('Command blocked:', error.message);
   * }
   * ```
   */
  async safeExecute(
    command: string,
    args: string[] = [],
    options: CommandExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    // Validate the command first
    const validation = this.validateCommand(command, args, options);

    if (!validation.safe) {
      throw new Error(
        `Command execution blocked: ${String(String(validation.blockedPatterns.join(', ')))}`
      );
    }

    // Log execution if requested
    if (options.logExecution) {
      logger.info('Command execution started', {
        command: validation.sanitizedCommand,
        args: validation.sanitizedArgs,
      });
      if (validation.warnings.length > 0) {
        logger.warn('Command execution warnings', {
          warnings: validation.warnings,
        });
      }
    }

    return new Promise<ExecutionResult>((resolve, _reject) => {
      const child = spawn(validation.sanitizedCommand, validation.sanitizedArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...options.env },
        timeout: options.timeout ?? 30000,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', code => {
        const duration = Date.now() - startTime;
        resolve({
          success: code === 0,
          stdout,
          stderr,
          exitCode: code ?? 0,
          duration,
          command: validation.sanitizedCommand,
          args: validation.sanitizedArgs,
        });
      });

      child.on('error', error => {
        const duration = Date.now() - startTime;
        resolve({
          success: false,
          stdout: '',
          stderr: error.message,
          exitCode: -1,
          duration,
          command: validation.sanitizedCommand,
          args: validation.sanitizedArgs,
        });
      });
    });
  }

  /**
   * Creates a safe command wrapper with predefined subcommands
   *
   * @param {string} baseCommand - The base command to wrap
   * @param {string[]} [allowedSubcommands=[]] - Allowed subcommands for this command
   * @returns {Object} Command wrapper with validate and execute methods
   *
   * @description Creates a reusable command wrapper that enforces consistent
   * security policies for a specific command.
   *
   * @example
   * ```typescript
   * const gitCommand = cip.createSafeCommand('git', ['status', 'log', 'diff']);
   *
   * // Validate arguments
   * const validatedArgs = gitCommand.validate(['status', '-s']);
   *
   * // Execute safely
   * const result = await gitCommand.execute(['status']);
   * ```
   */
  createSafeCommand(
    baseCommand: string,
    allowedSubcommands: string[] = []
  ): {
    validate: (args: string[], options?: CommandExecutionOptions) => string;
    execute: (args: string[], options?: CommandExecutionOptions) => Promise<ExecutionResult>;
  } {
    return {
      validate: (args: string[], options: CommandExecutionOptions = {}): string => {
        // Additional validation for allowed subcommands
        if (allowedSubcommands.length > 0 && args.length > 0) {
          const firstArg = args[0];
          if (!firstArg.startsWith('-') && !allowedSubcommands.includes(firstArg)) {
            throw new Error(`Invalid argument: Subcommand '${firstArg}' not allowed`);
          }
        }

        const validation = this.validateCommand(baseCommand, args, {
          ...options,
          allowedFlags: options.allowedFlags,
        });

        if (!validation.safe) {
          throw new Error(`Invalid argument: ${validation.blockedPatterns.join(', ')}`);
        }
        return validation.sanitizedArgs.join(' ');
      },

      execute: async (
        args: string[],
        options: CommandExecutionOptions = {}
      ): Promise<ExecutionResult> =>
        this.safeExecute(baseCommand, args, {
          ...options,
          allowedFlags: options.allowedFlags,
          logExecution: true,
        }),
    };
  }

  /**
   * Adds a custom command to the allowed list
   *
   * @param {string} command - Command name to allow
   *
   * @example
   * ```typescript
   * cip.addAllowedCommand('docker');
   * ```
   */
  addAllowedCommand(command: string): void {
    this.allowedCommands.add(command.toLowerCase());
  }

  /**
   * Removes a command from the allowed list
   *
   * @param {string} command - Command name to remove
   *
   * @example
   * ```typescript
   * cip.removeAllowedCommand('rm');
   * ```
   */
  removeAllowedCommand(command: string): void {
    this.allowedCommands.delete(command.toLowerCase());
  }

  /**
   * Checks if a command is in the dangerous list
   *
   * @param {string} command - Command name to check
   * @returns {boolean} True if the command is considered dangerous
   *
   * @example
   * ```typescript
   * if (cip.isDangerousCommand('rm')) {
   *   console.error('This command is dangerous!');
   * }
   * ```
   */
  isDangerousCommand(command: string): boolean {
    return this.dangerousCommands.has(command.toLowerCase());
  }

  /**
   * Gets the list of allowed commands
   *
   * @returns {string[]} Array of allowed command names
   *
   * @example
   * ```typescript
   * const allowed = cip.getAllowedCommands();
   * console.log('Allowed commands:', allowed);
   * ```
   */
  getAllowedCommands(): string[] {
    return Array.from(this.allowedCommands);
  }

  /**
   * Gets the list of dangerous commands
   *
   * @returns {string[]} Array of dangerous command names
   *
   * @example
   * ```typescript
   * const dangerous = cip.getDangerousCommands();
   * console.log('Dangerous commands:', dangerous);
   * ```
   */
  getDangerousCommands(): string[] {
    return Array.from(this.dangerousCommands);
  }

  /**
   * Validates a file path for safe access
   *
   * @param {string} filePath - The file path to validate
   * @param {string[]} [allowedDirectories=[]] - List of allowed base directories
   * @returns {Object} Validation result
   * @returns {boolean} result.safe - Whether the path is safe
   * @returns {string} result.normalizedPath - Normalized version of the path
   * @returns {string[]} result.warnings - Any security warnings
   *
   * @description Validates file paths to prevent directory traversal attacks
   * and restrict access to allowed directories.
   *
   * @example
   * ```typescript
   * const result = cip.validateFilePath('../../../etc/passwd', ['/home/user']);
   * if (!result.safe) {
   *   console.error('Unsafe path:', result.warnings);
   * }
   * ```
   */
  static validateFilePath(
    filePath: string,
    allowedDirectories: string[] = []
  ): {
    safe: boolean;
    normalizedPath: string;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let safe = true;

    // Initial safety check for null bytes and control characters
    if (/[\x00-\x1f\x7f-\x9f]/.test(filePath)) {
      safe = false;
      warnings.push('Control characters detected in path');
    }

    // Decode various encodings that could hide path traversal
    let decodedPath = filePath;

    // URL decode multiple times to catch double encoding
    for (let i = 0; i < 3; i++) {
      try {
        const decoded = decodeURIComponent(decodedPath);
        if (decoded === decodedPath) break;
        decodedPath = decoded;
        warnings.push('URL encoded path detected');
      } catch {
        break;
      }
    }

    // Decode hex sequences
    if (decodedPath.includes('\\x')) {
      decodedPath = decodedPath.replace(/\\x([0-9A-Fa-f]{2})/g, (match, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      );
      warnings.push('Hex encoded path detected');
    }

    // Decode unicode sequences
    if (decodedPath.includes('\\u')) {
      decodedPath = decodedPath.replace(/\\u([0-9A-Fa-f]{4})/g, (match, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      );
      warnings.push('Unicode encoded path detected');
    }

    // Sanitize the file path
    const sanitized = inputSanitizer.sanitizeFilePath(decodedPath);
    if (sanitized.modified) {
      warnings.push('File path was sanitized');
    }

    const normalizedPath = path.normalize(sanitized.sanitized);

    // Comprehensive path traversal detection
    const traversalPatterns = [
      /\.\.[\/\\]/, // Basic ../
      /\.\.\\/g, // ..\ pattern
      /\.\.\//g, // ../ pattern
      /\.\.$/, // Ends with ..
      /\/\.\./, // Contains /..
      /\\\.\./, // Contains \..
      /\.\.[^\/\\]*[\/\\]/, // .. followed by chars then separator
      /[\/\\]\.\.[\/\\]/, // Separator .. separator
      /\.[\.]+[\/\\]/, // Multiple dots with separator
      /\.(\.)+/, // Multiple consecutive dots
    ];

    const pathsToCheck = [filePath, decodedPath, sanitized.sanitized, normalizedPath];

    for (const pathToCheck of pathsToCheck) {
      if (traversalPatterns.some(pattern => pattern.test(pathToCheck))) {
        safe = false;
        warnings.push('Path traversal detected');
        break;
      }
    }

    // Check for absolute paths trying to access system directories
    const systemPaths = [
      /^\/etc\//i,
      /^\/root\//i,
      /^\/var\/log\//i,
      /^\/proc\//i,
      /^\/sys\//i,
      /^\/dev\//i,
      /^\/tmp\//i,
      /^\/usr\/bin\//i,
      /^\/bin\//i,
      /^\/sbin\//i,
      /^[A-Z]:\\windows\\/i,
      /^[A-Z]:\\users\\/i,
      /^[A-Z]:\\program\s*files/i,
      /^[A-Z]:\\system32/i,
      /^\\\\/, // UNC paths
    ];

    if (systemPaths.some(pattern => pattern.test(normalizedPath))) {
      safe = false;
      warnings.push('Attempt to access system directory');
    }

    // Check for hidden/sensitive files
    const sensitivePatterns = [
      /\/\.[a-z]/i, // Hidden files starting with .
      /\.ssh/i, // SSH files
      /\.bash_history/i, // Bash history
      /\.env/i, // Environment files
      /config[\/\\]secret/i, // Secret config files
      /database[\/\\]config/i, // Database config
      /backup/i, // Backup files
      /\.htaccess/i, // Apache config
      /web\.config/i, // IIS config
      /\.git/i, // Git directory
    ];

    if (sensitivePatterns.some(pattern => pattern.test(normalizedPath))) {
      safe = false;
      warnings.push('Attempt to access sensitive file/directory');
    }

    // Check if path is within allowed directories
    if (allowedDirectories.length > 0) {
      try {
        const resolved = path.resolve(normalizedPath);
        const isInAllowedDir = allowedDirectories.some(dir => {
          const allowedDir = path.resolve(dir);
          return resolved.startsWith(allowedDir + path.sep) || resolved === allowedDir;
        });

        if (!isInAllowedDir) {
          safe = false;
          warnings.push('Path outside allowed directories');
        }
      } catch (error) {
        safe = false;
        warnings.push('Invalid path format');
      }
    }

    // Check for dangerous file extensions
    const dangerousExtensions = [
      '.sh',
      '.bat',
      '.cmd',
      '.ps1',
      '.py',
      '.rb',
      '.pl',
      '.php',
      '.jsp',
      '.asp',
      '.aspx',
      '.exe',
      '.com',
      '.scr',
      '.pif',
      '.vbs',
      '.js',
      '.jar',
      '.war',
      '.ear',
      '.deb',
      '.rpm',
    ];
    const ext = path.extname(normalizedPath).toLowerCase();
    if (dangerousExtensions.includes(ext)) {
      warnings.push(`Potentially dangerous file extension: ${String(ext)}`);
    }

    // Additional security check for very long paths (potential buffer overflow)
    if (normalizedPath.length > 1024) {
      safe = false;
      warnings.push('Path exceeds maximum length');
    }

    // Check for repeated separators or suspicious patterns
    if (/[\/\\]{3,}/.test(normalizedPath) || /\.{4,}/.test(normalizedPath)) {
      safe = false;
      warnings.push('Suspicious path pattern detected');
    }

    return {
      safe,
      normalizedPath,
      warnings,
    };
  }
}

/**
 * Singleton instance of CommandInjectionPrevention
 * @constant {CommandInjectionPrevention}
 */
export const commandInjectionPrevention = CommandInjectionPrevention.getInstance();

/**
 * Convenience function for safe command execution
 *
 * @function safeExecute
 * @param {string} command - Command to execute
 * @param {string[]} [args=[]] - Command arguments
 * @param {CommandExecutionOptions} [options={}] - Execution options
 * @returns {Promise<ExecutionResult>} Execution result
 *
 * @example
 * ```typescript
 * const result = await safeExecute('ls', ['-la']);
 * ```
 */
export const safeExecute = async (
  command: string,
  args: string[] = [],
  options: CommandExecutionOptions = {}
): Promise<ExecutionResult> => commandInjectionPrevention.safeExecute(command, args, options);

/**
 * Convenience function for command validation
 *
 * @function validateCommand
 * @param {string} command - Command to validate
 * @param {string[]} [args=[]] - Command arguments
 * @param {CommandExecutionOptions} [options={}] - Validation options
 * @returns {CommandValidationResult} Validation result
 *
 * @example
 * ```typescript
 * const validation = validateCommand('rm', ['-rf', '/']);
 * ```
 */
export const validateCommand = (
  command: string,
  args: string[] = [],
  options: CommandExecutionOptions = {}
): CommandValidationResult => commandInjectionPrevention.validateCommand(command, args, options);

/**
 * Convenience function for creating safe command wrappers
 *
 * @function createSafeCommand
 * @param {string} baseCommand - Base command name
 * @param {string[]} [allowedSubcommands=[]] - Allowed subcommands
 * @returns {Object} Command wrapper
 *
 * @example
 * ```typescript
 * const git = createSafeCommand('git', ['status', 'log']);
 * ```
 */
export const createSafeCommand = (
  baseCommand: string,
  allowedSubcommands: string[] = []
): {
  validate: (args: string[], options?: CommandExecutionOptions) => string;
  execute: (args: string[], options?: CommandExecutionOptions) => Promise<ExecutionResult>;
} => commandInjectionPrevention.createSafeCommand(baseCommand, allowedSubcommands);

/**
 * Convenience function for file path validation
 *
 * @function validateFilePath
 * @param {string} filePath - Path to validate
 * @param {string[]} [allowedDirectories=[]] - Allowed directories
 * @returns {Object} Validation result
 *
 * @example
 * ```typescript
 * const validation = validateFilePath('/etc/passwd');
 * ```
 */
export const validateFilePath = (
  filePath: string,
  allowedDirectories: string[] = []
): { safe: boolean; normalizedPath: string; warnings: string[] } =>
  CommandInjectionPrevention.validateFilePath(filePath, allowedDirectories);

// Re-export SafeCliOperations from separate file
export { SafeCliOperations } from './safe-cli-operations';
