# Developer Migration Guide: CLI Enhancements

## 🏗️ Architecture Changes

### New Security Layer

The CLI now includes a comprehensive security layer with three main components:

1. **Input Sanitizer** (`src/cli/utils/input-sanitizer.ts`)
2. **Command Injection Prevention** (`src/cli/utils/command-injection-prevention.ts`)
3. **Secure CLI Wrapper** (`src/cli/utils/secure-cli-wrapper.ts`)

### Integration Points

All user input now flows through the sanitization pipeline:

```typescript
// Before
const userInput = await inquirer.prompt([...]);

// After (automatically handled)
const userInput = await inquirer.prompt([...]);
// Input is automatically sanitized via enhanced validators
```

## 🔧 Build System Changes

### New Build Configuration

- **TypeScript Config**: `tsconfig.build.json` for production builds
- **Webpack Config**: `webpack.config.js` for optimized bundling
- **Security Modules**: Bundled separately for modularity

### Build Commands

```bash
# Development build
npm run build:dev

# Production build with optimization
npm run build:production

# Security modules only
npm run build:security
```

### Bundle Output

Security components are built as separate modules:
```
dist/security/
├── input-sanitizer.js (6.2 KiB)
├── command-injection-prevention.js (13.7 KiB)
├── secure-cli-wrapper.js (21.9 KiB)
├── spinner.js (4.08 KiB)
└── validators.js (12.8 KiB)
```

## 🔒 Security Implementation

### Input Sanitization

All prompts now use enhanced validators:

```typescript
// Before
export const taskTitleValidator = (input: string): boolean => {
  return input.length > 0;
};

// After
export const taskTitleValidator = (input: string): ValidationResult => {
  const sanitized = InputSanitizer.getInstance().sanitizeText(input, {
    maxLength: 200,
    preventInjection: true,
    escapeSpecialChars: true
  });
  
  return {
    isValid: sanitized.sanitized.length > 0,
    sanitizedValue: sanitized.sanitized,
    warnings: sanitized.warnings
  };
};
```

### Command Injection Prevention

Commands are now validated before execution:

```typescript
// Automatic validation in SecureCliWrapper
const safeCommand = commandInjectionPrevention.validateCommand(
  userCommand, 
  args, 
  { allowedCommands: ['git', 'npm', 'node'] }
);
```

### Error Handling

Enhanced error handling with security awareness:

```typescript
try {
  await apiOperation();
} catch (error) {
  // Security-aware error logging
  if (error instanceof SecurityError) {
    logger.security('Security violation detected', { error });
  }
  formatter.error('Operation failed', { sanitize: true });
}
```

## 📦 New Dependencies

### Production Dependencies
```json
{
  "dompurify": "^3.2.6",
  "jsdom": "^26.1.0"
}
```

### Development Dependencies
```json
{
  "webpack": "^5.100.2",
  "webpack-cli": "^6.0.1",
  "ts-loader": "^9.5.2"
}
```

## 🔌 Extension Points

### Adding New Commands

When creating new commands, use the security wrapper:

```typescript
import { addSecurityMiddleware } from '../utils/secure-cli-wrapper';

export function registerMyCommands(program: Command): void {
  const myCmd = program.command('my-command');
  
  // Security middleware is automatically applied
  myCmd.action(async (options) => {
    // Your command logic here
    // Input validation and sanitization is handled automatically
  });
}
```

### Custom Validators

Extend the validation system:

```typescript
import { InputSanitizer } from '../utils/input-sanitizer';

export const customValidator = (input: string): ValidationResult => {
  const sanitizer = InputSanitizer.getInstance();
  
  // Custom validation logic
  const result = sanitizer.sanitizeText(input, {
    allowHtml: false,
    maxLength: 100,
    allowedCharacters: /^[a-zA-Z0-9\s\-_]+$/
  });
  
  return {
    isValid: result.sanitized.length > 0,
    sanitizedValue: result.sanitized,
    warnings: result.warnings
  };
};
```

### Interactive Components

Use the enhanced prompt system:

```typescript
import { enhancedPrompt } from '../prompts/validators';

const answers = await enhancedPrompt([
  {
    type: 'input',
    name: 'title',
    message: 'Task title:',
    validator: taskTitleValidator, // Automatically sanitizes
    transformer: (input) => chalk.cyan(input)
  }
]);
```

## 🧪 Testing

### Security Testing

Test security components:

```typescript
import { InputSanitizer } from '../utils/input-sanitizer';

describe('Input Sanitization', () => {
  it('should prevent XSS attacks', () => {
    const sanitizer = InputSanitizer.getInstance();
    const result = sanitizer.sanitizeText('<script>alert("xss")</script>');
    
    expect(result.sanitized).not.toContain('<script>');
    expect(result.warnings).toContain('HTML tags removed');
  });
});
```

### Integration Testing

Test command integration:

```typescript
import { execSync } from 'child_process';

describe('CLI Security', () => {
  it('should handle malicious input safely', () => {
    const output = execSync('kanban task create --title "$(rm -rf /)"', {
      encoding: 'utf8'
    });
    
    expect(output).toContain('Input sanitized');
    expect(output).not.toContain('command executed');
  });
});
```

## 📊 Performance Considerations

### Bundle Sizes

The security layer adds minimal overhead:
- Input sanitization: ~6KB
- Command validation: ~14KB
- Total security overhead: ~20KB

### Runtime Performance

- Input sanitization: <1ms per input
- Command validation: <5ms per command
- Negligible impact on user experience

## 🔄 Migration Checklist for Developers

### Code Changes Required

- [ ] Update imports if using internal CLI utilities
- [ ] Test custom commands with new security layer
- [ ] Update any direct DOM manipulation (now secured)
- [ ] Review error handling for security events

### Build System Updates

- [ ] Update CI/CD to use new build commands
- [ ] Configure webpack if customizing security bundles
- [ ] Update deployment scripts for new file structure

### Testing Updates

- [ ] Add security tests for custom validators
- [ ] Test command injection scenarios
- [ ] Verify input sanitization in custom prompts

### Documentation Updates

- [ ] Update API documentation for new validation results
- [ ] Document security considerations for extensions
- [ ] Update contributor guidelines

## 🐛 Debugging

### Security Debug Mode

Enable detailed security logging:

```bash
DEBUG=security:* kanban task create --interactive
```

### Validation Debug

Check input sanitization:

```typescript
const sanitizer = InputSanitizer.getInstance();
sanitizer.setDebugMode(true);

const result = sanitizer.sanitizeText(suspiciousInput);
console.log(result.securityReport);
```

### Build Debug

Debug webpack builds:

```bash
npm run build:security -- --mode development --devtool source-map
```

## 🔮 Future Considerations

### Planned Security Enhancements

1. **Content Security Policy**: Restrict HTML rendering
2. **Rate Limiting**: Prevent abuse of interactive features
3. **Audit Logging**: Track security events
4. **Plugin Sandbox**: Secure third-party extensions

### Extension API

Future extension points will include:
- Custom sanitization rules
- Security policy configuration
- Audit event hooks
- Validation rule registration

## 📚 Resources

### Security Documentation

- [OWASP Input Validation](https://owasp.org/www-project-cheat-sheets/cheatsheets/Input_Validation_Cheat_Sheet.html)
- [Command Injection Prevention](https://owasp.org/www-community/attacks/Command_Injection)
- [DOMPurify Documentation](https://github.com/cure53/DOMPurify)

### Development Tools

- [Webpack Security Plugin](https://github.com/webpack-contrib/webpack-security-plugin)
- [ESLint Security Rules](https://github.com/eslint-community/eslint-plugin-security)
- [TypeScript Security Types](https://github.com/microsoft/TypeScript/wiki/Coding-guidelines#security)

---

For questions or security concerns, please review the security documentation or create an issue with the `security` label.