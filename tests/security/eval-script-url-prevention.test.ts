/**
 * @fileoverview Test to verify eval and script URL usage prevention
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Static code analysis, security validation, eval/script prevention
 * Main APIs: File system analysis, pattern detection, security enforcement
 * Constraints: No eval usage, no script URLs except in security patterns
 * Patterns: Security testing, code analysis, prevention verification
 */

import fs from 'fs';
import path from 'path';

describe('Eval and Script URL Prevention Verification', () => {
  const srcDir = path.join(__dirname, '../../src');
  const testDir = path.join(__dirname, '..');

  /**
   * Recursively get all TypeScript files in a directory
   */
  const getTypeScriptFiles = (dir: string): string[] => {
    const files: string[] = [];

    const scanDirectory = (currentDir: string): void => {
      const items = fs.readdirSync(currentDir);

      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          scanDirectory(fullPath);
        } else if (item.endsWith('.ts') || item.endsWith('.tsx')) {
          files.push(fullPath);
        }
      }
    };

    scanDirectory(dir);
    return files;
  };

  /**
   * Check if a file contains legitimate security pattern usage
   */
  const isLegitimateSecurityUsage = (filePath: string, line: string): boolean => {
    const relativePath = path.relative(process.cwd(), filePath);

    // Security-related files that legitimately detect dangerous patterns
    const securityFiles = [
      'src/cli/utils/input-sanitizer.ts',
      'src/cli/prompts/validators.ts',
      'src/utils/validation.ts',
      'src/server.ts', // CSP configuration
    ];

    // Check if this is a security file
    const isSecurityFile = securityFiles.some(secFile => relativePath.includes(secFile));
    if (!isSecurityFile) {
      return false;
    }

    // Check if the line is a legitimate security pattern
    const securityPatterns = [
      /pattern:\s*\/.*javascript:/i, // Pattern definition
      /pattern:\s*\/.*vbscript:/i, // VBScript pattern definition
      /\/javascript:/i, // Regex pattern
      /\/vbscript:/i, // VBScript regex pattern
      /dangerousProtocols.*javascript:/i, // Array of dangerous protocols
      /dangerousProtocols.*vbscript:/i, // Array of dangerous protocols
      /imgSrc:.*data:/i, // CSP image source configuration
      /name:\s*['"](JavaScript|VBScript|Data)\s*protocol['"]/i, // Pattern name definitions
    ];

    return securityPatterns.some(pattern => pattern.test(line));
  };

  describe('Production Code Security Analysis', () => {
    test('should not contain eval() usage in production code', () => {
      const sourceFiles = getTypeScriptFiles(srcDir);
      const evalUsages: Array<{ file: string; line: number; content: string }> = [];

      sourceFiles.forEach(filePath => {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        lines.forEach((line, index) => {
          // Skip comments and strings that are clearly test data or documentation
          if (line.includes('//') && line.includes('eval')) {
            return; // Skip commented eval references
          }

          // Look for actual eval usage
          if (/\beval\s*\(/.test(line) && !line.includes('//')) {
            evalUsages.push({
              file: path.relative(process.cwd(), filePath),
              line: index + 1,
              content: line.trim(),
            });
          }
        });
      });

      if (evalUsages.length > 0) {
        const errorMessage = evalUsages
          .map(usage => `${usage.file}:${usage.line} - ${usage.content}`)
          .join('\n');

        throw new Error(`Found eval() usage in production code:\n${errorMessage}`);
      }

      expect(evalUsages).toHaveLength(0);
    });

    test('should not contain javascript: URLs in production code', () => {
      const sourceFiles = getTypeScriptFiles(srcDir);
      const scriptUrls: Array<{ file: string; line: number; content: string }> = [];

      sourceFiles.forEach(filePath => {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        lines.forEach((line, index) => {
          // Look for javascript: protocol usage
          if (/javascript:/i.test(line)) {
            // Check if this is legitimate security usage
            if (!isLegitimateSecurityUsage(filePath, line)) {
              scriptUrls.push({
                file: path.relative(process.cwd(), filePath),
                line: index + 1,
                content: line.trim(),
              });
            }
          }
        });
      });

      if (scriptUrls.length > 0) {
        const errorMessage = scriptUrls
          .map(usage => `${usage.file}:${usage.line} - ${usage.content}`)
          .join('\n');

        throw new Error(`Found javascript: URLs in production code:\n${errorMessage}`);
      }

      expect(scriptUrls).toHaveLength(0);
    });

    test('should not contain vbscript: URLs in production code', () => {
      const sourceFiles = getTypeScriptFiles(srcDir);
      const vbscriptUrls: Array<{ file: string; line: number; content: string }> = [];

      sourceFiles.forEach(filePath => {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        lines.forEach((line, index) => {
          // Look for vbscript: protocol usage
          if (/vbscript:/i.test(line)) {
            // Check if this is legitimate security usage
            if (!isLegitimateSecurityUsage(filePath, line)) {
              vbscriptUrls.push({
                file: path.relative(process.cwd(), filePath),
                line: index + 1,
                content: line.trim(),
              });
            }
          }
        });
      });

      if (vbscriptUrls.length > 0) {
        const errorMessage = vbscriptUrls
          .map(usage => `${usage.file}:${usage.line} - ${usage.content}`)
          .join('\n');

        throw new Error(`Found vbscript: URLs in production code:\n${errorMessage}`);
      }

      expect(vbscriptUrls).toHaveLength(0);
    });

    test('should only allow data: URLs in legitimate contexts', () => {
      const sourceFiles = getTypeScriptFiles(srcDir);
      const dataUrls: Array<{ file: string; line: number; content: string }> = [];

      sourceFiles.forEach(filePath => {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        lines.forEach((line, index) => {
          // Look for actual data: protocol URLs (not TypeScript property names)
          if (/data:\s*[a-zA-Z]+\/[a-zA-Z]+/.test(line)) {
            // Check if this is legitimate usage (CSP config or security patterns)
            if (!isLegitimateSecurityUsage(filePath, line)) {
              // This is actual data: URL usage, flag it for review
              dataUrls.push({
                file: path.relative(process.cwd(), filePath),
                line: index + 1,
                content: line.trim(),
              });
            }
          }
        });
      });

      // Data URLs are allowed in CSP configuration and security patterns
      const allowedDataUrlContexts = dataUrls.filter(
        usage => usage.file.includes('server.ts') && usage.content.includes('imgSrc')
      );

      const disallowedDataUrls = dataUrls.filter(usage => !allowedDataUrlContexts.includes(usage));

      if (disallowedDataUrls.length > 0) {
        const errorMessage = disallowedDataUrls
          .map(usage => `${usage.file}:${usage.line} - ${usage.content}`)
          .join('\n');

        console.warn(`Review data: URL usage (may be legitimate):\n${errorMessage}`);
      }

      // This test should pass if we properly filter out legitimate uses
      expect(disallowedDataUrls.length).toBe(0);
    });
  });

  describe('Security Pattern Verification', () => {
    test('should have proper security patterns to detect eval usage', () => {
      const inputSanitizerPath = path.join(srcDir, 'cli/utils/input-sanitizer.ts');
      const content = fs.readFileSync(inputSanitizerPath, 'utf-8');

      // Should contain pattern to detect eval
      expect(content).toMatch(/eval\\s\*\\\(/i);
      expect(content).toMatch(/Eval function/i);
    });

    test('should have proper security patterns to detect script URLs', () => {
      const inputSanitizerPath = path.join(srcDir, 'cli/utils/input-sanitizer.ts');
      const content = fs.readFileSync(inputSanitizerPath, 'utf-8');

      // Should contain patterns to detect dangerous protocols
      expect(content).toMatch(/javascript:/i);
      expect(content).toMatch(/vbscript:/i);
      expect(content).toMatch(/JavaScript protocol/i);
      expect(content).toMatch(/VBScript protocol/i);
    });

    test('should have URL validators that block dangerous protocols', () => {
      const validatorsPath = path.join(srcDir, 'cli/prompts/validators.ts');
      const content = fs.readFileSync(validatorsPath, 'utf-8');

      // Should contain dangerous protocol detection
      expect(content).toMatch(/dangerousProtocols/i);
      expect(content).toMatch(/javascript:/i);
      expect(content).toMatch(/vbscript:/i);
    });

    test('should have validation utility that blocks JavaScript URLs', () => {
      const validationPath = path.join(srcDir, 'utils/validation.ts');
      const content = fs.readFileSync(validationPath, 'utf-8');

      // Should contain pattern to detect JavaScript URLs
      expect(content).toMatch(/javascript:/i);
    });
  });

  describe('CSP Configuration Security', () => {
    test('should have secure Content Security Policy configuration', () => {
      const serverPath = path.join(srcDir, 'server.ts');
      const content = fs.readFileSync(serverPath, 'utf-8');

      // Should have restrictive script source
      expect(content).toMatch(/scriptSrc:\s*\[\s*["']'self'["']\s*\]/);

      // Should allow data: only for images, not scripts
      expect(content).toMatch(/imgSrc:/);
      expect(content).toMatch(/data:/);

      // Should not allow unsafe-eval or unsafe-inline for scripts
      expect(content).not.toMatch(/unsafe-eval/);
      expect(content).not.toMatch(/unsafe-inline.*script/i);
    });
  });

  describe('Runtime Security Verification', () => {
    test('should block eval attempts at runtime', () => {
      // Test the input sanitizer's ability to detect eval
      const { InputSanitizer } = require('../../src/cli/utils/input-sanitizer');

      const dangerousInputs = [
        'eval("alert(1)")',
        'window.eval("malicious code")',
        'global.eval("dangerous")',
        'this.eval("bad")',
      ];

      dangerousInputs.forEach(input => {
        const result = InputSanitizer.detectSuspiciousPatterns(input);
        expect(result.suspicious).toBe(true);
        expect(result.patterns).toContain('Eval function');
      });
    });

    test('should block script URLs at runtime', () => {
      const { InputSanitizer } = require('../../src/cli/utils/input-sanitizer');

      const dangerousUrls = [
        'javascript:alert(1)',
        'javascript:void(0)',
        'vbscript:msgbox("xss")',
        'JAVASCRIPT:alert("bypass attempt")',
      ];

      dangerousUrls.forEach(url => {
        const result = InputSanitizer.detectSuspiciousPatterns(url);
        expect(result.suspicious).toBe(true);
        expect(
          result.patterns.some(
            p => p.includes('JavaScript protocol') || p.includes('VBScript protocol')
          )
        ).toBe(true);
      });
    });

    test('should sanitize eval attempts from input', () => {
      const { inputSanitizer } = require('../../src/cli/utils/input-sanitizer');

      const maliciousInput = 'user input with eval("malicious") code';
      const result = inputSanitizer.sanitizeText(maliciousInput, {
        preventInjection: true,
      });

      expect(result.sanitized).not.toContain('eval(');
      expect(result.warnings).not.toHaveLength(0);
    });
  });

  describe('Comprehensive Security Audit', () => {
    test('should not have any Function constructor usage', () => {
      const sourceFiles = getTypeScriptFiles(srcDir);
      const functionConstructorUsages: Array<{ file: string; line: number; content: string }> = [];

      sourceFiles.forEach(filePath => {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        lines.forEach((line, index) => {
          // Look for Function constructor usage
          if (/new\s+Function\s*\(/.test(line) && !line.includes('//')) {
            functionConstructorUsages.push({
              file: path.relative(process.cwd(), filePath),
              line: index + 1,
              content: line.trim(),
            });
          }
        });
      });

      expect(functionConstructorUsages).toHaveLength(0);
    });

    test('should not have setTimeout/setInterval with string arguments', () => {
      const sourceFiles = getTypeScriptFiles(srcDir);
      const stringTimeoutUsages: Array<{ file: string; line: number; content: string }> = [];

      sourceFiles.forEach(filePath => {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        lines.forEach((line, index) => {
          // Look for setTimeout/setInterval with string first argument
          if (/(setTimeout|setInterval)\s*\(\s*['"`]/.test(line) && !line.includes('//')) {
            stringTimeoutUsages.push({
              file: path.relative(process.cwd(), filePath),
              line: index + 1,
              content: line.trim(),
            });
          }
        });
      });

      expect(stringTimeoutUsages).toHaveLength(0);
    });
  });
});
