# 🚀 MCP Kanban - Replit Template

[![Run on Repl.it](https://replit.com/badge/github/yourusername/mcp-kanban)](https://replit.com/new/github/yourusername/mcp-kanban)

Transform your project management with AI-powered task organization, analytics, and team collaboration - all running seamlessly in Replit!

## ⚡ Quick Start

1. **Click "Run on Repl.it" above** or [fork this template](https://replit.com/new/github/yourusername/mcp-kanban)
2. **Wait for automatic setup** - dependencies and database will be configured automatically
3. **Start managing tasks!** - Your kanban board will be available immediately

## 🎯 What You Get

### 🤖 AI-Powered Features
- **Smart Task Prioritization** - AI analyzes deadlines, dependencies, and context
- **Intelligent Suggestions** - Get recommendations for task organization
- **Contextual Analytics** - Insights based on your work patterns
- **Git Integration** - Automatic board selection based on your current branch

### 📊 Advanced Analytics
- **Team Velocity Tracking** - Monitor productivity trends
- **Critical Path Analysis** - Identify project bottlenecks
- **Burndown Charts** - Visual progress tracking
- **Performance Insights** - Data-driven optimization

### 🔄 Real-time Collaboration
- **Live Updates** - See changes instantly across team members
- **WebSocket Integration** - Real-time notifications and sync
- **Multi-user Support** - Seamless team collaboration
- **Activity Streams** - Track all project activity

## 🛠️ Development Setup

### Automatic Setup (Recommended)
Replit will automatically:
- Install all dependencies
- Build the application
- Set up the SQLite database
- Run initial migrations
- Seed with sample data

### Manual Setup (If Needed)
```bash
# Install dependencies and build
npm run setup:replit

# Or step by step:
npm install
npm run build
npm run db:migrate
npm run db:seed
```

## 🎮 Available Commands

### Quick Actions (Use Replit Shell)
```bash
# Start development server
npm run dev:replit

# Run production server
npm run start:replit

# Database operations
npm run db:migrate     # Run migrations
npm run db:seed        # Add sample data
npm run db:reset       # Reset and reseed database

# Testing
npm test              # Run all tests
npm run test:coverage # Test with coverage

# Code quality
npm run lint          # Check code style
npm run typecheck     # TypeScript validation
```

## 🌐 Accessing Your Application

### Web Interface
- **Main Application**: Your Replit URL (shown in the output)
- **API Endpoints**: `https://your-repl.replit.dev/api/`
- **Health Check**: `https://your-repl.replit.dev/api/health`

### API Examples
```bash
# Test the API (replace with your Replit URL)
curl https://your-repl.replit.dev/api/health

# Create a board
curl -X POST https://your-repl.replit.dev/api/boards \
  -H "Content-Type: application/json" \
  -d '{"name": "My Project", "description": "Project management board"}'

# List tasks
curl https://your-repl.replit.dev/api/tasks
```

## 🔧 Configuration

### Environment Variables
Replit automatically configures these for you:

```bash
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
DATABASE_URL=file:./data/kanban.db
ENABLE_ANALYTICS=true
ENABLE_WEBSOCKETS=true
```

### Custom Configuration
Edit the environment variables in Replit's "Secrets" tab for:
- `API_SECRET_KEY` - Your custom API secret
- `JWT_SECRET` - JWT signing secret
- Custom database URLs or other settings

## 🤝 Claude Desktop Integration

### Setup MCP Connection
1. **Get Your Replit URL** from the output panel
2. **Configure Claude Desktop** with this config:

```json
{
  "mcpServers": {
    "mcp-kanban": {
      "command": "npx",
      "args": ["mcp-kanban-client"],
      "env": {
        "SERVER_URL": "https://your-repl.replit.dev",
        "API_KEY": "your-api-key-here"
      }
    }
  }
}
```

3. **Start Using with Claude**:
   ```
   Claude, create a new task for implementing user authentication
   Claude, show me the critical path for our current sprint
   Claude, analyze team productivity for the last week
   ```

## 📱 Sample Usage

### Basic Task Management
```bash
# Create a new board
curl -X POST https://your-repl.replit.dev/api/boards \
  -H "Content-Type: application/json" \
  -d '{"name": "Sprint 1", "description": "First development sprint"}'

# Add a task
curl -X POST https://your-repl.replit.dev/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Implement user login",
    "description": "Add authentication system",
    "priority": 3,
    "due_date": "2024-01-15"
  }'
```

### Analytics & Insights
```bash
# Get analytics dashboard
curl https://your-repl.replit.dev/api/analytics/dashboard

# Get team velocity
curl https://your-repl.replit.dev/api/analytics/velocity

# Generate dependency graph
curl https://your-repl.replit.dev/api/dependencies/graph
```

## 🎨 Customization

### Adding Your Data
1. **Replace Sample Data**: Clear existing data and add your projects
   ```bash
   npm run db:reset
   # Then add your boards/tasks through the API
   ```

2. **Import Existing Data**: Use the bulk import API endpoints
   ```bash
   curl -X POST https://your-repl.replit.dev/api/import \
     -H "Content-Type: application/json" \
     -d @your-data.json
   ```

### Extending Functionality
- **Custom Templates**: Add task templates in the UI
- **Webhooks**: Configure integrations with external tools
- **Custom Analytics**: Use the analytics API for custom dashboards

## 🔍 Troubleshooting

### Common Issues

**Database Errors**
```bash
# Reset database
npm run db:reset
npm run db:seed
```

**Build Failures**
```bash
# Clean rebuild
rm -rf node_modules dist
npm install
npm run build
```

**Port Conflicts**
- Replit automatically manages ports
- Main app runs on port 3000
- WebSocket server runs on port 3456

### Getting Help
- **Logs**: Check the Replit console for error messages
- **Health Check**: Visit `/api/health` to verify server status
- **Database**: Use the Replit database viewer for SQLite
- **Support**: [GitHub Issues](https://github.com/yourusername/mcp-kanban/issues)

## 🚀 Going to Production

### From Replit to Production
1. **Export Your Data**:
   ```bash
   curl https://your-repl.replit.dev/api/export > backup.json
   ```

2. **Deploy Elsewhere**:
   - **Vercel**: Deploy the `dist` folder
   - **Railway**: Connect your GitHub repo
   - **DigitalOcean**: Use App Platform
   - **AWS**: Lambda functions + RDS

3. **Environment Setup**:
   - Set production environment variables
   - Configure proper database (PostgreSQL/MySQL)
   - Set up SSL certificates
   - Configure proper CORS origins

### Performance Optimization
```bash
# Optimize for production
NODE_ENV=production npm run build
npm run start:production
```

## 📊 Features Showcase

### 🎯 Smart Prioritization
- AI analyzes task complexity, deadlines, and dependencies
- Learns from your priority adjustments
- Considers Git branch context and team patterns

### 📈 Advanced Analytics
- Sprint velocity tracking and prediction
- Team performance insights
- Critical path analysis with bottleneck identification
- Custom KPI dashboards

### 🔄 Real-time Collaboration
- Live task updates across team members
- WebSocket-powered notifications
- Activity streams and audit logs
- Conflict resolution for concurrent edits

### 🤖 AI Integration
- Natural language task creation
- Intelligent task suggestions
- Automated dependency detection
- Context-aware recommendations

## 🎉 Next Steps

1. **Explore the API**: Visit `/api/docs` for interactive documentation
2. **Connect Claude Desktop**: Set up MCP integration for AI assistance
3. **Invite Your Team**: Share your Replit URL for collaboration
4. **Customize Workflows**: Set up templates and automation rules
5. **Scale Up**: Export to production when ready

---

**🌟 Star this template** if you found it helpful!

**🔗 Share your projects** built with this template - we'd love to see what you create!

**📢 Join the community** for tips, tricks, and advanced usage patterns.

Happy project management! 🚀