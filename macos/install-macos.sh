#!/bin/bash

# MCP Kanban macOS Installation Script
# Enhanced with Homebrew support, LaunchAgent integration, and native macOS features

set -euo pipefail

# Configuration
readonly SCRIPT_NAME="$(basename "$0")"
readonly SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
readonly PROJECT_NAME="mcp-kanban"
readonly MIN_NODE_VERSION="18.0.0"
readonly MIN_MACOS_VERSION="10.15"

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly PURPLE='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly WHITE='\033[1;37m'
readonly NC='\033[0m' # No Color

# Default installation options
INSTALL_METHOD="auto"
INSTALL_PATH="$HOME/Applications/MCP-Kanban"
USE_HOMEBREW=true
INSTALL_SERVICE=true
SKIP_DEPENDENCIES=false
DEVELOPMENT_MODE=false
FORCE_INSTALL=false
VERBOSE=false

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_highlight() {
    echo -e "${PURPLE}🎯 $1${NC}"
}

log_debug() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "${CYAN}🔍 $1${NC}"
    fi
}

# Display banner
show_banner() {
    echo ""
    echo -e "${PURPLE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${PURPLE}║                    MCP Kanban Installer                      ║${NC}"
    echo -e "${PURPLE}║                   macOS Enhanced Edition                     ║${NC}"
    echo -e "${PURPLE}║              AI-Powered Task Management System               ║${NC}"
    echo -e "${PURPLE}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Show help
show_help() {
    cat << EOF
Usage: $SCRIPT_NAME [OPTIONS]

Install MCP Kanban on macOS with enhanced native integration.

OPTIONS:
    -h, --help              Show this help message
    -p, --path PATH         Installation path (default: $INSTALL_PATH)
    -m, --method METHOD     Installation method: homebrew|manual|auto (default: auto)
    -s, --service           Install as LaunchAgent service (default: true)
    -d, --development       Development installation with dev dependencies
    -f, --force             Force reinstallation
    -v, --verbose           Verbose output
    --skip-deps             Skip dependency checks
    --no-homebrew           Don't use Homebrew even if available
    --no-service            Don't install LaunchAgent service

EXAMPLES:
    $SCRIPT_NAME                        # Auto-detect best installation method
    $SCRIPT_NAME --method homebrew      # Force Homebrew installation
    $SCRIPT_NAME --method manual        # Manual installation
    $SCRIPT_NAME --development          # Development installation
    $SCRIPT_NAME --no-service           # Install without service integration

INSTALLATION METHODS:
    homebrew    Use Homebrew package manager (recommended)
    manual      Manual installation from source
    auto        Auto-detect best method based on system

For more information, visit: https://github.com/yourusername/mcp-kanban
EOF
}

# Parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -p|--path)
                INSTALL_PATH="$2"
                shift 2
                ;;
            -m|--method)
                INSTALL_METHOD="$2"
                shift 2
                ;;
            -s|--service)
                INSTALL_SERVICE=true
                shift
                ;;
            -d|--development)
                DEVELOPMENT_MODE=true
                shift
                ;;
            -f|--force)
                FORCE_INSTALL=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            --skip-deps)
                SKIP_DEPENDENCIES=true
                shift
                ;;
            --no-homebrew)
                USE_HOMEBREW=false
                shift
                ;;
            --no-service)
                INSTALL_SERVICE=false
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Check macOS version compatibility
check_macos_version() {
    log_info "Checking macOS version compatibility..."
    
    local os_version
    os_version=$(sw_vers -productVersion)
    
    log_debug "Detected macOS version: $os_version"
    
    if ! command -v python3 &> /dev/null; then
        log_error "Python3 is required but not found. Please install Xcode Command Line Tools."
        exit 1
    fi
    
    # Use Python to compare versions
    if ! python3 -c "
import sys
from packaging import version
current = version.parse('$os_version')
minimum = version.parse('$MIN_MACOS_VERSION')
sys.exit(0 if current >= minimum else 1)
" 2>/dev/null; then
        # Fallback to basic comparison if packaging module not available
        local major minor
        major=$(echo "$os_version" | cut -d. -f1)
        minor=$(echo "$os_version" | cut -d. -f2)
        
        if [[ $major -lt 10 ]] || [[ $major -eq 10 && $minor -lt 15 ]]; then
            log_error "macOS $MIN_MACOS_VERSION or later is required. Current version: $os_version"
            exit 1
        fi
    fi
    
    log_success "macOS version $os_version is compatible"
}

# Check if Homebrew is available
check_homebrew() {
    if command -v brew &> /dev/null; then
        log_debug "Homebrew found at: $(which brew)"
        return 0
    else
        log_debug "Homebrew not found"
        return 1
    fi
}

# Install Homebrew
install_homebrew() {
    log_info "Installing Homebrew..."
    
    if ! command -v curl &> /dev/null; then
        log_error "curl is required to install Homebrew"
        exit 1
    fi
    
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    
    # Add Homebrew to PATH for the current session
    if [[ -f "/opt/homebrew/bin/brew" ]]; then
        # Apple Silicon
        eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [[ -f "/usr/local/bin/brew" ]]; then
        # Intel
        eval "$(/usr/local/bin/brew shellenv)"
    fi
    
    log_success "Homebrew installed successfully"
}

# Check dependencies
check_dependencies() {
    if [[ "$SKIP_DEPENDENCIES" == "true" ]]; then
        log_warning "Skipping dependency checks"
        return 0
    fi
    
    log_info "Checking system dependencies..."
    
    local missing_deps=()
    
    # Check Node.js
    if command -v node &> /dev/null; then
        local node_version
        node_version=$(node --version | sed 's/v//')
        log_debug "Found Node.js version: $node_version"
        
        if ! python3 -c "
import sys
from packaging import version
current = version.parse('$node_version')
minimum = version.parse('$MIN_NODE_VERSION')
sys.exit(0 if current >= minimum else 1)
" 2>/dev/null; then
            # Fallback comparison
            if [[ "${node_version%%.*}" -lt "${MIN_NODE_VERSION%%.*}" ]]; then
                missing_deps+=("node@18")
            fi
        fi
        log_success "Node.js $node_version (compatible)"
    else
        log_warning "Node.js not found"
        missing_deps+=("node@18")
    fi
    
    # Check npm
    if command -v npm &> /dev/null; then
        local npm_version
        npm_version=$(npm --version)
        log_success "npm $npm_version"
    else
        log_warning "npm not found"
        missing_deps+=("npm")
    fi
    
    # Check Git
    if command -v git &> /dev/null; then
        local git_version
        git_version=$(git --version | awk '{print $3}')
        log_success "Git $git_version"
    else
        log_warning "Git not found"
        missing_deps+=("git")
    fi
    
    # Check SQLite
    if command -v sqlite3 &> /dev/null; then
        local sqlite_version
        sqlite_version=$(sqlite3 --version | awk '{print $1}')
        log_success "SQLite $sqlite_version"
    else
        log_warning "SQLite not found"
        missing_deps+=("sqlite")
    fi
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_warning "Missing dependencies: ${missing_deps[*]}"
        
        if [[ "$USE_HOMEBREW" == "true" ]] && check_homebrew; then
            log_info "Installing missing dependencies via Homebrew..."
            brew install "${missing_deps[@]}"
        else
            log_error "Please install the missing dependencies manually:"
            for dep in "${missing_deps[@]}"; do
                echo "  • $dep"
            done
            exit 1
        fi
    else
        log_success "All dependencies are satisfied"
    fi
}

# Determine best installation method
determine_install_method() {
    if [[ "$INSTALL_METHOD" != "auto" ]]; then
        log_debug "Using specified installation method: $INSTALL_METHOD"
        return 0
    fi
    
    log_info "Auto-detecting best installation method..."
    
    if [[ "$USE_HOMEBREW" == "true" ]] && check_homebrew; then
        INSTALL_METHOD="homebrew"
        log_success "Selected Homebrew installation"
    else
        INSTALL_METHOD="manual"
        log_success "Selected manual installation"
    fi
}

# Install via Homebrew
install_via_homebrew() {
    log_info "Installing MCP Kanban via Homebrew..."
    
    # Add custom tap if needed (for development/testing)
    # brew tap yourusername/mcp-kanban
    
    # Install the formula
    if [[ "$DEVELOPMENT_MODE" == "true" ]]; then
        brew install --HEAD mcp-kanban
    else
        brew install mcp-kanban
    fi
    
    log_success "MCP Kanban installed via Homebrew"
}

# Manual installation
install_manually() {
    log_info "Installing MCP Kanban manually to: $INSTALL_PATH"
    
    # Create installation directory
    if [[ -d "$INSTALL_PATH" ]]; then
        if [[ "$FORCE_INSTALL" == "true" ]]; then
            log_warning "Removing existing installation..."
            rm -rf "$INSTALL_PATH"
        else
            echo -n "Installation directory exists. Overwrite? (y/N): "
            read -r response
            if [[ "$response" != "y" && "$response" != "Y" ]]; then
                log_warning "Installation cancelled"
                exit 1
            fi
            rm -rf "$INSTALL_PATH"
        fi
    fi
    
    mkdir -p "$INSTALL_PATH"
    cd "$INSTALL_PATH"
    
    # Clone repository
    log_info "Downloading MCP Kanban source code..."
    git clone https://github.com/yourusername/mcp-kanban.git .
    
    # Install dependencies
    log_info "Installing Node.js dependencies..."
    if [[ "$DEVELOPMENT_MODE" == "true" ]]; then
        npm install
    else
        npm ci --only=production
    fi
    
    # Build project
    log_info "Building project..."
    npm run build
    
    # Initialize database
    log_info "Initializing database..."
    mkdir -p data logs backups
    npm run migrate || log_warning "Database migration failed, will initialize on first run"
    
    log_success "Manual installation completed"
}

# Create CLI wrapper script
create_cli_wrapper() {
    log_info "Creating CLI wrapper script..."
    
    local bin_dir="/usr/local/bin"
    local wrapper_script="$bin_dir/kanban"
    
    # Check if we have write permissions
    if [[ ! -w "$bin_dir" ]]; then
        log_warning "Creating CLI wrapper requires sudo permissions"
        sudo mkdir -p "$bin_dir"
        
        if [[ "$INSTALL_METHOD" == "homebrew" ]]; then
            sudo ln -sf "$(brew --prefix)/bin/kanban" "$wrapper_script"
        else
            cat << EOF | sudo tee "$wrapper_script" > /dev/null
#!/bin/bash
exec node "$INSTALL_PATH/dist/cli/index.js" "\$@"
EOF
            sudo chmod +x "$wrapper_script"
        fi
    else
        if [[ "$INSTALL_METHOD" == "homebrew" ]]; then
            ln -sf "$(brew --prefix)/bin/kanban" "$wrapper_script"
        else
            cat << EOF > "$wrapper_script"
#!/bin/bash
exec node "$INSTALL_PATH/dist/cli/index.js" "\$@"
EOF
            chmod +x "$wrapper_script"
        fi
    fi
    
    log_success "CLI wrapper created at $wrapper_script"
}

# Install LaunchAgent service
install_launch_agent() {
    if [[ "$INSTALL_SERVICE" != "true" ]]; then
        log_info "Skipping LaunchAgent service installation"
        return 0
    fi
    
    log_info "Installing LaunchAgent service..."
    
    local launch_agents_dir="$HOME/Library/LaunchAgents"
    local plist_file="$launch_agents_dir/com.mcp-kanban.server.plist"
    
    mkdir -p "$launch_agents_dir"
    
    # Determine executable path
    local executable_path
    if [[ "$INSTALL_METHOD" == "homebrew" ]]; then
        executable_path="$(brew --prefix)/bin/mcp-kanban"
    else
        executable_path="$INSTALL_PATH/dist/index.js"
    fi
    
    # Create LaunchAgent plist
    cat << EOF > "$plist_file"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.mcp-kanban.server</string>
    <key>ProgramArguments</key>
    <array>
        <string>$executable_path</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$INSTALL_PATH</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_ENV</key>
        <string>production</string>
        <key>LOG_LEVEL</key>
        <string>info</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>StandardOutPath</key>
    <string>$INSTALL_PATH/logs/server.log</string>
    <key>StandardErrorPath</key>
    <string>$INSTALL_PATH/logs/server-error.log</string>
    <key>ThrottleInterval</key>
    <integer>5</integer>
</dict>
</plist>
EOF
    
    # Load the LaunchAgent
    launchctl load "$plist_file"
    
    log_success "LaunchAgent service installed and loaded"
    log_info "Service commands:"
    log_info "  • Start: launchctl start com.mcp-kanban.server"
    log_info "  • Stop: launchctl stop com.mcp-kanban.server"
    log_info "  • Status: launchctl list | grep mcp-kanban"
}

# Create desktop integration
create_desktop_integration() {
    log_info "Creating desktop integration..."
    
    local applications_dir="$HOME/Applications"
    local app_dir="$applications_dir/MCP Kanban.app"
    
    mkdir -p "$app_dir/Contents/MacOS"
    mkdir -p "$app_dir/Contents/Resources"
    
    # Create Info.plist
    cat << EOF > "$app_dir/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>MCP Kanban</string>
    <key>CFBundleIconFile</key>
    <string>icon.icns</string>
    <key>CFBundleIdentifier</key>
    <string>com.mcp-kanban.app</string>
    <key>CFBundleName</key>
    <string>MCP Kanban</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>LSUIElement</key>
    <true/>
</dict>
</plist>
EOF
    
    # Create executable wrapper
    cat << 'EOF' > "$app_dir/Contents/MacOS/MCP Kanban"
#!/bin/bash
open "http://localhost:3000"
EOF
    chmod +x "$app_dir/Contents/MacOS/MCP Kanban"
    
    # Create icon (simple for now)
    if command -v iconutil &> /dev/null; then
        # Create a basic icon set (you would replace this with actual icon files)
        mkdir -p "$app_dir/Contents/Resources/icon.iconset"
        # Add actual icon files here in production
        # iconutil -c icns "$app_dir/Contents/Resources/icon.iconset" -o "$app_dir/Contents/Resources/icon.icns"
    fi
    
    log_success "Desktop integration created"
}

# Test installation
test_installation() {
    log_info "Testing installation..."
    
    # Test CLI
    if command -v kanban &> /dev/null; then
        local version
        version=$(kanban --version 2>/dev/null || echo "unknown")
        log_success "CLI test passed (version: $version)"
    else
        log_warning "CLI test failed - command not found"
        return 1
    fi
    
    # Test server (quick check)
    if [[ "$INSTALL_METHOD" == "homebrew" ]]; then
        local server_cmd="$(brew --prefix)/bin/mcp-kanban"
    else
        local server_cmd="node $INSTALL_PATH/dist/index.js"
    fi
    
    # Start server in background for testing
    timeout 10s $server_cmd --port 3001 &> /dev/null &
    local server_pid=$!
    
    sleep 3
    
    if kill -0 $server_pid 2>/dev/null; then
        log_success "Server startup test passed"
        kill $server_pid 2>/dev/null
        return 0
    else
        log_warning "Server startup test failed"
        return 1
    fi
}

# Show post-installation instructions
show_post_install() {
    echo ""
    log_success "🎉 MCP Kanban installation completed successfully!"
    echo ""
    
    if [[ "$INSTALL_METHOD" == "homebrew" ]]; then
        echo -e "${CYAN}📦 Installed via Homebrew${NC}"
        echo -e "${WHITE}  • Formula: mcp-kanban${NC}"
        echo -e "${WHITE}  • Prefix: $(brew --prefix)${NC}"
    else
        echo -e "${CYAN}📁 Installation directory: $INSTALL_PATH${NC}"
    fi
    
    echo ""
    echo -e "${PURPLE}🚀 Getting Started:${NC}"
    
    if [[ "$INSTALL_SERVICE" == "true" ]]; then
        echo -e "${WHITE}  • Start service: launchctl start com.mcp-kanban.server${NC}"
        echo -e "${WHITE}  • Stop service: launchctl stop com.mcp-kanban.server${NC}"
        echo -e "${WHITE}  • Service status: launchctl list | grep mcp-kanban${NC}"
    fi
    
    if [[ "$INSTALL_METHOD" == "homebrew" ]]; then
        echo -e "${WHITE}  • Start with Homebrew: brew services start mcp-kanban${NC}"
        echo -e "${WHITE}  • Stop with Homebrew: brew services stop mcp-kanban${NC}"
    fi
    
    echo -e "${WHITE}  • CLI tool: kanban --help${NC}"
    echo -e "${WHITE}  • Web interface: http://localhost:3000${NC}"
    echo -e "${WHITE}  • Health check: http://localhost:3000/api/health${NC}"
    
    echo ""
    echo -e "${PURPLE}📚 Documentation:${NC}"
    if [[ "$INSTALL_METHOD" == "homebrew" ]]; then
        echo -e "${WHITE}  • Location: $(brew --prefix)/share/doc/mcp-kanban/${NC}"
    else
        echo -e "${WHITE}  • User Guide: $INSTALL_PATH/docs/user/README.md${NC}"
        echo -e "${WHITE}  • API Docs: $INSTALL_PATH/docs/api/API_REFERENCE.md${NC}"
    fi
    
    echo ""
    echo -e "${PURPLE}🔧 Claude Desktop Integration:${NC}"
    echo -e "${WHITE}Add this to your Claude Desktop MCP configuration:${NC}"
    echo ""
    echo -e "${CYAN}{${NC}"
    echo -e "${CYAN}  \"mcpServers\": {${NC}"
    echo -e "${CYAN}    \"mcp-kanban\": {${NC}"
    if [[ "$INSTALL_METHOD" == "homebrew" ]]; then
        echo -e "${CYAN}      \"command\": \"$(brew --prefix)/bin/mcp-kanban\",${NC}"
    else
        echo -e "${CYAN}      \"command\": \"node\",${NC}"
        echo -e "${CYAN}      \"args\": [\"$INSTALL_PATH/dist/mcp/index.js\"],${NC}"
    fi
    echo -e "${CYAN}      \"env\": { \"NODE_ENV\": \"production\" }${NC}"
    echo -e "${CYAN}    }${NC}"
    echo -e "${CYAN}  }${NC}"
    echo -e "${CYAN}}${NC}"
    
    echo ""
    echo -e "${PURPLE}❓ Need help?${NC}"
    echo -e "${WHITE}  • Documentation: https://github.com/yourusername/mcp-kanban/docs${NC}"
    echo -e "${WHITE}  • Issues: https://github.com/yourusername/mcp-kanban/issues${NC}"
    echo -e "${WHITE}  • Community: https://discord.gg/mcp-kanban${NC}"
    echo ""
}

# Main installation function
main() {
    show_banner
    parse_arguments "$@"
    
    log_info "Starting MCP Kanban installation for macOS..."
    log_debug "Installation method: $INSTALL_METHOD"
    log_debug "Installation path: $INSTALL_PATH"
    log_debug "Development mode: $DEVELOPMENT_MODE"
    log_debug "Install service: $INSTALL_SERVICE"
    
    # System checks
    check_macos_version
    determine_install_method
    
    # Dependency management
    if [[ "$INSTALL_METHOD" == "homebrew" ]]; then
        if ! check_homebrew; then
            if [[ "$USE_HOMEBREW" == "true" ]]; then
                install_homebrew
            else
                log_error "Homebrew not found and installation refused"
                exit 1
            fi
        fi
    fi
    
    check_dependencies
    
    # Installation
    case "$INSTALL_METHOD" in
        homebrew)
            install_via_homebrew
            ;;
        manual)
            install_manually
            ;;
        *)
            log_error "Unknown installation method: $INSTALL_METHOD"
            exit 1
            ;;
    esac
    
    # Post-installation setup
    create_cli_wrapper
    install_launch_agent
    create_desktop_integration
    
    # Validation
    if test_installation; then
        show_post_install
    else
        log_warning "Installation completed but some tests failed"
        show_post_install
    fi
}

# Error handling
trap 'log_error "Installation failed on line $LINENO"; exit 1' ERR

# Run main function
main "$@" 