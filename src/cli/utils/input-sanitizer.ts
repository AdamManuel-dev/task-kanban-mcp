import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

/**
 * Comprehensive input sanitization utility for CLI prompts
 * Addresses TASK-119: Implement input sanitization for all prompts
 */

export interface SanitizationOptions {
  allowHtml?: boolean;
  maxLength?: number;
  allowedCharacters?: RegExp;
  stripControlChars?: boolean;
  normalizeWhitespace?: boolean;
  preventInjection?: boolean;
  escapeSpecialChars?: boolean;
}

export interface SanitizationResult {
  sanitized: string;
  modified: boolean;
  warnings: string[];
  originalLength: number;
  sanitizedLength: number;
}

/**
 * Main input sanitizer class with security-focused features
 */
export class InputSanitizer {
  private static readonly instance: InputSanitizer;

  private readonly purify: any;

  constructor() {
    // Initialize DOMPurify with JSDOM for server-side sanitization
    const { window } = new JSDOM('');
    this.purify = DOMPurify(window as any);

    // Configure DOMPurify for strict sanitization
    this.purify.addHook('beforeSanitizeElements', (node: any) => {
      // Remove all script tags and event handlers
      if (node.nodeName === 'SCRIPT' || node.nodeName === 'IFRAME') {
        node.remove();
      }
    });
  }

  static getInstance(): InputSanitizer {
    if (!InputSanitizer.instance) {
      InputSanitizer.instance = new InputSanitizer();
    }
    return InputSanitizer.instance;
  }

  /**
   * Sanitize text input with comprehensive security checks
   */
  sanitizeText(input: string, options: SanitizationOptions = {}): SanitizationResult {
    const {
      allowHtml = false,
      maxLength = 1000,
      stripControlChars = true,
      normalizeWhitespace = true,
      preventInjection = true,
      escapeSpecialChars = true,
    } = options;

    let sanitized = input;
    const warnings: string[] = [];
    const originalLength = input.length;

    // 1. Basic safety checks
    if (typeof sanitized !== 'string') {
      sanitized = String(sanitized);
      warnings.push('Input was converted to string');
    }

    // 2. Length validation
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
      warnings.push(`Input truncated to ${String(maxLength)} characters`);
    }

    // 3. Strip control characters (except common whitespace)
    if (stripControlChars) {
      const controlCharRegex = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g;
      const beforeStrip = sanitized;
      sanitized = sanitized.replace(controlCharRegex, '');
      if (beforeStrip !== sanitized) {
        warnings.push('Control characters removed');
      }
    }

    // 4. Command injection prevention
    if (preventInjection) {
      sanitized = InputSanitizer.preventCommandInjection(sanitized, warnings);
    }

    // 5. HTML sanitization
    if (!allowHtml) {
      sanitized = this.purify.sanitize(sanitized, { ALLOWED_TAGS: [] });
    } else {
      sanitized = this.purify.sanitize(sanitized);
    }

    // 6. Escape special characters for CLI safety
    if (escapeSpecialChars) {
      sanitized = InputSanitizer.escapeCliSpecialChars(sanitized, warnings);
    }

    // 7. Normalize whitespace
    if (normalizeWhitespace) {
      const beforeNormalize = sanitized;
      sanitized = sanitized
        .replace(/\s+/g, ' ') // Multiple spaces to single
        .replace(/^\s+|\s+$/g, '') // Trim
        .replace(/\t/g, '    '); // Tabs to spaces
      if (beforeNormalize !== sanitized) {
        warnings.push('Whitespace normalized');
      }
    }

    // 8. Additional character restrictions
    if (options.allowedCharacters) {
      const beforeFilter = sanitized;
      sanitized = sanitized.replace(
        new RegExp(`[^${String(String(options.allowedCharacters.source))}]`, 'g'),
        ''
      );
      if (beforeFilter !== sanitized) {
        warnings.push('Invalid characters removed');
      }
    }

    return {
      sanitized,
      modified: sanitized !== input,
      warnings,
      originalLength,
      sanitizedLength: sanitized.length,
    };
  }

  /**
   * Prevent command injection attacks
   */
  private static preventCommandInjection(input: string, warnings: string[]): string {
    const dangerousPatterns = [
      // Shell injection patterns
      /[;&|`$(){}[\]\\]/g,
      // Path traversal
      /\.\.[/\\]/g,
      // Null bytes
      /\x00/g,
      // Process substitution
      /<\(/g,
      />\(/g,
      // Command substitution
      /\$\(/g,
      // Backticks
      /`/g,
    ];

    let sanitized = input;
    let hasInjectionAttempt = false;

    dangerousPatterns.forEach(pattern => {
      if (pattern.test(sanitized)) {
        sanitized = sanitized.replace(pattern, '');
        hasInjectionAttempt = true;
      }
    });

    if (hasInjectionAttempt) {
      warnings.push('Potential command injection patterns removed');
    }

    return sanitized;
  }

  /**
   * Escape CLI special characters
   */
  private static escapeCliSpecialChars(input: string, warnings: string[]): string {
    const beforeEscape = input;

    // Escape common shell metacharacters that are safe to keep but should be escaped
    const escapeMap: Record<string, string> = {
      '"': '\\"',
      "'": "\\'",
      '\\': '\\\\',
    };

    let escaped = input;
    Object.entries(escapeMap).forEach(([char, replacement]) => {
      escaped = escaped.replace(new RegExp(`\\${String(char)}`, 'g'), replacement);
    });

    if (beforeEscape !== escaped) {
      warnings.push('Special characters escaped');
    }

    return escaped;
  }

  /**
   * Sanitize file path inputs
   */
  sanitizeFilePath(input: string): SanitizationResult {
    return this.sanitizeText(input, {
      allowHtml: false,
      maxLength: 255,
      stripControlChars: true,
      normalizeWhitespace: true,
      preventInjection: true,
      escapeSpecialChars: false, // File paths may need some special chars
      allowedCharacters: /[\w\-.\s/\\:]/,
    });
  }

  /**
   * Sanitize URL inputs
   */
  sanitizeUrl(input: string): SanitizationResult {
    const result = this.sanitizeText(input, {
      allowHtml: false,
      maxLength: 2048,
      stripControlChars: true,
      normalizeWhitespace: true,
      preventInjection: true,
      escapeSpecialChars: false,
      allowedCharacters: /[\w\-._~:/?#[\]@!$&'()*+,;=%]/,
    });

    // Additional URL validation
    try {
      new URL(result.sanitized);
    } catch {
      result.warnings.push('Invalid URL format detected');
      result.sanitized = '';
    }

    return result;
  }

  /**
   * Sanitize email inputs
   */
  sanitizeEmail(input: string): SanitizationResult {
    return this.sanitizeText(input, {
      allowHtml: false,
      maxLength: 254, // RFC 5321 limit
      stripControlChars: true,
      normalizeWhitespace: true,
      preventInjection: true,
      escapeSpecialChars: false,
      allowedCharacters: /[\w\-_.@+]/,
    });
  }

  /**
   * Sanitize task title with specific rules
   */
  sanitizeTaskTitle(input: string): SanitizationResult {
    return this.sanitizeText(input, {
      allowHtml: false,
      maxLength: 200,
      stripControlChars: true,
      normalizeWhitespace: true,
      preventInjection: true,
      escapeSpecialChars: true,
      allowedCharacters: /[\w\s\-_.()[\]!?@#%&+=]/,
    });
  }

  /**
   * Sanitize description/long text inputs
   */
  sanitizeDescription(input: string): SanitizationResult {
    return this.sanitizeText(input, {
      allowHtml: false,
      maxLength: 2000,
      stripControlChars: true,
      normalizeWhitespace: true,
      preventInjection: true,
      escapeSpecialChars: false, // Descriptions can have more varied content
      allowedCharacters: /[\w\s\-_.()[\]!?@#%&+=:;,."']/,
    });
  }

  /**
   * Sanitize board/column names
   */
  sanitizeName(input: string, maxLength: number = 50): SanitizationResult {
    return this.sanitizeText(input, {
      allowHtml: false,
      maxLength,
      stripControlChars: true,
      normalizeWhitespace: true,
      preventInjection: true,
      escapeSpecialChars: true,
      allowedCharacters: /[\w\s\-_]/,
    });
  }

  /**
   * Sanitize tag names (more restrictive)
   */
  sanitizeTag(input: string): SanitizationResult {
    return this.sanitizeText(input, {
      allowHtml: false,
      maxLength: 20,
      stripControlChars: true,
      normalizeWhitespace: true,
      preventInjection: true,
      escapeSpecialChars: true,
      allowedCharacters: /[\w\-_]/,
    });
  }

  /**
   * Sanitize command-line arguments
   */
  sanitizeCliArgument(input: string): SanitizationResult {
    return this.sanitizeText(input, {
      allowHtml: false,
      maxLength: 500,
      stripControlChars: true,
      normalizeWhitespace: false, // Preserve exact spacing in CLI args
      preventInjection: true,
      escapeSpecialChars: true,
    });
  }

  /**
   * Batch sanitize multiple inputs
   */
  sanitizeBatch(
    inputs: Record<string, string>,
    sanitizers: Record<string, (input: string) => SanitizationResult>
  ): Record<string, SanitizationResult> {
    const results: Record<string, SanitizationResult> = {};

    Object.entries(inputs).forEach(([key, value]) => {
      const sanitizer = sanitizers[key] || this.sanitizeText.bind(this);
      results[key] = sanitizer(value);
    });

    return results;
  }

  /**
   * Check if input contains suspicious patterns
   */
  detectSuspiciousPatterns(input: string): { suspicious: boolean; patterns: string[] } {
    const suspiciousPatterns = [
      { pattern: /javascript:/i, name: 'JavaScript protocol' },
      { pattern: /data:/i, name: 'Data protocol' },
      { pattern: /vbscript:/i, name: 'VBScript protocol' },
      { pattern: /<script/i, name: 'Script tag' },
      { pattern: /on\w+\s*=/i, name: 'Event handler' },
      { pattern: /eval\s*\(/i, name: 'Eval function' },
      { pattern: /expression\s*\(/i, name: 'CSS expression' },
      { pattern: /\$\{.*\}/g, name: 'Template literal injection' },
      { pattern: /\{\{.*\}\}/g, name: 'Template engine injection' },
      { pattern: /rm\s+-rf/i, name: 'Destructive command' },
      { pattern: /curl\s+.*\|\s*sh/i, name: 'Remote script execution' },
    ];

    const detectedPatterns: string[] = [];

    suspiciousPatterns.forEach(({ pattern, name }) => {
      if (pattern.test(input)) {
        detectedPatterns.push(name);
      }
    });

    return {
      suspicious: detectedPatterns.length > 0,
      patterns: detectedPatterns,
    };
  }

  /**
   * Generate security report for input
   */
  generateSecurityReport(input: string): {
    safe: boolean;
    score: number; // 0-100, higher is safer
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // Check length
    if (input.length > 1000) {
      issues.push('Input exceeds recommended length');
      recommendations.push('Consider shortening the input');
      score -= 10;
    }

    // Check for suspicious patterns
    const suspiciousCheck = this.detectSuspiciousPatterns(input);
    if (suspiciousCheck.suspicious) {
      issues.push(
        `Suspicious patterns detected: ${String(String(suspiciousCheck.patterns.join(', ')))}`
      );
      recommendations.push('Remove or escape suspicious content');
      score -= 30;
    }

    // Check for control characters
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/.test(input)) {
      issues.push('Contains control characters');
      recommendations.push('Remove non-printable characters');
      score -= 15;
    }

    // Check for excessive special characters
    const specialCharCount = (input.match(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/g) || []).length;
    const specialCharRatio = specialCharCount / input.length;
    if (specialCharRatio > 0.3) {
      issues.push('High ratio of special characters');
      recommendations.push('Review special character usage');
      score -= 10;
    }

    return {
      safe: score >= 70,
      score: Math.max(0, score),
      issues,
      recommendations,
    };
  }
}

// Export singleton instance
export const inputSanitizer = InputSanitizer.getInstance();

// Utility functions for quick access
export const sanitizeTaskTitle = (input: string): SanitizationResult =>
  inputSanitizer.sanitizeTaskTitle(input);
export const sanitizeDescription = (input: string): SanitizationResult =>
  inputSanitizer.sanitizeDescription(input);
export const sanitizeName = (input: string, maxLength?: number): SanitizationResult =>
  inputSanitizer.sanitizeName(input, maxLength);
export const sanitizeTag = (input: string): SanitizationResult => inputSanitizer.sanitizeTag(input);
export const sanitizeEmail = (input: string): SanitizationResult =>
  inputSanitizer.sanitizeEmail(input);
export const sanitizeUrl = (input: string): SanitizationResult => inputSanitizer.sanitizeUrl(input);
export const sanitizeFilePath = (input: string): SanitizationResult =>
  inputSanitizer.sanitizeFilePath(input);
export const detectSuspicious = (input: string): { suspicious: boolean; patterns: string[] } =>
  inputSanitizer.detectSuspiciousPatterns(input);

/**
 * Safe prompt wrapper that automatically sanitizes input
 */
export function createSafePromptValidator(
  sanitizeFunction: (input: string) => SanitizationResult,
  additionalValidation?: (input: string) => true | string
) {
  return (input: string): true | string => {
    // First, sanitize the input
    const sanitized = sanitizeFunction(input);

    // Check if input was modified significantly
    if (sanitized.modified && sanitized.warnings.length > 0) {
      return `Input modified during sanitization: ${String(String(sanitized.warnings.join(', ')))}. Please try again.`;
    }

    // Check security score
    const securityReport = inputSanitizer.generateSecurityReport(input);
    if (!securityReport.safe) {
      return `Security issues detected: ${String(String(securityReport.issues.join(', ')))}`;
    }

    // Run additional validation if provided
    if (additionalValidation) {
      return additionalValidation(sanitized.sanitized);
    }

    return true;
  };
}
