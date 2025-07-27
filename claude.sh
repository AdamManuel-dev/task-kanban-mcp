#!/bin/bash

# Claude Code MCP Integration Script
# Automatically configures Claude Code to use the MCP Kanban server

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_NAME="kanban-mcp"
SERVER_PATH="${SCRIPT_DIR}/dist/mcp/server.js"

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

# Check if Claude CLI is available
check_claude_cli() {
    if ! command -v claude &> /dev/null; then
        log_error "Claude CLI is not installed or not in PATH"
        log_info "Please install Claude Code from https://claude.ai/code"
        log_info "After installation, make sure the 'claude' command is available in your PATH"
        exit 1
    fi
    
    log_success "Claude CLI found"
}

# Check if server file exists
check_server_file() {
    if [ ! -f "$SERVER_PATH" ]; then
        log_error "MCP server file not found: $SERVER_PATH"
        log_info "Please run the installation script first: ./install.sh"
        exit 1
    fi
    
    log_success "MCP server file found: $SERVER_PATH"
}

# Get absolute path for the server
get_absolute_server_path() {
    # Convert to absolute path and normalize for the current platform
    local abs_path=$(realpath "$SERVER_PATH")
    
    # On Windows, convert backslashes to forward slashes for JSON
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
        abs_path=$(echo "$abs_path" | sed 's/\\/\//g')
    fi
    
    echo "$abs_path"
}

# Create MCP configuration JSON
create_mcp_config() {
    local server_path=$(get_absolute_server_path)
    local db_path="${SCRIPT_DIR}/data/db"
    
    # Convert db_path to absolute and normalize
    db_path=$(realpath "$db_path")
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
        db_path=$(echo "$db_path" | sed 's/\\/\//g')
    fi
    
    cat << EOF
{
  "command": "node",
  "args": ["$server_path"],
  "env": {
    "MCP_KANBAN_DB_FOLDER_PATH": "$db_path"
  }
}
EOF
}

# Add MCP server to Claude Code
add_mcp_server() {
    log_info "Adding MCP server to Claude Code..."
    
    local config_json=$(create_mcp_config)
    
    # Add the server using Claude CLI
    if claude mcp add-json "$SERVER_NAME" "$config_json"; then
        log_success "MCP server added successfully"
    else
        log_error "Failed to add MCP server"
        log_info "You may need to manually add the configuration:"
        log_info "claude mcp add-json \"$SERVER_NAME\" '$config_json'"
        exit 1
    fi
}

# Verify MCP server configuration
verify_configuration() {
    log_info "Verifying MCP server configuration..."
    
    # List MCP servers to check if ours is there
    if claude mcp list 2>/dev/null | grep -q "$SERVER_NAME"; then
        log_success "MCP server configuration verified"
    else
        log_warning "Could not verify MCP server configuration"
        log_info "You can manually check with: claude mcp list"
    fi
}

# Test MCP server connection
test_connection() {
    log_info "Testing MCP server connection..."
    
    # Start Claude Code in test mode to verify the server works
    log_info "Starting Claude Code to test MCP server..."
    log_info "You should see the kanban tools available in Claude Code"
    log_info "Press Ctrl+C to stop the test"
    
    # Note: This is a basic test - in a real scenario, you'd want to
    # programmatically test the connection
    log_warning "Manual verification required:"
    log_info "1. Start Claude Code: claude"
    log_info "2. Check if kanban tools are available"
    log_info "3. Try using a kanban tool to verify the connection"
}

# Remove MCP server configuration
remove_mcp_server() {
    log_info "Removing MCP server configuration..."
    
    if claude mcp remove "$SERVER_NAME"; then
        log_success "MCP server configuration removed"
    else
        log_warning "Could not remove MCP server configuration"
        log_info "You may need to manually remove it from Claude Code settings"
    fi
}

# Show current configuration
show_configuration() {
    log_info "Current MCP server configuration:"
    echo
    create_mcp_config | jq '.' 2>/dev/null || create_mcp_config
    echo
}

# Show help
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo
    echo "Options:"
    echo "  --help, -h     Show this help message"
    echo "  --add          Add MCP server to Claude Code (default)"
    echo "  --remove       Remove MCP server from Claude Code"
    echo "  --verify       Verify current configuration"
    echo "  --test         Test MCP server connection"
    echo "  --show         Show current configuration"
    echo
    echo "Examples:"
    echo "  $0              # Add MCP server to Claude Code"
    echo "  $0 --remove     # Remove MCP server from Claude Code"
    echo "  $0 --verify     # Verify configuration"
    echo "  $0 --test       # Test connection"
    echo
    echo "Prerequisites:"
    echo "  • Claude Code must be installed"
    echo "  • MCP server must be built (run ./install.sh first)"
    echo "  • 'claude' command must be available in PATH"
}

# Main function
main() {
    echo "🤖 Claude Code MCP Integration"
    echo "=============================="
    echo
    
    # Check prerequisites
    check_claude_cli
    check_server_file
    
    # Handle command line arguments
    case "${1:-}" in
        --help|-h)
            show_help
            ;;
        --remove)
            remove_mcp_server
            ;;
        --verify)
            verify_configuration
            ;;
        --test)
            test_connection
            ;;
        --show)
            show_configuration
            ;;
        --add|"")
            add_mcp_server
            verify_configuration
            echo
            log_success "MCP server integration completed!"
            echo
            echo "🎉 Your MCP Kanban server is now configured with Claude Code!"
            echo
            echo "📋 Next steps:"
            echo "  1. Start Claude Code: claude"
            echo "  2. Check if kanban tools are available"
            echo "  3. Try using a kanban tool to verify the connection"
            echo
            echo "🔧 Troubleshooting:"
            echo "  • Run '$0 --verify' to check configuration"
            echo "  • Run '$0 --test' to test the connection"
            echo "  • Run '$0 --show' to see the configuration"
            echo
            ;;
        *)
            log_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
}

# Run main function
main "$@" 