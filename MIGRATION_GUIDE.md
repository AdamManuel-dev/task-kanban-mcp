# CLI Migration Guide: Enhanced Security & Interactive Features

## Overview

This guide helps you migrate from the basic CLI to the enhanced version with new security features, interactive prompts, and improved user experience.

## 🔒 Security Enhancements

### Key Security Improvements

1. **Input Sanitization**: All user inputs are now automatically sanitized to prevent injection attacks
2. **Command Injection Prevention**: Commands are validated and executed in a secure context
3. **Enhanced Error Handling**: Better error messages with security-aware logging

### What This Means for You

- **No Breaking Changes**: Existing commands continue to work as before
- **Safer Operations**: Your data is now protected against malicious input
- **Better Feedback**: More informative error messages when something goes wrong

## 🎨 Interactive Features

### New Interactive Commands

| Old Command | New Enhanced Version | Description |
|-------------|---------------------|-------------|
| `kanban task create` | `kanban task create --interactive` | Interactive task creation with prompts |
| `kanban board create` | `kanban board create --interactive` | Guided board setup with templates |
| `kanban board view` | `kanban board view --interactive` | Live updating board view with keyboard shortcuts |

### Quick Setup Commands

```bash
# NEW: Quick board setup with templates
kanban board quick-setup --template scrum

# NEW: Interactive dashboard
kanban dashboard --interactive

# NEW: Process TODO files automatically
kanban process-todos todo.md
```

## 📋 Command Reference

### Task Management

#### Before (Still Works)
```bash
kanban task list
kanban task create --title "My Task" --board-id 123
kanban task update 456 --status done
```

#### Enhanced Options
```bash
# Interactive mode with prompts
kanban task create --interactive

# Enhanced filtering and search
kanban task list --status todo --priority P1 --interactive

# Quick task operations
kanban task quick-add "Fix bug in auth system"
```

### Board Management

#### Before (Still Works)
```bash
kanban board list
kanban board create --name "Project Board"
kanban board view 123
```

#### Enhanced Options
```bash
# Interactive board creation with templates
kanban board create --interactive --template scrum

# Live updating board view
kanban board view --interactive --refresh 30

# Quick setup wizard
kanban board quick-setup
```

### Configuration

#### Before (Still Works)
```bash
kanban config set api-url http://localhost:3000
kanban config get api-url
```

#### Enhanced Options
```bash
# Interactive configuration wizard
kanban config setup --interactive

# Security-aware configuration
kanban config validate  # NEW: Validates and sanitizes config
```

## 🔧 New Features

### 1. Interactive Prompts

The CLI now uses intelligent prompts that:
- Validate input in real-time
- Provide helpful suggestions
- Remember your preferences
- Guide you through complex operations

### 2. Enhanced Visual Output

- **Spinners**: Visual feedback during operations
- **Progress Bars**: For long-running tasks
- **Color Coding**: Consistent visual hierarchy
- **Tables**: Better formatted output

### 3. Keyboard Navigation

In interactive modes:
- `↑/↓` or `j/k`: Navigate lists
- `Enter`: Select item
- `Space`: Toggle selection
- `Esc` or `q`: Exit
- `?`: Show help

### 4. Templates and Presets

```bash
# Board templates
kanban board create --template basic|scrum|bugs|content

# Task templates
kanban task create --template bug-report|feature-request
```

## 🔄 Migration Steps

### Step 1: Update Dependencies

If you have the CLI installed globally:
```bash
npm update -g @mcp-kanban/server
```

If using locally:
```bash
npm update @mcp-kanban/server
```

### Step 2: Verify Installation

```bash
kanban --version
kanban config validate
```

### Step 3: Optional Configuration Update

Run the new setup wizard to configure enhanced features:
```bash
kanban config setup --interactive
```

### Step 4: Test New Features

Try the interactive board view:
```bash
kanban board view --interactive
```

## 🛠️ Troubleshooting

### Common Issues

#### 1. Command Not Found
```bash
# Solution: Reinstall or check PATH
npm install -g @mcp-kanban/server
```

#### 2. Configuration Errors
```bash
# Solution: Reset and reconfigure
kanban config reset
kanban config setup --interactive
```

#### 3. Permission Issues
```bash
# Solution: Check file permissions
kanban config check-permissions
```

### Security-Related Changes

#### Input Validation Errors

**Before**: Commands might fail silently with malformed input
**Now**: Clear error messages explain what's wrong and how to fix it

```bash
# Example: Invalid task title with special characters
kanban task create --title "<script>alert('xss')</script>"
# Output: Input sanitized, special characters escaped for security
```

#### Command Injection Prevention

**Before**: Some edge cases could allow command injection
**Now**: All commands are validated and executed securely

```bash
# Example: Potentially dangerous input is now safely handled
kanban task create --title "Task; rm -rf /"
# Output: Command is safely escaped and executed
```

## 📖 New Documentation

### Built-in Help

```bash
# Global help
kanban --help

# Command-specific help
kanban task --help
kanban board view --help

# Interactive help (in interactive modes)
# Press '?' to show keyboard shortcuts
```

### Examples and Tutorials

```bash
# Built-in examples
kanban examples
kanban examples tasks
kanban examples boards

# Interactive tutorial
kanban tutorial
```

## 🔄 Backward Compatibility

### What Stays the Same

- All existing commands work without modification
- Configuration file format unchanged
- API endpoints and data structures unchanged
- Output formats (JSON, CSV, table) work as before

### What's Enhanced

- Better error messages
- Input validation and sanitization
- Interactive options for all major commands
- Visual improvements (colors, formatting)
- Keyboard shortcuts in interactive modes

## 🎯 Best Practices

### 1. Use Interactive Mode for Setup

For initial setup or complex operations:
```bash
kanban board create --interactive
kanban task create --interactive
```

### 2. Leverage Templates

Save time with built-in templates:
```bash
kanban board quick-setup --template scrum
```

### 3. Use Keyboard Shortcuts

In interactive views, use:
- `j/k` for navigation (Vim-style)
- `?` for help
- `r` for refresh

### 4. Enable Auto-completion

Add to your shell profile:
```bash
# For bash
eval "$(kanban completion bash)"

# For zsh
eval "$(kanban completion zsh)"
```

## 🚀 What's Next

### Planned Features

- **AI-Powered Suggestions**: Smart task and board recommendations
- **Advanced Templates**: Custom template creation
- **Team Collaboration**: Real-time updates and notifications
- **Performance Monitoring**: Built-in analytics and insights

### Feedback

We value your feedback! Report issues or suggest features:

```bash
kanban feedback --interactive
```

Or create an issue at: [GitHub Issues](https://github.com/yourusername/mcp-kanban/issues)

## 📋 Quick Reference Card

### Essential Commands

| Task | Old Command | New Enhanced Option |
|------|-------------|-------------------|
| Create task | `kanban task create --title "..."` | `kanban task create --interactive` |
| Create board | `kanban board create --name "..."` | `kanban board quick-setup` |
| View board | `kanban board view 123` | `kanban board view 123 --interactive` |
| List tasks | `kanban task list` | `kanban task list --interactive` |
| Configuration | `kanban config set key value` | `kanban config setup --interactive` |

### Keyboard Shortcuts (Interactive Mode)

| Key | Action |
|-----|--------|
| `↑/↓` | Navigate up/down |
| `j/k` | Navigate up/down (Vim) |
| `←/→` | Navigate left/right |
| `h/l` | Navigate left/right (Vim) |
| `Enter` | Select/confirm |
| `Space` | Toggle selection |
| `Esc` | Cancel/back |
| `q` | Quit |
| `?` | Show help |
| `r` | Refresh |

---

**Happy task managing! 🎉**

For additional help: `kanban --help` or `kanban tutorial`