{ pkgs }: {
  deps = [
    # Node.js and npm
    pkgs.nodejs-18_x
    pkgs.nodePackages.npm
    pkgs.nodePackages.typescript
    pkgs.nodePackages.ts-node
    
    # Build tools
    pkgs.nodePackages.nodemon
    pkgs.python3
    pkgs.gcc
    pkgs.gnumake
    
    # Database tools
    pkgs.sqlite
    pkgs.sqlitebrowser
    
    # Development tools
    pkgs.git
    pkgs.curl
    pkgs.jq
    pkgs.tree
    
    # Documentation tools
    pkgs.pandoc
    
    # Testing tools
    pkgs.nodePackages.jest
    
    # Security and monitoring
    pkgs.nodePackages.security-audit
  ];
  
  env = {
    NODE_ENV = "development";
    NPM_CONFIG_PREFIX = "${HOME}/.npm-global";
    PATH = "${HOME}/.npm-global/bin:${PATH}";
    DATABASE_URL = "file:./data/kanban.db";
    LOG_LEVEL = "info";
    
    # Replit-specific optimizations
    REPLIT_DB_URL = "${DATABASE_URL}";
    REPLIT_ENVIRONMENT = "true";
    
    # Performance tuning
    NODE_OPTIONS = "--max-old-space-size=2048";
    UV_THREADPOOL_SIZE = "128";
  };
  
  shellHook = ''
    echo "🚀 MCP Kanban Development Environment"
    echo "📦 Node.js $(node --version)"
    echo "📦 npm $(npm --version)"
    echo "📦 TypeScript $(tsc --version)"
    echo ""
    echo "🛠️  Available commands:"
    echo "  npm run dev     - Start development server with hot reload"
    echo "  npm run build   - Build for production"
    echo "  npm run test    - Run test suite"
    echo "  npm run lint    - Check code quality"
    echo "  npm run db:migrate - Run database migrations"
    echo "  npm run db:seed - Seed database with sample data"
    echo ""
    echo "🌐 Server will start on:"
    echo "  Main API: https://$REPL_SLUG.$REPL_OWNER.repl.co"
    echo "  WebSocket: wss://$REPL_SLUG.$REPL_OWNER.repl.co:3456"
    echo ""
    
    # Ensure data directory exists
    mkdir -p data
    
    # Install dependencies if not present
    if [ ! -d "node_modules" ]; then
      echo "📦 Installing dependencies..."
      npm install
    fi
    
    # Run initial setup
    if [ ! -f "data/kanban.db" ]; then
      echo "🗄️  Setting up database..."
      npm run db:migrate
      npm run db:seed
    fi
    
    echo "✅ Environment ready!"
  '';
} 