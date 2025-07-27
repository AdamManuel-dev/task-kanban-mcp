#!/bin/bash

# MCP Kanban Server - Cross-Platform Installation Script
# Supports Linux, macOS, and Windows (via WSL/Git Bash)

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_NAME="mcp-kanban"
REQUIRED_NODE_VERSION="18.0.0"
REQUIRED_NPM_VERSION="9.0.0"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Platform detection
detect_platform() {
    case "$(uname -s)" in
        Linux*)     echo "linux";;
        Darwin*)    echo "macos";;
        CYGWIN*|MINGW*|MSYS*) echo "windows";;
        *)          echo "unknown";;
    esac
}

# Check if running in WSL
is_wsl() {
    if [[ -f /proc/version ]] && grep -q Microsoft /proc/version; then
        return 0
    else
        return 1
    fi
}

# Validate Node.js version
check_node_version() {
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js ${REQUIRED_NODE_VERSION} or higher."
        log_info "Visit https://nodejs.org/ for installation instructions."
        exit 1
    fi

    local node_version=$(node --version | sed 's/v//')
    local required_version=$REQUIRED_NODE_VERSION
    
    if ! node -e "
        const current = process.version.slice(1).split('.').map(Number);
        const required = '${required_version}'.split('.').map(Number);
        const isNewer = current[0] > required[0] || 
                       (current[0] === required[0] && current[1] > required[1]) ||
                       (current[0] === required[0] && current[1] === required[1] && current[2] >= required[2]);
        process.exit(isNewer ? 0 : 1);
    "; then
        log_error "Node.js version ${node_version} is too old. Required: ${REQUIRED_NODE_VERSION} or higher."
        exit 1
    fi
    
    log_success "Node.js version ${node_version} is compatible"
}

# Validate npm version
check_npm_version() {
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed. Please install npm ${REQUIRED_NPM_VERSION} or higher."
        exit 1
    fi

    local npm_version=$(npm --version)
    local required_version=$REQUIRED_NPM_VERSION
    
    if ! node -e "
        const current = '${npm_version}'.split('.').map(Number);
        const required = '${required_version}'.split('.').map(Number);
        const isNewer = current[0] > required[0] || 
                       (current[0] === required[0] && current[1] > required[1]) ||
                       (current[0] === required[0] && current[1] === required[1] && current[2] >= required[2]);
        process.exit(isNewer ? 0 : 1);
    "; then
        log_error "npm version ${npm_version} is too old. Required: ${REQUIRED_NPM_VERSION} or higher."
        exit 1
    fi
    
    log_success "npm version ${npm_version} is compatible"
}

# Create necessary directories
create_directories() {
    log_info "Creating necessary directories..."
    
    mkdir -p data/db
    mkdir -p logs
    mkdir -p backups
    
    log_success "Directories created successfully"
}

# Install dependencies
install_dependencies() {
    log_info "Installing dependencies..."
    
    # Clean install for consistency
    if [ -d "node_modules" ]; then
        log_info "Removing existing node_modules..."
        rm -rf node_modules
    fi
    
    if [ -f "package-lock.json" ]; then
        log_info "Installing dependencies with package-lock.json..."
        npm ci
    else
        log_info "Installing dependencies..."
        npm install
    fi
    
    log_success "Dependencies installed successfully"
}

# Build the project
build_project() {
    log_info "Building the project..."
    
    # Clean previous builds
    if [ -d "dist" ]; then
        log_info "Cleaning previous build..."
        npm run clean
    fi
    
    # Build the project
    npm run build
    
    log_success "Project built successfully"
}

# Verify build artifacts
verify_build() {
    log_info "Verifying build artifacts..."
    
    local required_files=(
        "dist/index.js"
        "dist/server.js"
        "dist/mcp/server.js"
        "dist/cli/index.js"
    )
    
    for file in "${required_files[@]}"; do
        if [ ! -f "$file" ]; then
            log_error "Build verification failed: $file not found"
            exit 1
        fi
    done
    
    log_success "Build artifacts verified successfully"
}

# Set up environment variables
setup_environment() {
    log_info "Setting up environment variables..."
    
    # Create .env file if it doesn't exist
    if [ ! -f ".env" ]; then
        log_info "Creating .env file..."
        cat > .env << EOF
# MCP Kanban Server Configuration
NODE_ENV=development
PORT=3000
MCP_KANBAN_DB_FOLDER_PATH=${SCRIPT_DIR}/data/db
LOG_LEVEL=info
EOF
        log_success ".env file created"
    else
        log_info ".env file already exists"
    fi
}

# Run database migrations
run_migrations() {
    log_info "Running database migrations..."
    
    if npm run migrate:status &> /dev/null; then
        npm run migrate:up
        log_success "Database migrations completed"
    else
        log_warning "Migration system not available, skipping migrations"
    fi
}

# Run database seeding
run_seeding() {
    log_info "Running database seeding..."
    
    if npm run seed:status &> /dev/null; then
        npm run seed:run
        log_success "Database seeding completed"
    else
        log_warning "Seeding system not available, skipping seeding"
    fi
}

# Verify installation
verify_installation() {
    log_info "Verifying installation..."
    
    # Test if the server can start
    if timeout 10s node dist/server.js --help &> /dev/null; then
        log_success "Server startup test passed"
    else
        log_warning "Server startup test failed (this might be normal if server requires specific arguments)"
    fi
    
    # Test if the CLI can start
    if timeout 10s node dist/cli/index.js --help &> /dev/null; then
        log_success "CLI startup test passed"
    else
        log_warning "CLI startup test failed (this might be normal if CLI requires specific arguments)"
    fi
    
    # Test if the MCP server can start
    if timeout 10s node dist/mcp/server.js --help &> /dev/null; then
        log_success "MCP server startup test passed"
    else
        log_warning "MCP server startup test failed (this might be normal if MCP server requires specific arguments)"
    fi
}

# Display installation summary
show_summary() {
    log_success "Installation completed successfully!"
    echo
    echo "🎉 MCP Kanban Server is ready to use!"
    echo
    echo "📁 Installation directory: ${SCRIPT_DIR}"
    echo "🗄️  Database location: ${SCRIPT_DIR}/data/db"
    echo "📝 Logs location: ${SCRIPT_DIR}/logs"
    echo
    echo "🚀 Quick start commands:"
    echo "  • Start the server: npm start"
    echo "  • Start MCP server: npm run start:mcp"
    echo "  • Use CLI: npm run dev:cli"
    echo "  • Run tests: npm test"
    echo
    echo "📚 Next steps:"
    echo "  1. Configure your MCP client (Claude Code, Cursor, etc.)"
    echo "  2. Set up your database path in .env"
    echo "  3. Run 'npm run dev:cli' to explore the CLI"
    echo
    echo "📖 Documentation: docs/"
    echo "🐛 Issues: https://github.com/AdamManuel-dev/task-kanban-mcp/issues"
    echo
}

# Main installation function
main() {
    echo "🚀 MCP Kanban Server Installation"
    echo "=================================="
    echo
    
    # Detect platform
    local platform=$(detect_platform)
    log_info "Detected platform: ${platform}"
    
    if [ "$platform" = "windows" ]; then
        if is_wsl; then
            log_info "Running in WSL (Windows Subsystem for Linux)"
        else
            log_warning "Running on Windows. Consider using WSL for better compatibility."
        fi
    fi
    
    # Change to script directory
    cd "$SCRIPT_DIR"
    
    # Run installation steps
    check_node_version
    check_npm_version
    create_directories
    install_dependencies
    build_project
    verify_build
    setup_environment
    run_migrations
    run_seeding
    verify_installation
    show_summary
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [OPTIONS]"
        echo
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo "  --verify       Only verify installation"
        echo "  --clean        Clean install (remove node_modules and reinstall)"
        echo
        echo "Examples:"
        echo "  $0              # Full installation"
        echo "  $0 --verify     # Verify existing installation"
        echo "  $0 --clean      # Clean installation"
        ;;
    --verify)
        cd "$SCRIPT_DIR"
        verify_installation
        ;;
    --clean)
        cd "$SCRIPT_DIR"
        log_info "Performing clean installation..."
        rm -rf node_modules package-lock.json
        main
        ;;
    "")
        main
        ;;
    *)
        log_error "Unknown option: $1"
        echo "Use --help for usage information"
        exit 1
        ;;
esac 