# Installation Guide

This guide covers installing and setting up the MCP Kanban Server for different environments and use cases.

## 📋 Prerequisites

### System Requirements

#### Server Requirements
- **Operating System**: Linux, macOS, or Windows
- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 9.0.0 or higher (comes with Node.js)
- **Git**: For cloning the repository
- **SQLite**: Version 3.35.0 or higher (usually pre-installed)

#### Client Requirements
- **Node.js**: Version 16.0.0 or higher (for CLI)
- **Modern Browser**: For dashboard (optional)

### Verify Prerequisites

```bash
# Check Node.js version
node --version  # Should output v18.0.0 or higher

# Check npm version
npm --version   # Should output 9.0.0 or higher

# Check SQLite version
sqlite3 --version  # Should show SQLite version 3.35.0 or higher

# Check Git
git --version  # Should show Git version
```

## 🚀 Installation Methods

### Method 1: From Source (Recommended)

#### Step 1: Clone the Repository

```bash
# Clone the repository
git clone https://github.com/yourusername/mcp-kanban.git
cd mcp-kanban

# Or clone a specific branch
git clone -b main https://github.com/yourusername/mcp-kanban.git
cd mcp-kanban
```

#### Step 2: Install Dependencies

```bash
# Install all dependencies
npm install

# This will install:
# - Production dependencies
# - Development dependencies
# - Git hooks for code quality
```

#### Step 3: Set Up Environment

```bash
# Copy the example environment file
cp .env.example .env

# Edit the environment file
nano .env  # or use your preferred editor
```

#### Step 4: Configure Environment Variables

Edit `.env` with your settings:

```bash
# Essential settings
PORT=3000
API_KEY_SECRET=your-secret-key-at-least-16-characters-long
API_KEYS=your-api-key-1,your-api-key-2,your-agent-key

# Database location
DATABASE_PATH=./data/kanban.db

# Development settings
NODE_ENV=development
LOG_LEVEL=debug

# MCP settings
MCP_TOOLS_ENABLED=true
MCP_SERVER_NAME=mcp-kanban
```

#### Step 5: Initialize Database

```bash
# The database will be automatically created on first run
# But you can also initialize it manually:
npm run db:init

# Or run migrations:
npm run db:migrate

# And seed with sample data (optional):
npm run db:seed
```

#### Step 6: Start the Server

```bash
# Development mode with hot-reloading
npm run dev

# Or production mode
npm run build
npm start
```

### Method 2: Using Docker

#### Prerequisites for Docker
- **Docker**: Version 20.10 or higher
- **Docker Compose**: Version 2.0 or higher

#### Step 1: Clone and Configure

```bash
# Clone the repository
git clone https://github.com/yourusername/mcp-kanban.git
cd mcp-kanban

# Copy environment file
cp .env.example .env
```

#### Step 2: Configure Environment

Edit `.env` for Docker:

```bash
# Docker-specific settings
DATABASE_PATH=/app/data/kanban.db
NODE_ENV=production
LOG_LEVEL=info

# Other settings remain the same
PORT=3000
API_KEY_SECRET=your-secret-key
API_KEYS=your-api-key-1,your-api-key-2
```

#### Step 3: Build and Run

```bash
# Build the Docker image
docker-compose build

# Start the services
docker-compose up -d

# View logs
docker-compose logs -f
```

#### Step 4: Access the Server

```bash
# Check if the server is running
curl http://localhost:3000/health

# Expected response:
# {
#   "status": "healthy",
#   "version": "0.1.0",
#   "database": {
#     "connected": true,
#     "responsive": true
#   }
# }
```

### Method 3: Using npm (Global Installation)

#### Step 1: Install Globally

```bash
# Install the CLI globally
npm install -g @task-kanban-mcp/cli

# Verify installation
kanban --version
```

#### Step 2: Set Up Server

```bash
# Create a new directory for your server
mkdir my-kanban-server
cd my-kanban-server

# Initialize a new server
kanban server init

# This will:
# - Create necessary directories
# - Set up environment file
# - Initialize database
# - Start the server
```

#### Step 3: Configure

```bash
# Configure the server
kanban config set api-url http://localhost:3000
kanban config set api-key your-api-key
```

## 🔧 CLI Installation

### Global CLI Installation

```bash
# Install CLI globally
npm install -g @task-kanban-mcp/cli

# Verify installation
kanban --help
```

### Local CLI Development

```bash
# Clone the repository
git clone https://github.com/yourusername/mcp-kanban.git
cd mcp-kanban

# Install dependencies
npm install

# Build CLI
npm run build:cli

# Use local CLI
./dist/cli/index.js --help
```

### CLI Configuration

```bash
# Set up CLI configuration
kanban config set api-url http://localhost:3000
kanban config set api-key your-api-key

# Test connection
kanban config test

# View current configuration
kanban config list
```

## 🐳 Docker Installation

### Using Docker Compose (Recommended)

#### Step 1: Create docker-compose.yml

```yaml
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
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

#### Step 2: Create .env file

```bash
# .env
API_KEY_SECRET=your-secret-key-at-least-16-characters-long
API_KEYS=your-api-key-1,your-api-key-2,your-agent-key
```

#### Step 3: Build and Run

```bash
# Build the image
docker-compose build

# Start the service
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f mcp-kanban
```

### Using Docker Run

```bash
# Build the image
docker build -t mcp-kanban .

# Run the container
docker run -d \
  --name mcp-kanban \
  -p 3000:3000 \
  -e API_KEY_SECRET=your-secret-key \
  -e API_KEYS=your-api-key-1,your-api-key-2 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  mcp-kanban
```

## 🔐 Security Setup

### API Key Generation

```bash
# Generate a secure API key
openssl rand -hex 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Environment Security

```bash
# Set proper file permissions
chmod 600 .env
chmod 700 ./data

# For production, use environment variables
export API_KEY_SECRET=your-secret-key
export API_KEYS=your-api-key-1,your-api-key-2
```

### Database Security

```bash
# Set database file permissions
chmod 644 ./data/kanban.db

# For production, consider using a more secure database
# like PostgreSQL with proper authentication
```

## 🧪 Verification

### Test Server Installation

```bash
# Test health endpoint
curl http://localhost:3000/health

# Test API access
curl -X POST http://localhost:3000/api/v1/boards \
  -H "X-API-Key: your-api-key-1" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Board",
    "description": "Testing installation"
  }'
```

### Test CLI Installation

```bash
# Test CLI connection
kanban config test

# Create a test board
kanban board create "Test Board"

# List boards
kanban board list
```

### Test MCP Integration

```bash
# Test MCP server
curl http://localhost:3000/mcp/health

# Test MCP tools (if configured)
# This requires an MCP client like Claude Code
```

## 🔄 Updates and Maintenance

### Updating from Source

```bash
# Pull latest changes
git pull origin main

# Install updated dependencies
npm install

# Run migrations if needed
npm run db:migrate

# Restart the server
npm run dev
```

### Updating Docker Installation

```bash
# Pull latest image
docker-compose pull

# Rebuild if needed
docker-compose build

# Restart services
docker-compose up -d
```

### Updating CLI

```bash
# Update global CLI
npm update -g @task-kanban-mcp/cli

# Or reinstall
npm uninstall -g @task-kanban-mcp/cli
npm install -g @task-kanban-mcp/cli
```

## 🚨 Troubleshooting

### Common Installation Issues

#### Node.js Version Issues

```bash
# Check Node.js version
node --version

# If version is too old, update Node.js
# On macOS with Homebrew:
brew install node@18

# On Ubuntu/Debian:
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# On Windows:
# Download from https://nodejs.org/
```

#### Permission Issues

```bash
# Fix npm permissions
sudo chown -R $USER:$GROUP ~/.npm
sudo chown -R $USER:$GROUP ~/.config

# Or use nvm to avoid permission issues
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

#### Port Already in Use

```bash
# Check what's using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or use a different port
PORT=8080 npm run dev
```

#### Database Issues

```bash
# Check database file permissions
ls -la ./data/kanban.db

# Fix permissions
chmod 644 ./data/kanban.db

# Reinitialize database
rm ./data/kanban.db
npm run db:init
```

### Docker Issues

#### Container Won't Start

```bash
# Check container logs
docker-compose logs mcp-kanban

# Check container status
docker-compose ps

# Restart container
docker-compose restart mcp-kanban
```

#### Volume Mount Issues

```bash
# Check volume permissions
ls -la ./data

# Fix permissions
sudo chown -R $USER:$USER ./data

# Recreate container
docker-compose down
docker-compose up -d
```

## 📚 Next Steps

After successful installation:

1. **Configure your environment**: See [Configuration Guide](./configuration.md)
2. **Learn the CLI**: See [CLI Usage Guide](./cli-usage.md)
3. **Set up MCP integration**: See [MCP Integration Guide](./mcp-integration.md)
4. **Create your first board**: See [Quick Start Tutorial](./quick-start.md)

## 🆘 Getting Help

If you encounter issues during installation:

1. **Check the logs**: Look at server logs for error messages
2. **Verify prerequisites**: Ensure all required software is installed
3. **Check permissions**: Ensure proper file and directory permissions
4. **Search issues**: Check [GitHub Issues](https://github.com/yourusername/mcp-kanban/issues)
5. **Ask for help**: Use [GitHub Discussions](https://github.com/yourusername/mcp-kanban/discussions)

---

**Installation complete?** Move on to the [Configuration Guide](./configuration.md) to set up your environment properly. 