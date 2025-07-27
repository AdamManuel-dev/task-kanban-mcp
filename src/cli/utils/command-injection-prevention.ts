/**
 * Command Injection Prevention Module
 * Addresses TASK-120: Add command injection prevention
 *
 * This module provides comprehensive protection against command injection attacks
 * in CLI applications by sanitizing inputs and preventing execution of malicious commands.
 */

import type { SpawnOptions } from 'child_process';
import { spawn } from 'child_process';
import path from 'path';
import { inputSanitizer } from './input-sanitizer';

export interface CommandExecutionOptions {
  allowedCommands?: string[];
  allowedFlags?: string[];
  restrictToWorkingDir?: boolean;
  timeout?: number;
  env?: Record<string, string>;
  validateArgs?: boolean;
  logExecution?: boolean;
}

export interface CommandValidationResult {
  safe: boolean;
  sanitizedCommand: string;
  sanitizedArgs: string[];
  warnings: string[];
  blockedPatterns: string[];
}

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
      /<\(|\>\(/,
      // Command substitution
      /\$\(/,
      // Backticks
      /`/,
      // Redirection attempts
      /[<>]+/,
      // Null bytes
      /\x00/,
      // Path traversal
      /\.\.[\/\\]/,
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

  static getInstance(): CommandInjectionPrevention {
    if (!CommandInjectionPrevention.instance) {
      CommandInjectionPrevention.instance = new CommandInjectionPrevention();
    }
    return CommandInjectionPrevention.instance;
  }

  /**
   * Validate and sanitize a command before execution
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

    // Check if command is in dangerous list
    if (this.dangerousCommands.has(sanitizedCommand.toLowerCase())) {
      safe = false;
      blockedPatterns.push(`Dangerous command: ${sanitizedCommand}`);
    }

    // Check if command is allowed (if allowlist is specified)
    if (options.allowedCommands && !options.allowedCommands.includes(sanitizedCommand)) {
      safe = false;
      blockedPatterns.push(`Command not in allowlist: ${sanitizedCommand}`);
    } else if (
      !options.allowedCommands &&
      !this.allowedCommands.has(sanitizedCommand.toLowerCase())
    ) {
      // Default allowlist check
      warnings.push(`Command not in default safe list: ${sanitizedCommand}`);
    }

    // Sanitize arguments
    const sanitizedArgs: string[] = [];
    let totalArgsLength = 0;

    args.forEach((arg, index) => {
      // Check individual arg length
      if (arg.length > this.maxArgLength) {
        safe = false;
        blockedPatterns.push(`Argument ${index} exceeds maximum length (${this.maxArgLength})`);
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
        warnings.push(`Argument ${index} was sanitized`);
      }

      // Check for dangerous patterns in arguments
      this.dangerousPatterns.forEach(pattern => {
        if (pattern.test(arg)) {
          safe = false;
          blockedPatterns.push(`Dangerous pattern in argument ${index}: ${pattern.source}`);
        }
      });

      // Validate flags if specified
      if (options.allowedFlags && arg.startsWith('-')) {
        const flag = arg.replace(/^-+/, '');
        if (!options.allowedFlags.includes(flag)) {
          safe = false;
          blockedPatterns.push(`Flag not allowed: ${arg}`);
        }
      }

      // Path traversal protection
      if (arg.includes('../') || arg.includes('..\\')) {
        safe = false;
        blockedPatterns.push(`Path traversal attempt in argument ${index}`);
      }

      // Working directory restriction
      if (options.restrictToWorkingDir && path.isAbsolute(arg)) {
        const resolved = path.resolve(arg);
        const cwd = process.cwd();
        if (!resolved.startsWith(cwd)) {
          safe = false;
          blockedPatterns.push(`Argument ${index} points outside working directory`);
        }
      }

      sanitizedArgs.push(argSanitized.sanitized);
    });

    // Check total arguments length
    if (totalArgsLength > this.maxTotalArgsLength) {
      safe = false;
      blockedPatterns.push(`Total arguments length exceeds maximum (${this.maxTotalArgsLength})`);
    }

    // Additional security checks for the complete command
    const fullCommand = `${sanitizedCommand} ${sanitizedArgs.join(' ')}`;
    const suspiciousCheck = inputSanitizer.detectSuspiciousPatterns(fullCommand);
    if (suspiciousCheck.suspicious) {
      warnings.push(`Suspicious patterns detected: ${suspiciousCheck.patterns.join(', ')}`);
      // Mark as unsafe if critical patterns are detected
      const criticalPatterns = ['Script tag', 'JavaScript protocol', 'Remote script execution'];
      if (suspiciousCheck.patterns.some(p => criticalPatterns.includes(p))) {
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
   * Safely execute a command with comprehensive protection
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
      throw new Error(`Command execution blocked: ${validation.blockedPatterns.join(', ')}`);
    }

    // Log execution if requested
    if (options.logExecution) {
      console.log(
        `[CommandInjectionPrevention] Executing: ${validation.sanitizedCommand} ${validation.sanitizedArgs.join(' ')}`
      );
      if (validation.warnings.length > 0) {
        console.warn(`[CommandInjectionPrevention] Warnings: ${validation.warnings.join(', ')}`);
      }
    }

    return new Promise((resolve, reject) => {
      const spawnOptions: SpawnOptions = {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: options.timeout || 30000,
        env: {
          ...process.env,
          ...options.env,
          // Remove potentially dangerous environment variables
          LD_PRELOAD: undefined,
          LD_LIBRARY_PATH: undefined,
          PATH: process.env['PATH'], // Keep PATH but don't allow overriding
        },
        shell: false, // Never use shell to prevent injection
      };

      const child = spawn(validation.sanitizedCommand, validation.sanitizedArgs, spawnOptions);

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', data => {
        stdout += data.toString();
      });

      child.stderr?.on('data', data => {
        stderr += data.toString();
      });

      child.on('close', code => {
        const duration = Date.now() - startTime;
        resolve({
          success: code === 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code || 0,
          duration,
          command: validation.sanitizedCommand,
          args: validation.sanitizedArgs,
        });
      });

      child.on('error', error => {
        reject(new Error(`Command execution failed: ${error.message}`));
      });

      // Set up timeout handling
      if (options.timeout) {
        setTimeout(() => {
          child.kill('SIGTERM');
          setTimeout(() => {
            child.kill('SIGKILL');
          }, 5000);
        }, options.timeout);
      }
    });
  }

  /**
   * Escape shell arguments safely
   */
  escapeShellArg(arg: string): string {
    // Replace all potentially dangerous characters
    return arg
      .replace(/'/g, "'\"'\"'") // Escape single quotes
      .replace(/\\/g, '\\\\') // Escape backslashes
      .replace(/\$/g, '\\$') // Escape dollar signs
      .replace(/`/g, '\\`') // Escape backticks
      .replace(/!/g, '\\!') // Escape exclamation marks
      .replace(/"/g, '\\"'); // Escape double quotes
  }

  /**
   * Create a safe command builder
   */
  createSafeCommand(baseCommand: string, allowedFlags: string[] = []) {
    return {
      addArg: (arg: string) => {
        const validation = this.validateCommand(baseCommand, [arg], { allowedFlags });
        if (!validation.safe) {
          throw new Error(`Invalid argument: ${validation.blockedPatterns.join(', ')}`);
        }
        return validation.sanitizedArgs[0];
      },

      execute: (args: string[], options: CommandExecutionOptions = {}) =>
        this.safeExecute(baseCommand, args, {
          ...options,
          allowedFlags,
          logExecution: true,
        }),
    };
  }

  /**
   * Add custom command to allowed list
   */
  addAllowedCommand(command: string): void {
    this.allowedCommands.add(command.toLowerCase());
  }

  /**
   * Remove command from allowed list
   */
  removeAllowedCommand(command: string): void {
    this.allowedCommands.delete(command.toLowerCase());
  }

  /**
   * Check if a command is in the dangerous list
   */
  isDangerousCommand(command: string): boolean {
    return this.dangerousCommands.has(command.toLowerCase());
  }

  /**
   * Get list of allowed commands
   */
  getAllowedCommands(): string[] {
    return Array.from(this.allowedCommands);
  }

  /**
   * Get list of dangerous commands
   */
  getDangerousCommands(): string[] {
    return Array.from(this.dangerousCommands);
  }

  /**
   * Validate a file path for safe access
   */
  validateFilePath(
    filePath: string,
    allowedDirectories: string[] = []
  ): {
    safe: boolean;
    normalizedPath: string;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let safe = true;

    // Sanitize the file path
    const sanitized = inputSanitizer.sanitizeFilePath(filePath);
    if (sanitized.modified) {
      warnings.push('File path was sanitized');
    }

    const normalizedPath = path.normalize(sanitized.sanitized);

    // Check for path traversal
    if (normalizedPath.includes('../') || normalizedPath.includes('..\\')) {
      safe = false;
      warnings.push('Path traversal detected');
    }

    // Check if path is within allowed directories
    if (allowedDirectories.length > 0) {
      const resolved = path.resolve(normalizedPath);
      const isInAllowedDir = allowedDirectories.some(dir => {
        const allowedDir = path.resolve(dir);
        return resolved.startsWith(allowedDir);
      });

      if (!isInAllowedDir) {
        safe = false;
        warnings.push('Path outside allowed directories');
      }
    }

    // Check for dangerous file extensions
    const dangerousExtensions = ['.sh', '.bat', '.cmd', '.ps1', '.py', '.rb', '.pl', '.php'];
    const ext = path.extname(normalizedPath).toLowerCase();
    if (dangerousExtensions.includes(ext)) {
      warnings.push(`Potentially dangerous file extension: ${ext}`);
    }

    return {
      safe,
      normalizedPath,
      warnings,
    };
  }
}

// Export singleton instance and utility functions
export const commandInjectionPrevention = CommandInjectionPrevention.getInstance();

// Convenience functions
export const safeExecute = (
  command: string,
  args: string[] = [],
  options: CommandExecutionOptions = {}
) => commandInjectionPrevention.safeExecute(command, args, options);

export const validateCommand = (
  command: string,
  args: string[] = [],
  options: CommandExecutionOptions = {}
) => commandInjectionPrevention.validateCommand(command, args, options);

export const createSafeCommand = (baseCommand: string, allowedFlags: string[] = []) =>
  commandInjectionPrevention.createSafeCommand(baseCommand, allowedFlags);

export const validateFilePath = (filePath: string, allowedDirectories: string[] = []) =>
  commandInjectionPrevention.validateFilePath(filePath, allowedDirectories);

/**
 * Safe wrapper for common CLI operations
 */
export class SafeCliOperations {
  /**
   * Safe file reading
   */
  static async safeFileRead(filePath: string, allowedDirectories: string[] = []): Promise<string> {
    const pathValidation = validateFilePath(filePath, allowedDirectories);
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
   * Safe directory listing
   */
  static async safeDirectoryList(
    dirPath: string = '.',
    allowedDirectories: string[] = []
  ): Promise<string[]> {
    const pathValidation = validateFilePath(dirPath, allowedDirectories);
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
   * Safe Git operations
   */
  static async safeGitCommand(args: string[]): Promise<ExecutionResult> {
    const allowedGitArgs = [
      'status',
      'log',
      'diff',
      'branch',
      'remote',
      'config',
      'add',
      'commit',
      'push',
      'pull',
      'fetch',
      'checkout',
      'merge',
      'rebase',
      'stash',
      'tag',
      'show',
      'blame',
    ];

    return safeExecute('git', args, {
      allowedFlags: allowedGitArgs,
      timeout: 30000,
      restrictToWorkingDir: true,
      logExecution: true,
    });
  }

  /**
   * Safe NPM operations
   */
  static async safeNpmCommand(args: string[]): Promise<ExecutionResult> {
    const allowedNpmArgs = [
      'install',
      'update',
      'list',
      'outdated',
      'audit',
      'run',
      'start',
      'test',
      'build',
      'version',
      'info',
      'search',
      'view',
      'help',
    ];

    return safeExecute('npm', args, {
      allowedFlags: allowedNpmArgs,
      timeout: 120000, // NPM operations can take longer
      restrictToWorkingDir: true,
      logExecution: true,
    });
  }
}
