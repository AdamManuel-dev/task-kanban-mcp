#!/bin/bash

# Cursor IDE MCP Integration Script
# Automatically configures Cursor IDE to use the MCP Kanban server

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

# Platform-specific paths
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    # Windows
    CURSOR_CONFIG_DIR="$APPDATA/Cursor"
    CURSOR_CONFIG_FILE="$CURSOR_CONFIG_DIR/mcp.json"
else
    # Linux/macOS
    CURSOR_CONFIG_DIR="$HOME/.cursor"
    CURSOR_CONFIG_FILE="$CURSOR_CONFIG_DIR/mcp.json"
fi

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
  "mcpServers": {
    "$SERVER_NAME": {
      "command": "node",
      "args": ["$server_path"],
      "env": {
        "MCP_KANBAN_DB_FOLDER_PATH": "$db_path"
      }
    }
  }
}
EOF
}

# Check if jq is available for JSON manipulation
check_jq() {
    if ! command -v jq &> /dev/null; then
        log_warning "jq is not installed. JSON manipulation may be limited."
        log_info "Install jq for better JSON handling:"
        log_info "  • macOS: brew install jq"
        log_info "  • Ubuntu/Debian: sudo apt-get install jq"
        log_info "  • Windows: choco install jq"
        return 1
    fi
    
    log_success "jq found for JSON manipulation"
    return 0
}

# Backup existing configuration
backup_config() {
    if [ -f "$CURSOR_CONFIG_FILE" ]; then
        local backup_file="${CURSOR_CONFIG_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
        cp "$CURSOR_CONFIG_FILE" "$backup_file"
        log_success "Configuration backed up to: $backup_file"
    fi
}

# Merge MCP configuration with existing config
merge_config() {
    local has_jq=$1
    local temp_config=$(mktemp)
    
    if [ -f "$CURSOR_CONFIG_FILE" ]; then
        if [ "$has_jq" = true ]; then
            # Use jq to merge configurations
            jq --arg server_name "$SERVER_NAME" \
               --arg server_path "$(get_absolute_server_path)" \
               --arg db_path "$(realpath "${SCRIPT_DIR}/data/db" | sed 's/\\/\//g')" \
               '.mcpServers[$server_name] = {
                 "command": "node",
                 "args": [$server_path],
                 "env": {
                   "MCP_KANBAN_DB_FOLDER_PATH": $db_path
                 }
               }' "$CURSOR_CONFIG_FILE" > "$temp_config"
        else
            # Simple backup and replace approach
            log_warning "Using simple configuration replacement (install jq for better merging)"
            create_mcp_config > "$temp_config"
        fi
    else
        # Create new configuration
        create_mcp_config > "$temp_config"
    fi
    
    echo "$temp_config"
}

# Add MCP server to Cursor
add_mcp_server() {
    log_info "Adding MCP server to Cursor IDE..."
    
    # Check if jq is available
    local has_jq=false
    if check_jq; then
        has_jq=true
    fi
    
    # Create config directory if it doesn't exist
    mkdir -p "$CURSOR_CONFIG_DIR"
    
    # Backup existing configuration
    backup_config
    
    # Merge or create configuration
    local temp_config=$(merge_config $has_jq)
    
    # Install the new configuration
    if mv "$temp_config" "$CURSOR_CONFIG_FILE"; then
        log_success "MCP server configuration added to Cursor"
    else
        log_error "Failed to update Cursor configuration"
        rm -f "$temp_config"
        exit 1
    fi
}

# Verify MCP server configuration
verify_configuration() {
    log_info "Verifying MCP server configuration..."
    
    if [ ! -f "$CURSOR_CONFIG_FILE" ]; then
        log_error "Cursor configuration file not found: $CURSOR_CONFIG_FILE"
        return 1
    fi
    
    if grep -q "$SERVER_NAME" "$CURSOR_CONFIG_FILE"; then
        log_success "MCP server configuration found in Cursor config"
        return 0
    else
        log_error "MCP server configuration not found in Cursor config"
        return 1
    fi
}

# Test MCP server connection
test_connection() {
    log_info "Testing MCP server connection..."
    
    log_info "To test the MCP server connection:"
    log_info "1. Open Cursor IDE"
    log_info "2. Go to Settings > MCP"
    log_info "3. Click the 'Refresh' button"
    log_info "4. Check if 'kanban-mcp' appears in the list"
    log_info "5. Try using the kanban tools in Cursor"
    
    log_warning "Manual verification required - please check Cursor IDE settings"
}

# Remove MCP server configuration
remove_mcp_server() {
    log_info "Removing MCP server configuration..."
    
    if [ ! -f "$CURSOR_CONFIG_FILE" ]; then
        log_warning "Cursor configuration file not found"
        return
    fi
    
    if check_jq; then
        # Use jq to remove the server configuration
        local temp_config=$(mktemp)
        if jq "del(.mcpServers.$SERVER_NAME)" "$CURSOR_CONFIG_FILE" > "$temp_config"; then
            mv "$temp_config" "$CURSOR_CONFIG_FILE"
            log_success "MCP server configuration removed"
        else
            log_error "Failed to remove MCP server configuration"
            rm -f "$temp_config"
        fi
    else
        log_warning "jq not available - manual removal required"
        log_info "Please manually remove the '$SERVER_NAME' entry from: $CURSOR_CONFIG_FILE"
    fi
}

# Show current configuration
show_configuration() {
    log_info "Current Cursor MCP configuration:"
    echo
    
    if [ -f "$CURSOR_CONFIG_FILE" ]; then
        if check_jq; then
            jq '.' "$CURSOR_CONFIG_FILE"
        else
            cat "$CURSOR_CONFIG_FILE"
        fi
    else
        log_warning "No Cursor configuration file found"
    fi
    
    echo
}

# Show help
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo
    echo "Options:"
    echo "  --help, -h     Show this help message"
    echo "  --add          Add MCP server to Cursor IDE (default)"
    echo "  --remove       Remove MCP server from Cursor IDE"
    echo "  --verify       Verify current configuration"
    echo "  --test         Test MCP server connection"
    echo "  --show         Show current configuration"
    echo
    echo "Examples:"
    echo "  $0              # Add MCP server to Cursor IDE"
    echo "  $0 --remove     # Remove MCP server from Cursor IDE"
    echo "  $0 --verify     # Verify configuration"
    echo "  $0 --test       # Test connection"
    echo
    echo "Prerequisites:"
    echo "  • Cursor IDE must be installed"
    echo "  • MCP server must be built (run ./install.sh first)"
    echo "  • jq is recommended for better JSON handling"
    echo
    echo "Configuration file location:"
    echo "  • Linux/macOS: $HOME/.cursor/mcp.json"
    echo "  • Windows: $APPDATA/Cursor/mcp.json"
}

# Main function
main() {
    echo "🎯 Cursor IDE MCP Integration"
    echo "============================="
    echo
    
    # Check prerequisites
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
            echo "🎉 Your MCP Kanban server is now configured with Cursor IDE!"
            echo
            echo "📋 Next steps:"
            echo "  1. Open Cursor IDE"
            echo "  2. Go to Settings > MCP"
            echo "  3. Click the 'Refresh' button"
            echo "  4. Check if 'kanban-mcp' appears in the list"
            echo "  5. Try using the kanban tools in Cursor"
            echo
            echo "🔧 Troubleshooting:"
            echo "  • Run '$0 --verify' to check configuration"
            echo "  • Run '$0 --test' to test the connection"
            echo "  • Run '$0 --show' to see the configuration"
            echo "  • Check Cursor IDE logs for any errors"
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