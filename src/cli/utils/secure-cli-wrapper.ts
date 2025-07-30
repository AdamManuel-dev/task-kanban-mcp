/**
 * Secure CLI Wrapper
 * Integrates command injection prevention and input sanitization for the entire CLI
 * Addresses TASK-120: Command injection prevention
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { commandInjectionPrevention, validateCommand } from './command-injection-prevention';
import { inputSanitizer, InputSanitizer } from './input-sanitizer';
import { logger } from '../../utils/logger';

/**
 * Configuration options for CLI security features
 *
 * @interface SecurityConfig
 * @property {boolean} enableInputSanitization - Enable automatic input sanitization
 * @property {boolean} enableCommandValidation - Enable command validation checks
 * @property {boolean} logSecurityEvents - Log security events for monitoring
 * @property {boolean} strictMode - Fail on security warnings instead of just logging
 * @property {number} maxArgumentLength - Maximum allowed length for CLI arguments
 * @property {string[]} allowedCommands - Whitelist of allowed commands
 * @property {RegExp[]} blockedPatterns - Patterns that trigger security blocks
 */
export interface SecurityConfig {
  enableInputSanitization: boolean;
  enableCommandValidation: boolean;
  logSecurityEvents: boolean;
  strictMode: boolean;
  maxArgumentLength: number;
  allowedCommands: string[];
  blockedPatterns: RegExp[];
}

/**
 * Security event for audit logging
 *
 * @interface SecurityEvent
 * @property {Date} timestamp - When the event occurred
 * @property {'input_sanitized' | 'command_blocked' | 'suspicious_pattern' | 'validation_failed'} type - Event type
 * @property {string} details - Detailed description of the event
 * @property {string} input - The input that triggered the event
 * @property {'low' | 'medium' | 'high' | 'critical'} risk - Risk level assessment
 */
export interface SecurityEvent {
  timestamp: Date;
  type: 'input_sanitized' | 'command_blocked' | 'suspicious_pattern' | 'validation_failed';
  details: string;
  input: string;
  risk: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Secure CLI wrapper with comprehensive protection
 *
 * @class SecureCliWrapper
 * @description Provides a security layer for CLI applications by integrating
 * command injection prevention, input sanitization, and security event monitoring.
 * Wraps Commander.js commands with automatic security validation.
 *
 * @example
 * ```typescript
 * const wrapper = SecureCliWrapper.getInstance();
 * const command = wrapper.createSecureCommand('process', 'Process data safely');
 *
 * // Add security middleware to entire program
 * addSecurityMiddleware(program);
 * ```
 */
export class SecureCliWrapper {
  private static instance: SecureCliWrapper | undefined;

  private securityEvents: SecurityEvent[] = [];

  private config: SecurityConfig;

  constructor(config: Partial<SecurityConfig> = {}) {
    this.config = {
      enableInputSanitization: true,
      enableCommandValidation: true,
      logSecurityEvents: true,
      strictMode: false,
      maxArgumentLength: 1000,
      allowedCommands: [],
      blockedPatterns: [
        /rm\s+-rf/i,
        /curl.*\|.*sh/i,
        /wget.*\|.*sh/i,
        /eval\s*\(/i,
        /exec\s*\(/i,
        /system\s*\(/i,
        /passthru\s*\(/i,
        /shell_exec\s*\(/i,
        /`[^`]*`/,
        /\$\([^)]*\)/,
        /<\([^)]*\)/,
      ],
      ...config,
    };

    // Configure command injection prevention with CLI-specific settings
    if (this.config.allowedCommands.length > 0) {
      this.config.allowedCommands.forEach(cmd => {
        commandInjectionPrevention.addAllowedCommand(cmd);
      });
    }
  }

  /**
   * Gets the singleton instance of SecureCliWrapper
   *
   * @static
   * @param {Partial<SecurityConfig>} [config] - Security configuration
   * @returns {SecureCliWrapper} The singleton instance
   *
   * @example
   * ```typescript
   * const wrapper = SecureCliWrapper.getInstance({
   *   strictMode: true,
   *   maxArgumentLength: 500
   * });
   * ```
   */
  static getInstance(config?: Partial<SecurityConfig>): SecureCliWrapper {
    if (!SecureCliWrapper.instance) {
      SecureCliWrapper.instance = new SecureCliWrapper(config);
    }
    return SecureCliWrapper.instance;
  }

  /**
   * Sanitizes and validates CLI arguments
   *
   * @param {string[]} args - Raw CLI arguments
   * @returns {Object} Sanitization result
   * @returns {string[]} result.sanitized - Sanitized arguments
   * @returns {string[]} result.warnings - Security warnings generated
   *
   * @description Performs comprehensive security checks including:
   * - Length validation
   * - Blocked pattern detection
   * - Input sanitization
   * - Suspicious pattern detection
   *
   * @example
   * ```typescript
   * const result = wrapper.sanitizeArguments(['--file', '../../../etc/passwd']);
   * if (result.warnings.length > 0) {
   *   console.warn('Security warnings:', result.warnings);
   * }
   * ```
   */
  sanitizeArguments(args: string[]): { sanitized: string[]; warnings: string[] } {
    const sanitized: string[] = [];
    const warnings: string[] = [];

    args.forEach((arg, index) => {
      let processedArg = arg;

      // Check length
      if (processedArg.length > this.config.maxArgumentLength) {
        this.logSecurityEvent({
          type: 'validation_failed',
          details: `Argument ${String(index)} exceeds maximum length`,
          input: `${String(String(processedArg.substring(0, 100)))}...`,
          risk: 'medium',
        });
        if (this.config.strictMode) {
          throw new Error(
            `Argument ${String(index)} exceeds maximum length (${String(String(this.config.maxArgumentLength))})`
          );
        }
        warnings.push(`Argument ${String(index)} truncated`);
        processedArg = processedArg.substring(0, this.config.maxArgumentLength);
      }

      // Check for blocked patterns
      const blockedPattern = this.config.blockedPatterns.find(pattern =>
        pattern.test(processedArg)
      );
      if (blockedPattern) {
        this.logSecurityEvent({
          type: 'command_blocked',
          details: `Blocked pattern detected: ${String(String(blockedPattern.source))}`,
          input: processedArg,
          risk: 'high',
        });
        if (this.config.strictMode) {
          throw new Error(
            `Blocked pattern detected in argument ${String(index)}: ${String(String(blockedPattern.source))}`
          );
        }
        warnings.push(`Blocked pattern removed from argument ${String(index)}`);
        processedArg = processedArg.replace(blockedPattern, '');
      }

      // Sanitize input if enabled
      if (this.config.enableInputSanitization) {
        const sanitizationResult = inputSanitizer.sanitizeCliArgument(processedArg);
        if (sanitizationResult.modified) {
          this.logSecurityEvent({
            type: 'input_sanitized',
            details: `Argument ${String(index)} sanitized: ${String(String(sanitizationResult.warnings.join(', ')))}`,
            input: processedArg,
            risk: 'low',
          });
          warnings.push(`Argument ${String(index)} sanitized`);
        }
        sanitized.push(sanitizationResult.sanitized);
      } else {
        sanitized.push(processedArg);
      }
    });

    return { sanitized, warnings };
  }

  /**
   * Creates a secure command wrapper with built-in protection
   *
   * @param {string} name - Command name
   * @param {string} description - Command description
   * @returns {Command} Secured Commander.js command
   *
   * @description Creates a new command with automatic security validation
   * that runs before the command action is executed.
   *
   * @example
   * ```typescript
   * const processCmd = wrapper.createSecureCommand('process', 'Process files safely');
   * processCmd
   *   .argument('<file>', 'File to process')
   *   .action(async (file) => {
   *     // Command logic here - file is already validated
   *   });
   * ```
   */
  createSecureCommand(name: string, description: string): Command {
    const command = new Command(name);
    command.description(description);

    // Override the action method to add security checks
    const originalAction = command.action.bind(command);
    command.action = (fn: (...args: unknown[]) => void | Promise<void>) =>
      originalAction(async (...args: unknown[]) => {
        try {
          // Extract options and command arguments
          const options = args[args.length - 1];
          const commandArgs = args.slice(0, -1);

          // Validate command arguments
          if (this.config.enableCommandValidation && commandArgs.length > 0) {
            const stringArgs = commandArgs.map(arg => String(arg));
            const validation = validateCommand(name, stringArgs);

            if (!validation.safe) {
              this.logSecurityEvent({
                type: 'command_blocked',
                details: `Command validation failed: ${String(String(validation.blockedPatterns.join(', ')))}`,
                input: `${String(name)} ${String(String(stringArgs.join(' ')))}`,
                risk: 'critical',
              });
              throw new Error(
                `Command blocked: ${String(String(validation.blockedPatterns.join(', ')))}`
              );
            }

            if (validation.warnings.length > 0) {
              this.logSecurityEvent({
                type: 'suspicious_pattern',
                details: `Command warnings: ${String(String(validation.warnings.join(', ')))}`,
                input: `${String(name)} ${String(String(stringArgs.join(' ')))}`,
                risk: 'medium',
              });
              if (this.config.logSecurityEvents) {
                logger.warn(
                  chalk.yellow(
                    `⚠️  Security warnings: ${String(String(validation.warnings.join(', ')))}`
                  )
                );
              }
            }
          }

          // Check for suspicious patterns in options
          if (options && typeof options === 'object') {
            for (const [key, value] of Object.entries(options)) {
              if (typeof value === 'string') {
                const suspicious = InputSanitizer.detectSuspiciousPatterns(value);
                if (suspicious.suspicious) {
                  this.logSecurityEvent({
                    type: 'suspicious_pattern',
                    details: `Suspicious pattern in option ${String(key)}: ${String(String(suspicious.patterns.join(', ')))}`,
                    input: value,
                    risk: 'medium',
                  });
                  if (this.config.strictMode) {
                    throw new Error(`Suspicious pattern detected in option ${String(key)}`);
                  }
                }
              }
            }
          }

          // Execute the original function
          return await fn(...args);
        } catch (error) {
          if (error instanceof Error && error.message.includes('blocked')) {
            logger.error(chalk.red(`🚫 Security: ${String(String(error.message))}`));
            process.exit(1);
          }
          throw error;
        }
      });

    return command;
  }

  /**
   * Wraps an existing command with security features
   *
   * @param {Command} command - Commander.js command to secure
   * @returns {Command} The secured command
   *
   * @description Adds security validation to an existing command without
   * modifying its core functionality.
   *
   * @example
   * ```typescript
   * const existingCommand = program.command('deploy');
   * const securedCommand = wrapper.secureCommand(existingCommand);
   * ```
   */
  secureCommand(command: Command): Command {
    // Store original action handler using the public API
    const originalAction = (command as any)._actionHandler;

    if (originalAction) {
      command.action(async (...args: unknown[]) => {
        try {
          // Apply security checks
          const sanitizedArgs = this.sanitizeArguments(args.filter(arg => typeof arg === 'string'));

          if (sanitizedArgs.warnings.length > 0 && this.config.logSecurityEvents) {
            logger.warn(
              chalk.yellow(`⚠️  Security: ${String(String(sanitizedArgs.warnings.join(', ')))}`)
            );
          }

          // Execute original action with sanitized args
          return await originalAction(...args);
        } catch (error) {
          if (error instanceof Error && error.message.includes('blocked')) {
            logger.error(chalk.red(`🚫 Security: ${String(String(error.message))}`));
            process.exit(1);
          }
          throw error;
        }
      });
    }

    return command;
  }

  /**
   * Logs a security event for monitoring and auditing
   *
   * @private
   * @static
   * @param {Omit<SecurityEvent, 'timestamp'>} event - Event to log (timestamp added automatically)
   *
   * @description Logs security events with appropriate risk levels and
   * maintains a rolling buffer of the last 1000 events.
   */
  private logSecurityEvent(event: Omit<SecurityEvent, 'timestamp'>): void {
    const fullEvent: SecurityEvent = {
      ...event,
      timestamp: new Date(),
    };

    this.securityEvents.push(fullEvent);

    // Keep only last 1000 events
    if (this.securityEvents.length > 1000) {
      this.securityEvents = this.securityEvents.slice(-1000);
    }

    if (this.config.logSecurityEvents) {
      const color = {
        low: chalk.blue,
        medium: chalk.yellow,
        high: chalk.magenta,
        critical: chalk.red,
      }[event.risk];

      logger.info(
        color(
          `🔒 Security [${String(String(event.risk.toUpperCase()))}]: ${String(String(event.type))} - ${String(String(event.details))}`
        )
      );
    }
  }

  /**
   * Retrieves security events for analysis
   *
   * @param {number} [limit] - Maximum number of events to return
   * @returns {SecurityEvent[]} Array of security events (most recent first)
   *
   * @example
   * ```typescript
   * const recentEvents = wrapper.getSecurityEvents(10);
   * recentEvents.forEach(event => {
   *   console.log(`${event.timestamp}: ${event.type} - ${event.details}`);
   * });
   * ```
   */
  getSecurityEvents(limit?: number): SecurityEvent[] {
    const events = this.securityEvents.slice().reverse();
    return limit ? events.slice(0, limit) : events;
  }

  /**
   * Gets security statistics for monitoring
   *
   * @returns {Object} Security statistics
   * @returns {number} stats.totalEvents - Total number of events
   * @returns {Record<string, number>} stats.eventsByType - Event counts by type
   * @returns {Record<string, number>} stats.eventsByRisk - Event counts by risk level
   * @returns {SecurityEvent} [stats.lastEvent] - Most recent event if any
   *
   * @example
   * ```typescript
   * const stats = wrapper.getSecurityStats();
   * console.log(`Total security events: ${stats.totalEvents}`);
   * console.log('High risk events:', stats.eventsByRisk.high ?? 0);
   * ```
   */
  getSecurityStats(): {
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsByRisk: Record<string, number>;
    lastEvent?: SecurityEvent;
  } {
    const eventsByType: Record<string, number> = {};
    const eventsByRisk: Record<string, number> = {};

    this.securityEvents.forEach(event => {
      eventsByType[event.type] = (eventsByType[event.type] ?? 0) + 1;
      eventsByRisk[event.risk] = (eventsByRisk[event.risk] ?? 0) + 1;
    });

    const lastEvent = this.securityEvents[this.securityEvents.length - 1];
    return {
      totalEvents: this.securityEvents.length,
      eventsByType,
      eventsByRisk,
      ...(this.securityEvents.length > 0 && { lastEvent }),
    };
  }

  /**
   * Clears all security events from the log
   *
   * @example
   * ```typescript
   * wrapper.clearSecurityEvents();
   * console.log('Security event log cleared');
   * ```
   */
  clearSecurityEvents(): void {
    this.securityEvents = [];
  }

  /**
   * Updates security configuration at runtime
   *
   * @param {Partial<SecurityConfig>} newConfig - Configuration updates
   *
   * @example
   * ```typescript
   * wrapper.updateConfig({
   *   strictMode: true,
   *   maxArgumentLength: 200
   * });
   * ```
   */
  updateConfig(newConfig: Partial<SecurityConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Gets the current security configuration
   *
   * @returns {SecurityConfig} Current configuration (defensive copy)
   *
   * @example
   * ```typescript
   * const config = wrapper.getConfig();
   * console.log('Strict mode:', config.strictMode);
   * ```
   */
  getConfig(): SecurityConfig {
    return { ...this.config };
  }

  /**
   * Validates program arguments before execution
   *
   * @param {string[]} argv - Command line arguments
   * @returns {Object} Validation result
   * @returns {boolean} result.safe - Whether arguments are safe to execute
   * @returns {string[]} result.sanitized - Sanitized arguments
   * @returns {string[]} result.warnings - Security warnings
   *
   * @description Performs full validation of command line arguments including
   * sanitization and pattern detection across the entire command.
   *
   * @example
   * ```typescript
   * const validation = wrapper.validateProgramArgs(process.argv.slice(2));
   * if (!validation.safe) {
   *   console.error('Unsafe command detected');
   *   process.exit(1);
   * }
   * ```
   */
  validateProgramArgs(argv: string[]): { safe: boolean; sanitized: string[]; warnings: string[] } {
    const sanitizedResult = this.sanitizeArguments(argv);

    // Additional validation for the entire command line
    const fullCommand = sanitizedResult.sanitized.join(' ');
    const suspicious = InputSanitizer.detectSuspiciousPatterns(fullCommand);

    if (suspicious.suspicious) {
      this.logSecurityEvent({
        type: 'suspicious_pattern',
        details: `Command line contains suspicious patterns: ${String(String(suspicious.patterns.join(', ')))}`,
        input: fullCommand,
        risk: 'high',
      });

      if (this.config.strictMode) {
        return {
          safe: false,
          sanitized: sanitizedResult.sanitized,
          warnings: [...sanitizedResult.warnings, 'Suspicious patterns detected'],
        };
      }
    }

    return {
      safe: true,
      sanitized: sanitizedResult.sanitized,
      warnings: sanitizedResult.warnings,
    };
  }

  /**
   * Generates a comprehensive security report
   *
   * @returns {string} Formatted security report
   *
   * @description Creates a human-readable report of security events,
   * statistics, and current configuration.
   *
   * @example
   * ```typescript
   * const report = wrapper.generateSecurityReport();
   * console.log(report);
   * // Save to file or display in CLI
   * ```
   */
  generateSecurityReport(): string {
    const stats = this.getSecurityStats();
    const recentEvents = this.getSecurityEvents(10);

    const report = `
🔒 CLI Security Report
===================

Total Security Events: ${String(String(stats.totalEvents))}

Events by Type:
${Object.entries(stats.eventsByType)
  .map(([type, count]) => `  ${type}: ${count}`)
  .join('\n')}

Events by Risk Level:
${Object.entries(stats.eventsByRisk)
  .map(([risk, count]) => `  ${risk}: ${count}`)
  .join('\n')}

Recent Events (last 10):
${recentEvents
  .map(
    event =>
      `  ${event.timestamp.toISOString()} [${event.risk.toUpperCase()}] ${event.type}: ${event.details}`
  )
  .join('\n')}

Security Configuration:
  Input Sanitization: ${String(String(this.config.enableInputSanitization ? 'Enabled' : 'Disabled'))}
  Command Validation: ${String(String(this.config.enableCommandValidation ? 'Enabled' : 'Disabled'))}
  Strict Mode: ${String(String(this.config.strictMode ? 'Enabled' : 'Disabled'))}
  Max Argument Length: ${String(String(this.config.maxArgumentLength))}
  Allowed Commands: ${String(String(this.config.allowedCommands.length))}
  Blocked Patterns: ${String(String(this.config.blockedPatterns.length))}
`;

    return report;
  }
}

/**
 * Default singleton instance of SecureCliWrapper
 * @constant {SecureCliWrapper}
 */
export const secureCliWrapper = SecureCliWrapper.getInstance({
  enableInputSanitization: true,
  enableCommandValidation: true,
  logSecurityEvents: process.env.NODE_ENV !== 'production',
  strictMode: false,
  maxArgumentLength: 1000,
  allowedCommands: [
    'git',
    'npm',
    'yarn',
    'pnpm',
    'node',
    'tsc',
    'eslint',
    'prettier',
    'cat',
    'ls',
    'grep',
    'find',
    'head',
    'tail',
    'wc',
    'sort',
    'uniq',
  ],
});

/**
 * Convenience function to create a secure command
 *
 * @function createSecureCommand
 * @param {string} name - Command name
 * @param {string} description - Command description
 * @returns {Command} Secured command
 *
 * @example
 * ```typescript
 * const cmd = createSecureCommand('deploy', 'Deploy application');
 * ```
 */
export const createSecureCommand = (name: string, description: string): Command =>
  secureCliWrapper.createSecureCommand(name, description);

/**
 * Convenience function to secure an existing command
 *
 * @function secureCommand
 * @param {Command} command - Command to secure
 * @returns {Command} Secured command
 *
 * @example
 * ```typescript
 * const secured = secureCommand(existingCommand);
 * ```
 */
export const secureCommand = (command: Command): Command => secureCliWrapper.secureCommand(command);

/**
 * Convenience function to validate program arguments
 *
 * @function validateProgramArgs
 * @param {string[]} argv - Arguments to validate
 * @returns {Object} Validation result
 *
 * @example
 * ```typescript
 * const validation = validateProgramArgs(['--file', 'data.json']);
 * ```
 */
export const validateProgramArgs = (
  argv: string[]
): { safe: boolean; sanitized: string[]; warnings: string[] } =>
  secureCliWrapper.validateProgramArgs(argv);

/**
 * Adds comprehensive security middleware to a Commander.js program
 *
 * @function addSecurityMiddleware
 * @param {Command} program - Commander.js program
 * @returns {Command} Enhanced program with security features
 *
 * @description Adds security validation, monitoring, and management commands
 * to a Commander.js program. Includes:
 * - Automatic argument validation
 * - Security event logging
 * - Security management commands
 * - Security report generation
 *
 * @example
 * ```typescript
 * import { program } from 'commander';
 * import { addSecurityMiddleware } from './secure-cli-wrapper';
 *
 * addSecurityMiddleware(program);
 *
 * program
 *   .command('process')
 *   .action(() => {
 *     // Command is automatically secured
 *   });
 * ```
 */
export function addSecurityMiddleware(program: Command): Command {
  // Add global security options
  program
    .option('--security-report', 'show security report')
    .option('--security-strict', 'enable strict security mode')
    .option('--security-events [limit]', 'show recent security events');

  // Hook into the program's action handling
  const originalParse = program.parse.bind(program);
  // eslint-disable-next-line no-param-reassign
  program.parse = function secureParse(argv?: readonly string[], options?: unknown) {
    const args = argv || process.argv;

    // Validate arguments before parsing
    const validation = validateProgramArgs(args.slice(2));

    if (!validation.safe) {
      logger.error(chalk.red('🚫 Security: Command blocked due to security concerns'));
      logger.error(chalk.yellow('Warnings:', validation.warnings.join(', ')));
      process.exit(1);
    }

    if (validation.warnings.length > 0) {
      logger.warn(chalk.yellow('⚠️  Security warnings:', validation.warnings.join(', ')));
    }

    return originalParse(argv ? [...argv] : argv);
  };

  // Add security command
  const securityCmd = program.command('security').description('Security management commands');

  securityCmd
    .command('report')
    .description('Show security report')
    .action(() => {
      logger.info(secureCliWrapper.generateSecurityReport());
    });

  securityCmd
    .command('events [limit]')
    .description('Show recent security events')
    .action((limit?: string) => {
      const events = secureCliWrapper.getSecurityEvents(limit ? parseInt(limit, 10) : 20);
      if (events.length === 0) {
        logger.info(chalk.green('✅ No security events recorded'));
        return;
      }

      logger.info(chalk.blue('🔒 Recent Security Events:'));
      events.forEach(event => {
        const color = {
          low: chalk.blue,
          medium: chalk.yellow,
          high: chalk.magenta,
          critical: chalk.red,
        }[event.risk];

        logger.info(
          `${event.timestamp.toISOString()} ${color(`[${event.risk.toUpperCase()}]`)} ${event.type}: ${event.details}`
        );
      });
    });

  securityCmd
    .command('clear')
    .description('Clear security event log')
    .action(() => {
      secureCliWrapper.clearSecurityEvents();
      logger.info(chalk.green('✅ Security events cleared'));
    });

  securityCmd
    .command('config')
    .description('Show security configuration')
    .action(() => {
      const config = secureCliWrapper.getConfig();
      logger.info(chalk.blue('🔧 Security Configuration:'));
      logger.info(JSON.stringify(config, null, 2));
    });

  return program;
}
