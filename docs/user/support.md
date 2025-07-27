# Support Guide

This guide explains how to get help with MCP Kanban Server and where to find additional resources.

## 🆘 Getting Help

### Before Asking for Help

Before reaching out for support, please:

1. **Check the documentation**:
   - [User Documentation](./README.md) - Main user guide
   - [Installation Guide](./installation.md) - Setup instructions
   - [Configuration Guide](./configuration.md) - Configuration options
   - [CLI Usage Guide](./cli-usage.md) - Command reference
   - [MCP Integration Guide](./mcp-integration.md) - AI agent setup

2. **Search for existing solutions**:
   - [FAQ](./faq.md) - Common questions and answers
   - [Troubleshooting Guide](./troubleshooting.md) - Problem diagnosis
   - [GitHub Issues](https://github.com/yourusername/mcp-kanban/issues) - Known bugs
   - [GitHub Discussions](https://github.com/yourusername/mcp-kanban/discussions) - Community help

3. **Gather diagnostic information**:
   ```bash
   # System information
   node --version
   npm --version
   sqlite3 --version
   uname -a
   
   # Configuration
   kanban config list
   cat .env | grep -v "^#"
   
   # Health check
   curl http://localhost:3000/health
   kanban health
   
   # Recent logs
   tail -n 50 ./logs/kanban.log
   tail -n 50 ~/.kanban/cli.log
   ```

## 📞 Support Channels

### GitHub Issues

**Use for**: Bugs, feature requests, and technical problems

**Before creating an issue**:
1. Search existing issues to avoid duplicates
2. Check if your issue is already reported
3. Try the troubleshooting steps in this guide

**When creating an issue**:
1. Use a clear, descriptive title
2. Include system information (OS, Node.js version, etc.)
3. Provide steps to reproduce the problem
4. Include relevant logs and error messages
5. Describe expected vs actual behavior
6. Mention what you've already tried

**Issue template**:
```markdown
## Description
Brief description of the problem

## Steps to Reproduce
1. Step 1
2. Step 2
3. Step 3

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## System Information
- OS: [e.g., macOS 14.0, Ubuntu 22.04]
- Node.js: [e.g., v18.17.0]
- npm: [e.g., v9.6.7]
- SQLite: [e.g., v3.42.0]

## Configuration
- Server URL: [e.g., http://localhost:3000]
- CLI version: [e.g., 0.1.0]

## Logs
```
[Paste relevant logs here]
```

## Additional Information
Any other context about the problem
```

### GitHub Discussions

**Use for**: Questions, general help, and community discussion

**Topics covered**:
- How-to questions
- Best practices
- Workflow suggestions
- Integration help
- General discussion

**Before asking**:
1. Search existing discussions
2. Check the FAQ and documentation
3. Be specific about your question

**Discussion categories**:
- **General**: General questions and discussion
- **Help**: Specific help requests
- **Showcase**: Share your setups and workflows
- **Ideas**: Feature suggestions and ideas

### Community Discord

**Use for**: Real-time help and community interaction

**Discord server**: [Join our Discord](https://discord.gg/your-invite-link)

**Channels**:
- `#general` - General discussion
- `#help` - Help and support
- `#showcase` - Share your work
- `#announcements` - Project updates
- `#development` - Development discussion

**Discord etiquette**:
1. Be respectful and patient
2. Use appropriate channels
3. Provide context when asking questions
4. Help others when you can

### Documentation Issues

**Use for**: Documentation problems and improvements

If you find issues with the documentation:
1. Check if it's already reported in [GitHub Issues](https://github.com/yourusername/mcp-kanban/issues)
2. Create an issue with the `documentation` label
3. Suggest improvements or clarifications

## 🔧 Self-Help Resources

### Documentation Index

#### Getting Started
- [User Documentation](./README.md) - Main entry point
- [Installation Guide](./installation.md) - Complete setup
- [Configuration Guide](./configuration.md) - All configuration options
- [Quick Start Tutorial](./quick-start.md) - 5-minute setup

#### Usage Guides
- [CLI Usage Guide](./cli-usage.md) - Complete CLI reference
- [MCP Integration Guide](./mcp-integration.md) - AI agent setup
- [WebSocket Real-time Updates](./websocket.md) - Real-time monitoring
- [API Reference](./api-reference.md) - REST API documentation

#### Advanced Features
- [Backup and Recovery](./backup-recovery.md) - Data management
- [Performance Tuning](./performance.md) - Optimization guide
- [Security Best Practices](./security.md) - Security configuration
- [Multi-Agent Coordination](./multi-agent.md) - Advanced workflows

#### Troubleshooting
- [Troubleshooting Guide](./troubleshooting.md) - Problem diagnosis
- [FAQ](./faq.md) - Common questions
- [Error Reference](./errors.md) - Error codes and meanings

### Video Tutorials

**Coming Soon**:
- Installation walkthrough
- Basic usage tutorial
- MCP integration guide
- Advanced features demo
- Troubleshooting common issues

### Example Configurations

#### Development Setup
```bash
# .env (Development)
NODE_ENV=development
PORT=3000
API_KEY_SECRET=dev-secret-key-32-chars
API_KEYS=dev-key-1,dev-key-2
DATABASE_PATH=./data/kanban-dev.db
LOG_LEVEL=debug
DEV_ENABLE_DEBUG_ROUTES=true
DEV_SEED_DATABASE=true
MCP_TOOLS_ENABLED=true
```

#### Production Setup
```bash
# .env (Production)
NODE_ENV=production
PORT=3000
API_KEY_SECRET=prod-secret-key-32-chars
API_KEYS=prod-key-1,prod-key-2,prod-key-3
DATABASE_PATH=/app/data/kanban.db
LOG_LEVEL=info
DATABASE_WAL_MODE=true
RATE_LIMIT_MAX_REQUESTS=500
BACKUP_ENABLED=true
METRICS_ENABLED=true
```

#### Docker Setup
```yaml
# docker-compose.yml
version: '3.8'
services:
  mcp-kanban:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - API_KEY_SECRET=${API_KEY_SECRET}
      - API_KEYS=${API_KEYS}
      - DATABASE_PATH=/app/data/kanban.db
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    restart: unless-stopped
```

## 🐛 Reporting Bugs

### Bug Report Checklist

Before reporting a bug, ensure you have:

- [ ] **Reproduced the issue** consistently
- [ ] **Checked existing issues** for duplicates
- [ ] **Gathered system information** (OS, versions, etc.)
- [ ] **Collected relevant logs** and error messages
- [ ] **Tried troubleshooting steps** from the guide
- [ ] **Provided clear steps** to reproduce
- [ ] **Described expected vs actual behavior**

### Bug Report Template

```markdown
## Bug Report

### Summary
Brief description of the bug

### Environment
- **OS**: [e.g., macOS 14.0, Ubuntu 22.04, Windows 11]
- **Node.js**: [e.g., v18.17.0]
- **npm**: [e.g., v9.6.7]
- **SQLite**: [e.g., v3.42.0]
- **MCP Kanban**: [e.g., v0.1.0]

### Steps to Reproduce
1. Step 1
2. Step 2
3. Step 3

### Expected Behavior
What should happen

### Actual Behavior
What actually happens

### Logs and Error Messages
```
[Paste logs here]
```

### Additional Context
Any other relevant information

### Possible Solution
If you have ideas for fixing the issue
```

## 💡 Feature Requests

### Feature Request Guidelines

When requesting features:

1. **Check existing requests** to avoid duplicates
2. **Explain the use case** and why it's needed
3. **Provide examples** of how it would work
4. **Consider implementation** complexity
5. **Be specific** about requirements

### Feature Request Template

```markdown
## Feature Request

### Summary
Brief description of the feature

### Use Case
Why this feature is needed and how it would be used

### Proposed Solution
How the feature could be implemented

### Examples
Examples of how the feature would work

### Alternatives Considered
Other approaches that were considered

### Additional Context
Any other relevant information
```

## 🤝 Contributing

### How to Contribute

We welcome contributions! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes**
4. **Add tests** for new functionality
5. **Update documentation** if needed
6. **Submit a pull request**

### Contribution Guidelines

- **Code style**: Follow the existing code style and ESLint rules
- **Testing**: Add tests for new features and ensure all tests pass
- **Documentation**: Update documentation for new features
- **Commit messages**: Use clear, descriptive commit messages
- **Pull requests**: Provide clear descriptions of changes

### Areas for Contribution

- **Bug fixes**: Help fix reported issues
- **Documentation**: Improve guides and examples
- **Tests**: Add test coverage
- **Features**: Implement requested features
- **Performance**: Optimize existing code
- **Security**: Improve security measures

## 📚 Learning Resources

### Official Documentation
- [Project README](../../README.md) - Project overview
- [API Documentation](../api/README.md) - REST API reference
- [Architecture Guide](../ARCHITECTURE.md) - System architecture
- [Development Guide](../guides/DEVELOPMENT.md) - Development setup

### External Resources
- **Node.js**: [Official documentation](https://nodejs.org/docs/)
- **SQLite**: [Official documentation](https://www.sqlite.org/docs.html)
- **MCP Protocol**: [Model Context Protocol](https://modelcontextprotocol.io/)
- **Express.js**: [Official documentation](https://expressjs.com/)

### Community Resources
- **Stack Overflow**: Search for [mcp-kanban](https://stackoverflow.com/questions/tagged/mcp-kanban)
- **Reddit**: Check relevant subreddits for discussions
- **Blog Posts**: Community tutorials and guides

## 📞 Contact Information

### Project Maintainers
- **Lead Developer**: [Your Name](mailto:your-email@example.com)
- **Documentation**: [Your Name](mailto:your-email@example.com)
- **Community**: [Your Name](mailto:your-email@example.com)

### Response Times
- **Critical bugs**: Within 24 hours
- **Feature requests**: Within 1 week
- **General questions**: Within 3 days
- **Documentation issues**: Within 1 week

### Support Hours
- **GitHub Issues**: Monitored daily
- **GitHub Discussions**: Monitored daily
- **Discord**: Active during business hours (UTC-8)
- **Email**: Responded to within 3 business days

## 🎯 Getting the Most from Support

### Be Specific
Instead of: "It's not working"
Say: "The CLI command `kanban task create` returns a 401 error when I try to create a task"

### Provide Context
Include relevant information:
- What you're trying to accomplish
- What you've already tried
- Your environment and configuration
- Any error messages or logs

### Be Patient
- Maintainers are volunteers
- Complex issues may take time to investigate
- Community members may be in different time zones

### Follow Up
- If your issue is resolved, mark it as such
- If you find a solution, share it with others
- Thank those who helped you

## 🔄 Support Workflow

### For Users
1. **Check documentation** first
2. **Search existing issues** and discussions
3. **Try troubleshooting steps**
4. **Gather diagnostic information**
5. **Create issue or discussion** with details
6. **Follow up** with additional information if needed

### For Maintainers
1. **Acknowledge** the issue or question
2. **Triage** and categorize appropriately
3. **Investigate** the problem
4. **Provide solution** or workaround
5. **Follow up** to ensure resolution
6. **Document** solution for future reference

---

**Need immediate help?** Check the [Troubleshooting Guide](./troubleshooting.md) for quick solutions, or join our [Discord server](https://discord.gg/your-invite-link) for real-time support. 