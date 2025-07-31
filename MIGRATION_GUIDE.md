# CLI Migration Guide

## Overview

This guide helps you migrate from the old CLI to the new enhanced CLI with interactive features, improved user experience, and better performance.

## What's New

### 🎯 Interactive Features

- **Interactive Task Creation**: Guided prompts with AI-powered size estimation
- **Interactive Board Setup**: Template-based board creation with custom columns
- **Interactive Task Selection**: Visual task browsing with keyboard navigation
- **Interactive Board View**: Real-time board visualization with live updates

### 🚀 Enhanced User Experience

- **Spinner Integration**: Visual feedback for all operations
- **Rich Formatting**: Better table and list displays
- **Error Handling**: Graceful error recovery and helpful messages
- **Keyboard Shortcuts**: Quick access to common operations

### 📊 New Commands

- `kanban task create --interactive` - Interactive task creation
- `kanban board quick-setup` - Template-based board setup
- `kanban board view --interactive` - Interactive board visualization
- `kanban task select` - Interactive task selection

## Migration Steps

### 1. Update Installation

```bash
# Update to latest version
npm update @mcp-kanban/server

# Or reinstall
npm install @mcp-kanban/server@latest
```

### 2. Update Command Usage

#### Task Creation

**Old Way:**

```bash
kanban task create --title "Fix bug" --description "Critical bug fix"
```

**New Way:**

```bash
# Interactive mode (recommended)
kanban task create --interactive

# Command line mode (still supported)
kanban task create --title "Fix bug" --description "Critical bug fix"
```

#### Board Setup

**Old Way:**

```bash
kanban board create --name "My Board" --columns "todo,in-progress,done"
```

**New Way:**

```bash
# Quick setup with templates
kanban board quick-setup --template scrum --name "Sprint Board"

# Interactive setup
kanban board quick-setup
```

#### Board Viewing

**Old Way:**

```bash
kanban board list
```

**New Way:**

```bash
# Interactive board view
kanban board view board123 --interactive

# Static view (still supported)
kanban board list
```

### 3. Configuration Updates

The new CLI uses the same configuration system but with enhanced defaults:

```bash
# Set default board (unchanged)
kanban config set defaults.board board123

# New: Set default format
kanban config set defaults.format table

# New: Enable verbose mode
kanban config set defaults.verbose true
```

### 4. Environment Variables

No changes required - all existing environment variables are still supported.

## Breaking Changes

### Minimal Breaking Changes

1. **Command Aliases**: Some command aliases have been updated for consistency
   - `kanban t` → `kanban task` (still supported)
   - `kanban b` → `kanban board` (still supported)

2. **Output Format**: Default output format is now `table` instead of `json`
   - Use `--format json` to maintain old behavior

3. **Error Messages**: Error messages are now more descriptive and include suggestions

## New Features

### Interactive Task Creation

```bash
kanban task create --interactive
```

Features:

- AI-powered task size estimation
- Smart priority suggestions
- Guided prompts for all fields
- Input validation and defaults

### Template-Based Board Setup

```bash
kanban board quick-setup --template scrum
```

Available templates:

- `basic`: To Do → In Progress → Done
- `scrum`: Backlog → To Do → In Progress → Review → Done
- `bugs`: New → Confirmed → In Progress → Testing → Resolved
- `content`: Ideas → Writing → Editing → Review → Published

### Interactive Board View

```bash
kanban board view board123 --interactive
```

Features:

- Real-time updates
- Keyboard navigation
- Task selection and editing
- Column management
- WIP limit visualization

## Performance Improvements

### Build Optimizations

- Smaller bundle sizes
- Faster startup times
- Better memory usage
- Optimized dependencies

### Runtime Improvements

- Lazy loading of components
- Cached API responses
- Efficient data formatting
- Reduced network requests

## Troubleshooting

### Common Issues

1. **Interactive mode not working**

   ```bash
   # Check terminal compatibility
   kanban health

   # Use non-interactive mode
   kanban task create --no-interactive
   ```

2. **Slow performance**

   ```bash
   # Clear cache
   rm -rf ~/.config/mcp-kanban/cache

   # Check system resources
   kanban health
   ```

3. **Configuration issues**

   ```bash
   # Reset configuration
   kanban config reset

   # Recreate configuration
   kanban config init
   ```

### Getting Help

```bash
# General help
kanban --help

# Command-specific help
kanban task --help
kanban board --help

# Debug mode
kanban --debug task create
```

## Rollback

If you need to rollback to the old CLI:

```bash
# Install specific version
npm install @mcp-kanban/server@0.0.9

# Or use legacy commands
kanban --legacy task create --title "Task"
```

## Support

For additional support:

- Check the [README.md](README.md) for detailed documentation
- Review [API.md](docs/API.md) for API changes
- Open an issue on GitHub for bugs or feature requests

## What's Next

The new CLI is actively developed with planned features:

- Dashboard integration with blessed-contrib
- Advanced analytics and reporting
- Plugin system for custom extensions
- Team collaboration features
- Integration with external tools

---

**Note**: This migration guide covers the major changes. For detailed technical information, see the [Developer Documentation](docs/DEVELOPER_DOCUMENTATION_SUMMARY.md).
