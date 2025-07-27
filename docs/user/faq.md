# Frequently Asked Questions (FAQ)

This FAQ covers the most common questions about MCP Kanban Server, CLI usage, and AI agent integration.

## 🚀 Getting Started

### Q: What is MCP Kanban Server?

**A:** MCP Kanban Server is a headless kanban task management system designed specifically for AI agents and human supervisors to coordinate software development work. It frees up AI agent context windows by externalizing project management, allowing agents to focus on coding tasks.

### Q: How is this different from other kanban tools?

**A:** Unlike traditional kanban tools, MCP Kanban is:
- **Agent-first**: Designed specifically for AI coding agents
- **MCP-integrated**: Uses Model Context Protocol for seamless AI integration
- **Context-aware**: Provides rich context for tasks without consuming agent memory
- **Real-time**: WebSocket updates for live monitoring
- **CLI-focused**: Command-line interface for human supervisors

### Q: What are the system requirements?

**A:** 
- **Server**: Node.js 18.0.0+, npm 9.0.0+, SQLite 3.35.0+
- **CLI**: Node.js 16.0.0+
- **Memory**: 512MB minimum, 2GB recommended
- **Storage**: 1GB minimum for database and logs

### Q: How do I install MCP Kanban?

**A:** See the [Installation Guide](./installation.md) for detailed instructions. The quick version:

```bash
# Install CLI
npm install -g @task-kanban-mcp/cli

# Clone and setup server
git clone https://github.com/yourusername/mcp-kanban.git
cd mcp-kanban
npm install
cp .env.example .env
npm run dev
```

## 🔧 Configuration

### Q: How do I generate secure API keys?

**A:** Use one of these methods:

```bash
# Using OpenSSL
openssl rand -hex 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Using Python
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### Q: What environment variables do I need to set?

**A:** The essential variables are:

```bash
PORT=3000                                    # Server port
API_KEY_SECRET=your-secret-key-32-chars      # Secret for API keys
API_KEYS=key1,key2,key3                      # Valid API keys
DATABASE_PATH=./data/kanban.db               # Database location
MCP_TOOLS_ENABLED=true                       # Enable MCP server
```

### Q: How do I configure the CLI?

**A:** Use the `kanban config` command:

```bash
# Set up connection
kanban config set api-url http://localhost:3000
kanban config set api-key your-api-key

# Test configuration
kanban config test

# View all settings
kanban config list
```

### Q: Can I use different API keys for different purposes?

**A:** Yes! You can use different keys for different clients:

```bash
# Server configuration
API_KEYS=admin-key,agent-key,cli-key,mcp-key

# Different clients use different keys
# CLI: cli-key
# AI Agents: agent-key
# MCP: mcp-key
# Admin tools: admin-key
```

## 🤖 AI Agent Integration

### Q: What is MCP (Model Context Protocol)?

**A:** MCP is a protocol that allows AI assistants to interact with external tools and data sources. It enables AI agents to:
- Access task information without consuming context window space
- Get real-time updates on project status
- Coordinate with other agents and human supervisors
- Maintain project context across sessions

### Q: Which AI assistants support MCP?

**A:** Currently supported:
- **Claude Code**: Full MCP support
- **Cursor**: Full MCP support
- **Aider**: Full MCP support
- **Other MCP-compatible assistants**

### Q: How do I configure MCP for my AI assistant?

**A:** Create `.mcp/config.json` in your project:

```json
{
  "servers": {
    "kanban": {
      "command": "mcp-kanban",
      "args": ["--api-key", "your-agent-key"],
      "env": {
        "MCP_KANBAN_URL": "http://localhost:3000"
      }
    }
  }
}
```

### Q: What MCP tools are available?

**A:** The main tools include:
- `get_next_task` - Get next available task with context
- `create_task` - Create new tasks
- `update_task` - Update task status and progress
- `search_tasks` - Search for tasks
- `get_context` - Get project context
- `prioritize_tasks` - Get task priorities

### Q: How do AI agents coordinate to avoid conflicts?

**A:** The system provides several mechanisms:
- **Task locking**: Only one agent can work on a task at a time
- **Dependency management**: Agents wait for dependencies to complete
- **Boundary enforcement**: Agents can be restricted to specific file/module areas
- **Real-time updates**: All agents see task changes immediately

## 📊 Usage and Workflows

### Q: How do I create my first board and tasks?

**A:** 

```bash
# Create a board
kanban board create "My Project"

# Create tasks
kanban task create "Set up development environment" --priority high
kanban task create "Implement authentication" --priority high
kanban task create "Write documentation" --priority medium

# List tasks
kanban task list
```

### Q: How do I manage task dependencies?

**A:** 

```bash
# Create tasks
kanban task create "Design database schema" --priority high
kanban task create "Implement database layer" --priority high

# Set dependency (task 2 depends on task 1)
kanban task depend 2 1

# Check dependencies
kanban task deps 2

# View dependency graph
kanban task deps 2 --graph
```

### Q: How do I use tags and notes?

**A:** 

```bash
# Create tags
kanban tag create "backend"
kanban tag create "frontend"
kanban tag create "bug"

# Add tags to tasks
kanban tag add 1 backend
kanban tag add 2 frontend

# Create notes
kanban note add "Design decision" \
  --content "Using JWT for authentication" \
  --category "technical"

# Search notes
kanban note search "JWT"
```

### Q: How do I monitor progress in real-time?

**A:** 

```bash
# Launch dashboard
kanban dashboard

# Watch specific board
kanban watch --board "My Project"

# Watch specific tasks
kanban watch --tasks 1,2,3

# Get next suggested task
kanban next
```

### Q: How do I export and backup data?

**A:** 

```bash
# Create backup
kanban backup create

# Export board data
kanban export --board "My Project" --format json

# Export specific tasks
kanban export --tasks 1,2,3 --format csv

# Import data
kanban import --file tasks.yaml --board "My Project"
```

## 🔧 Troubleshooting

### Q: The server won't start. What should I check?

**A:** Check these common issues:

```bash
# 1. Check Node.js version
node --version  # Should be 18.0.0+

# 2. Check if port is in use
lsof -i :3000

# 3. Check environment file
ls -la .env

# 4. Check database permissions
ls -la ./data/kanban.db

# 5. Check logs
npm run dev  # Look for error messages
```

### Q: CLI says "Connection failed". What's wrong?

**A:** 

```bash
# 1. Check server is running
curl http://localhost:3000/health

# 2. Check API key
kanban config get api-key

# 3. Test connection
kanban config test

# 4. Check server logs for authentication errors
```

### Q: MCP integration isn't working. How do I debug?

**A:** 

```bash
# 1. Check MCP server is enabled
curl http://localhost:3000/mcp/health

# 2. Verify MCP configuration
cat .mcp/config.json

# 3. Check MCP API key
echo $MCP_KANBAN_API_KEY

# 4. Test MCP tools manually
# (This depends on your AI assistant)
```

### Q: Database is corrupted or missing. How do I fix it?

**A:** 

```bash
# 1. Check database file
ls -la ./data/kanban.db

# 2. Backup existing data (if any)
cp ./data/kanban.db ./data/kanban.db.backup

# 3. Reinitialize database
rm ./data/kanban.db
npm run db:init

# 4. Run migrations
npm run db:migrate

# 5. Seed with sample data (optional)
npm run db:seed
```

### Q: Performance is slow. How do I optimize?

**A:** 

```bash
# 1. Enable database optimizations
DATABASE_WAL_MODE=true
DATABASE_MEMORY_LIMIT=1073741824  # 1GB

# 2. Optimize API settings
RATE_LIMIT_MAX_REQUESTS=500
REQUEST_TIMEOUT=60000

# 3. Enable compression
COMPRESSION_ENABLED=true

# 4. Monitor performance
kanban monitor --metrics cpu,memory,disk
```

## 🔐 Security

### Q: How secure is the API key authentication?

**A:** The system uses:
- **Secure hashing**: API keys are hashed using bcrypt
- **Rate limiting**: Prevents brute force attacks
- **Input validation**: All inputs are sanitized
- **HTTPS support**: When configured with reverse proxy
- **Audit logging**: All API calls are logged

### Q: Can I use HTTPS in production?

**A:** Yes! Configure a reverse proxy (nginx, Apache) or use a service like:
- **Cloudflare Tunnel**
- **ngrok** (for development)
- **Traefik** (for Docker deployments)

### Q: How do I rotate API keys?

**A:** 

```bash
# 1. Generate new keys
openssl rand -hex 32

# 2. Update server configuration
# Edit .env file with new API_KEYS

# 3. Update client configurations
kanban config set api-key new-api-key

# 4. Restart server
npm run dev

# 5. Test new keys
kanban config test
```

## 📈 Performance and Scaling

### Q: How many tasks can the system handle?

**A:** The system can handle:
- **10,000+ tasks** with good performance
- **100+ concurrent users** with proper configuration
- **Real-time updates** for all connected clients
- **Large databases** (several GB) with SQLite optimizations

### Q: How do I scale for larger teams?

**A:** 

```bash
# 1. Optimize database
DATABASE_MEMORY_LIMIT=2147483648  # 2GB
DATABASE_CACHE_SIZE=50000

# 2. Increase rate limits
RATE_LIMIT_MAX_REQUESTS=2000

# 3. Enable monitoring
METRICS_ENABLED=true

# 4. Use load balancer for multiple instances
# (Advanced setup required)
```

### Q: Can I use a different database?

**A:** Currently, the system uses SQLite for simplicity. For production scaling, consider:
- **PostgreSQL**: Better for concurrent access
- **MySQL**: Good performance and reliability
- **MongoDB**: Document-based storage

Database migration would require code changes.

## 🔄 Integration and Automation

### Q: Can I integrate with CI/CD pipelines?

**A:** Yes! Use the REST API:

```bash
# Create task from CI
curl -X POST http://localhost:3000/api/v1/tasks \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Deploy to production",
    "description": "Automated deployment",
    "priority": "high"
  }'

# Update task status
curl -X PATCH http://localhost:3000/api/v1/tasks/1 \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"status": "done"}'
```

### Q: Can I automate task creation from Git commits?

**A:** Yes! Use Git hooks or webhooks:

```bash
# Git hook example
#!/bin/bash
# .git/hooks/post-commit

COMMIT_MSG=$(git log -1 --pretty=%B)
TASK_TITLE="Review: $COMMIT_MSG"

curl -X POST http://localhost:3000/api/v1/tasks \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d "{
    \"title\": \"$TASK_TITLE\",
    \"description\": \"Review commit: $COMMIT_MSG\",
    \"priority\": \"medium\"
  }"
```

### Q: Can I integrate with other tools?

**A:** The REST API allows integration with:
- **Slack**: Webhook notifications
- **Discord**: Bot integration
- **Email**: Automated reports
- **Calendar**: Task scheduling
- **Project management tools**: Import/export

## 🆘 Support and Community

### Q: Where can I get help?

**A:** 
- **Documentation**: Check the [full documentation](./README.md)
- **GitHub Issues**: Report bugs and request features
- **GitHub Discussions**: Ask questions and share experiences
- **Community**: Join our Discord server (link in README)

### Q: How do I report a bug?

**A:** 
1. Check if it's already reported in [GitHub Issues](https://github.com/yourusername/mcp-kanban/issues)
2. Create a new issue with:
   - Clear description of the problem
   - Steps to reproduce
   - Expected vs actual behavior
   - System information (OS, Node.js version, etc.)
   - Logs and error messages

### Q: Can I contribute to the project?

**A:** Yes! We welcome contributions:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for detailed guidelines.

### Q: Is there a roadmap for future features?

**A:** Yes! Planned features include:
- **Vector embeddings** for semantic task search
- **Pattern learning** from completed tasks
- **Advanced analytics** and reporting
- **Plugin system** for custom integrations
- **Multi-database support** (PostgreSQL, MySQL)

## 💡 Tips and Best Practices

### Q: What are some best practices for task management?

**A:** 
1. **Clear titles**: Use action-oriented, descriptive titles
2. **Rich descriptions**: Include acceptance criteria and context
3. **Proper tagging**: Use tags for categorization and filtering
4. **Regular updates**: Keep task status current
5. **Dependency management**: Set up clear task dependencies
6. **Progress notes**: Document important decisions and progress

### Q: How do I optimize for AI agent productivity?

**A:** 
1. **Task sizing**: Keep tasks under 50k tokens of required context
2. **Clear boundaries**: Define explicit file/module boundaries
3. **Context sharing**: Use notes to share context between agents
4. **Dependency chains**: Keep chains shallow for maximum parallelism
5. **Regular monitoring**: Use dashboard to track agent progress

### Q: What's the best way to organize large projects?

**A:** 
1. **Multiple boards**: Use separate boards for different phases/teams
2. **Hierarchical tags**: Use parent-child tag relationships
3. **Epic tasks**: Break large features into smaller, manageable tasks
4. **Dependency visualization**: Use dependency graphs to understand relationships
5. **Regular reviews**: Schedule regular project reviews and cleanup

---

**Still have questions?** Check the [Troubleshooting Guide](./troubleshooting.md) for more detailed solutions, or ask in [GitHub Discussions](https://github.com/yourusername/mcp-kanban/discussions). 