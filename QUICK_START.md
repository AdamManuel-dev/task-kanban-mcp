# Quick Start: Enhanced CLI

## 🚀 New User? Start Here!

### 1. Install and Setup

```bash
npm install -g @mcp-kanban/server
kanban config setup --interactive
```

### 2. Create Your First Board

```bash
kanban board quick-setup --template scrum
```

### 3. Add Tasks Interactively

```bash
kanban task create --interactive
```

### 4. View Your Board

```bash
kanban board view --interactive
```

## 🔧 Upgrading from Old CLI?

**Good news**: All your existing commands still work!

### Try These Enhanced Features:

```bash
# Interactive task creation
kanban task create --interactive

# Live board view with keyboard shortcuts
kanban board view --interactive --refresh 30

# Quick board setup with templates
kanban board quick-setup --template basic
```

## ⌨️ Essential Keyboard Shortcuts

In interactive modes:

- `j/k` or `↑/↓`: Navigate
- `Enter`: Select
- `r`: Refresh
- `?`: Help
- `q`: Quit

## 🔒 Security Features (Automatic)

- ✅ Input sanitization
- ✅ Command injection prevention
- ✅ Enhanced error handling

No configuration needed - security is built-in!

## 📖 Get Help

```bash
kanban --help           # General help
kanban task --help      # Task commands
kanban tutorial         # Interactive tutorial
```

---

**Ready to be productive? Run:** `kanban board quick-setup`
