# MCP Kanban - Claude Desktop Extension

Transform your Claude Desktop experience with intelligent task management, project analytics, and AI-powered productivity insights.

## 🚀 Features

- **Smart Task Management**: Create, organize, and track tasks with AI assistance
- **Project Analytics**: Get insights into team productivity and project progress
- **Dependency Analysis**: Visualize task dependencies and critical paths
- **Real-time Collaboration**: Live updates across team members
- **Git Integration**: Automatic board selection based on your current branch
- **Template System**: Standardize task creation with smart templates

## 📦 Installation

### Method 1: Direct Installation (Recommended)

1. **Download the Extension**
   ```bash
   git clone https://github.com/yourusername/mcp-kanban.git
   cd mcp-kanban
   ```

2. **Build the Extension**
   ```bash
   npm install
   npm run build
   ```

3. **Configure Claude Desktop**
   Add the following to your Claude Desktop MCP configuration:
   ```json
   {
     "mcpServers": {
       "mcp-kanban": {
         "command": "node",
         "args": ["path/to/mcp-kanban/dist/mcp/index.js"],
         "env": {
           "NODE_ENV": "production"
         }
       }
     }
   }
   ```

### Method 2: Package Installation

1. **Install from Package**
   ```bash
   npm install -g mcp-kanban
   ```

2. **Configure Claude Desktop**
   ```json
   {
     "mcpServers": {
       "mcp-kanban": {
         "command": "mcp-kanban",
         "args": ["--mode", "mcp"]
       }
     }
   }
   ```

## ⚙️ Configuration

### Required Settings

- **Server URL**: Your MCP Kanban server endpoint (e.g., `http://localhost:3000`)
- **API Key**: Authentication key for accessing your Kanban data

### Optional Settings

- **Default Board**: Default board to use for new tasks
- **Enable Analytics**: Turn on/off analytics features
- **Enable Real-time**: Enable WebSocket for live updates
- **Git Integration**: Automatic branch-to-board mapping

### Example Configuration

```json
{
  "serverUrl": "http://localhost:3000",
  "apiKey": "your-api-key-here",
  "defaultBoard": "main-project",
  "enableAnalytics": true,
  "enableRealtime": true,
  "gitIntegration": true
}
```

## 🎯 Usage Examples

### Basic Task Management

**Create a new task:**
```
Claude, create a task titled "Implement user authentication" with high priority and assign it to john@example.com
```

**Update task status:**
```
Claude, move task AUTH-123 to "In Progress" and add a note about the current blocker
```

**List tasks by criteria:**
```
Claude, show me all high-priority tasks assigned to the frontend team that are due this week
```

### Advanced Features

**Analyze project dependencies:**
```
Claude, show me the critical path for the user management project and identify any bottlenecks
```

**Get productivity insights:**
```
Claude, generate a team productivity report for the last sprint with completion rates and velocity trends
```

**Create from templates:**
```
Claude, create a bug report task for the login issue using the standard bug template
```

### Analytics and Reporting

**Project status overview:**
```
Claude, give me a comprehensive status update on all active projects with key metrics and upcoming deadlines
```

**Team performance analysis:**
```
Claude, analyze team performance for Q4 and suggest improvements based on velocity and completion patterns
```

**Resource planning:**
```
Claude, help me plan the next sprint by analyzing current velocity and suggesting optimal task allocation
```

## 🛠️ Available Commands

### Task Management
- `create_task` - Create new tasks with full metadata
- `update_task` - Modify existing tasks
- `delete_task` - Remove tasks and dependencies
- `list_tasks` - Query tasks with filters
- `search_tasks` - Full-text search across tasks

### Subtasks & Dependencies
- `create_subtask` - Break down complex tasks
- `add_dependency` - Link related tasks
- `get_critical_path` - Analyze project timelines
- `visualize_dependencies` - Generate dependency graphs

### Board Management
- `create_board` - Set up new project boards
- `list_boards` - View available boards
- `get_board_analytics` - Board-specific metrics

### Analytics & Insights
- `get_analytics` - Comprehensive analytics data
- `get_velocity_metrics` - Team velocity tracking
- `get_productivity_insights` - Performance analysis
- `generate_reports` - Custom report generation

### Templates & Automation
- `create_template` - Define task templates
- `list_templates` - Browse available templates
- `apply_template` - Use templates for consistency

### Backup & Data
- `backup_data` - Create data backups
- `export_data` - Export in various formats
- `get_system_health` - Monitor system status

## 🎨 Keyboard Shortcuts

- `Ctrl+Shift+T` (Windows/Linux) / `Cmd+Shift+T` (macOS) - Quick task creation
- Access additional commands through Claude's command palette

## 🔧 Troubleshooting

### Common Issues

**Connection Failed**
```
Issue: Unable to connect to MCP Kanban server
Solution: 
1. Verify server URL is correct
2. Check that the server is running
3. Validate API key permissions
4. Test connectivity: curl http://your-server/api/health
```

**Authentication Errors**
```
Issue: API key authentication failed
Solution:
1. Verify API key is correct
2. Check key permissions in server settings
3. Ensure key hasn't expired
4. Test with: curl -H "Authorization: Bearer YOUR_KEY" http://your-server/api/boards
```

**Real-time Updates Not Working**
```
Issue: WebSocket connection fails
Solution:
1. Check firewall settings
2. Verify WebSocket support in network
3. Try disabling enableRealtime temporarily
4. Check server WebSocket configuration
```

### Performance Optimization

**Slow Response Times**
```
Solutions:
1. Enable caching in server configuration
2. Use filters to limit data queries
3. Consider local database setup
4. Monitor network latency
```

**High Memory Usage**
```
Solutions:
1. Limit real-time subscription scope
2. Reduce analytics data retention
3. Clear old backup files
4. Restart Claude Desktop periodically
```

### Debug Mode

Enable debug logging:
```json
{
  "mcpServers": {
    "mcp-kanban": {
      "command": "node",
      "args": ["dist/mcp/index.js", "--debug"],
      "env": {
        "DEBUG": "mcp-kanban:*",
        "LOG_LEVEL": "debug"
      }
    }
  }
}
```

## 📚 Advanced Configuration

### Custom Server Setup

For advanced users running their own MCP Kanban server:

```json
{
  "serverUrl": "https://kanban.yourcompany.com",
  "apiKey": "your-enterprise-key",
  "customEndpoints": {
    "analytics": "/api/v2/analytics",
    "websocket": "wss://kanban.yourcompany.com/ws"
  },
  "ssl": {
    "enabled": true,
    "certificate": "/path/to/cert.pem"
  }
}
```

### Multi-tenant Configuration

For organizations with multiple teams:

```json
{
  "tenant": "engineering-team",
  "serverUrl": "https://kanban.enterprise.com",
  "apiKey": "team-specific-key",
  "defaultBoard": "engineering-sprint",
  "teamSettings": {
    "sprintLength": 14,
    "workingHours": {
      "start": "09:00",
      "end": "17:00"
    }
  }
}
```

## 🔒 Security

- API keys are stored securely in Claude Desktop's encrypted storage
- All communications use HTTPS/WSS when available
- Local data is cached temporarily and cleared on exit
- No sensitive data is logged in debug mode

## 🆘 Support

- **Documentation**: [Full docs](https://github.com/yourusername/mcp-kanban/docs)
- **Issues**: [GitHub Issues](https://github.com/yourusername/mcp-kanban/issues)
- **Community**: [Discord Server](https://discord.gg/mcp-kanban)
- **Email**: support@mcp-kanban.com

## 📄 License

MIT License - see [LICENSE](../LICENSE) for details.

## 🚀 What's Next

Try these example conversations to get started:

```
"Claude, help me set up a new project board for our mobile app development"

"Claude, analyze our team's velocity over the last 3 sprints and suggest improvements"

"Claude, create a comprehensive project status report for the stakeholder meeting"

"Claude, identify the critical path for our product launch and highlight any risks"
```

Experience the future of AI-powered project management with MCP Kanban! 🎉 