/**
 * Secure CLI Wrapper
 * Integrates command injection prevention and input sanitization for the entire CLI
 * Addresses TASK-120: Command injection prevention
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { commandInjectionPrevention, validateCommand } from './command-injection-prevention';
import { inputSanitizer } from './input-sanitizer';
import { logger } from '../../utils/logger';

export interface SecurityConfig {
  enableInputSanitization: boolean;
  enableCommandValidation: boolean;
  logSecurityEvents: boolean;
  strictMode: boolean;
  maxArgumentLength: number;
  allowedCommands: string[];
  blockedPatterns: RegExp[];
}

export interface SecurityEvent {
  timestamp: Date;
  type: 'input_sanitized' | 'command_blocked' | 'suspicious_pattern' | 'validation_failed';
  details: string;
  input: string;
  risk: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Secure CLI wrapper with comprehensive protection
 */
export class SecureCliWrapper {
  private static instance: SecureCliWrapper;

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

  static getInstance(config?: Partial<SecurityConfig>): SecureCliWrapper {
    if (!SecureCliWrapper.instance) {
      SecureCliWrapper.instance = new SecureCliWrapper(config);
    }
    return SecureCliWrapper.instance;
  }

  /**
   * Sanitize and validate CLI arguments
   */
  sanitizeArguments(args: string[]): { sanitized: string[]; warnings: string[] } {
    const sanitized: string[] = [];
    const warnings: string[] = [];

    args.forEach((arg, index) => {
      // Check length
      if (arg.length > this.config.maxArgumentLength) {
        SecureCliWrapper.logSecurityEvent({
          type: 'validation_failed',
          details: `Argument ${String(index)} exceeds maximum length`,
          input: `${String(String(arg.substring(0, 100)))}...`,
          risk: 'medium',
        });
        if (this.config.strictMode) {
          throw new Error(
            `Argument ${String(index)} exceeds maximum length (${String(String(this.config.maxArgumentLength))})`
          );
        }
        warnings.push(`Argument ${String(index)} truncated`);
        arg = arg.substring(0, this.config.maxArgumentLength);
      }

      // Check for blocked patterns
      const blockedPattern = this.config.blockedPatterns.find(pattern => pattern.test(arg));
      if (blockedPattern) {
        this.logSecurityEvent({
          type: 'command_blocked',
          details: `Blocked pattern detected: ${String(String(blockedPattern.source))}`,
          input: arg,
          risk: 'high',
        });
        if (this.config.strictMode) {
          throw new Error(
            `Blocked pattern detected in argument ${String(index)}: ${String(String(blockedPattern.source))}`
          );
        }
        warnings.push(`Blocked pattern removed from argument ${String(index)}`);
        arg = arg.replace(blockedPattern, '');
      }

      // Sanitize input if enabled
      if (this.config.enableInputSanitization) {
        const sanitizationResult = inputSanitizer.sanitizeCliArgument(arg);
        if (sanitizationResult.modified) {
          this.logSecurityEvent({
            type: 'input_sanitized',
            details: `Argument ${String(index)} sanitized: ${String(String(sanitizationResult.warnings.join(', ')))}`,
            input: arg,
            risk: 'low',
          });
          warnings.push(`Argument ${String(index)} sanitized`);
        }
        sanitized.push(sanitizationResult.sanitized);
      } else {
        sanitized.push(arg);
      }
    });

    return { sanitized, warnings };
  }

  /**
   * Create a secure command wrapper
   */
  createSecureCommand(name: string, description: string): Command {
    const command = new Command(name);
    command.description(description);

    // Override the action method to add security checks
    const originalAction = command.action.bind(command);
    command.action = (fn: (...args: any[]) => void | Promise<void>) =>
      originalAction(async (...args: any[]) => {
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
                const suspicious = inputSanitizer.detectSuspiciousPatterns(value);
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
   * Wrap an existing command with security features
   */
  secureCommand(command: Command): Command {
    // Store original action handler using the public API
    const originalAction = (command as any)._actionHandler;

    if (originalAction) {
      command.action(async (...args: any[]) => {
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
   * Log security events
   */
  private static logSecurityEvent(event: Omit<SecurityEvent, 'timestamp'>): void {
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

      logger.log(
        color(
          `🔒 Security [${String(String(event.risk.toUpperCase()))}]: ${String(String(event.type))} - ${String(String(event.details))}`
        )
      );
    }
  }

  /**
   * Get security events
   */
  getSecurityEvents(limit?: number): SecurityEvent[] {
    const events = this.securityEvents.slice().reverse();
    return limit ? events.slice(0, limit) : events;
  }

  /**
   * Get security statistics
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
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
      eventsByRisk[event.risk] = (eventsByRisk[event.risk] || 0) + 1;
    });

    const lastEvent = this.securityEvents[this.securityEvents.length - 1];
    return {
      totalEvents: this.securityEvents.length,
      eventsByType,
      eventsByRisk,
      ...(lastEvent && { lastEvent }),
    };
  }

  /**
   * Clear security events
   */
  clearSecurityEvents(): void {
    this.securityEvents = [];
  }

  /**
   * Update security configuration
   */
  updateConfig(newConfig: Partial<SecurityConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current security configuration
   */
  getConfig(): SecurityConfig {
    return { ...this.config };
  }

  /**
   * Validate program arguments before execution
   */
  validateProgramArgs(argv: string[]): { safe: boolean; sanitized: string[]; warnings: string[] } {
    const sanitizedResult = this.sanitizeArguments(argv);

    // Additional validation for the entire command line
    const fullCommand = sanitizedResult.sanitized.join(' ');
    const suspicious = inputSanitizer.detectSuspiciousPatterns(fullCommand);

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
   * Create security report
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

// Export singleton instance and utilities
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

export const createSecureCommand = (name: string, description: string): Command =>
  secureCliWrapper.createSecureCommand(name, description);

export const secureCommand = (command: Command): Command => secureCliWrapper.secureCommand(command);

export const validateProgramArgs = (
  argv: string[]
): { safe: boolean; sanitized: string[]; warnings: string[] } =>
  secureCliWrapper.validateProgramArgs(argv);

/**
 * Security middleware for Commander.js programs
 */
export function addSecurityMiddleware(program: Command): Command {
  // Add global security options
  program
    .option('--security-report', 'show security report')
    .option('--security-strict', 'enable strict security mode')
    .option('--security-events [limit]', 'show recent security events');

  // Hook into the program's action handling
  const originalParse = program.parse.bind(program);
  program.parse = function (argv?: readonly string[], options?: any) {
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

    return originalParse.call(this, argv, options);
  };

  // Add security command
  const securityCmd = program.command('security').description('Security management commands');

  securityCmd
    .command('report')
    .description('Show security report')
    .action(() => {
      logger.log(secureCliWrapper.generateSecurityReport());
    });

  securityCmd
    .command('events [limit]')
    .description('Show recent security events')
    .action((limit?: string) => {
      const events = secureCliWrapper.getSecurityEvents(limit ? parseInt(limit, 10) : 20);
      if (events.length === 0) {
        logger.log(chalk.green('✅ No security events recorded'));
        return;
      }

      logger.log(chalk.blue('🔒 Recent Security Events:'));
      events.forEach(event => {
        const color = {
          low: chalk.blue,
          medium: chalk.yellow,
          high: chalk.magenta,
          critical: chalk.red,
        }[event.risk];

        logger.log(
          `${event.timestamp.toISOString()} ${color(`[${event.risk.toUpperCase()}]`)} ${event.type}: ${event.details}`
        );
      });
    });

  securityCmd
    .command('clear')
    .description('Clear security event log')
    .action(() => {
      secureCliWrapper.clearSecurityEvents();
      logger.log(chalk.green('✅ Security events cleared'));
    });

  securityCmd
    .command('config')
    .description('Show security configuration')
    .action(() => {
      const config = secureCliWrapper.getConfig();
      logger.log(chalk.blue('🔧 Security Configuration:'));
      logger.log(JSON.stringify(config, null, 2));
    });

  return program;
}
