#!/bin/bash

# MCP Kanban Linux Installation Script
# Multi-distribution support with package management integration

set -euo pipefail

# Configuration
readonly SCRIPT_NAME="$(basename "$0")"
readonly SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
readonly PROJECT_NAME="mcp-kanban"
readonly MIN_NODE_VERSION="18.0.0"
readonly GITHUB_REPO="yourusername/mcp-kanban"

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly PURPLE='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly WHITE='\033[1;37m'
readonly NC='\033[0m' # No Color

# Default options
INSTALL_PATH="/opt/mcp-kanban"
INSTALL_METHOD="auto"
INSTALL_SERVICE=true
DEVELOPMENT_MODE=false
FORCE_INSTALL=false
VERBOSE=false
SKIP_DEPENDENCIES=false
CREATE_USER=true
CREATE_PACKAGES=false

# Distribution detection
DISTRO=""
PACKAGE_MANAGER=""
SERVICE_MANAGER=""

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

# Show banner
show_banner() {
    echo ""
    echo -e "${PURPLE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${PURPLE}║                    MCP Kanban Installer                      ║${NC}"
    echo -e "${PURPLE}║                     Linux Edition                           ║${NC}"
    echo -e "${PURPLE}║              AI-Powered Task Management System               ║${NC}"
    echo -e "${PURPLE}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Show help
show_help() {
    cat << EOF
Usage: $SCRIPT_NAME [OPTIONS]

Install MCP Kanban on Linux with multi-distribution support.

OPTIONS:
    -h, --help              Show this help message
    -p, --path PATH         Installation path (default: $INSTALL_PATH)
    -m, --method METHOD     Installation method: package|manual|auto (default: auto)
    -s, --service           Install as system service (default: true)
    -d, --development       Development installation with dev dependencies
    -f, --force             Force reinstallation
    -v, --verbose           Verbose output
    --skip-deps             Skip dependency checks
    --no-service            Don't install system service
    --no-user               Don't create dedicated system user
    --create-packages       Create distribution packages (.deb, .rpm)

EXAMPLES:
    $SCRIPT_NAME                        # Auto-detect distribution and install
    $SCRIPT_NAME --method package       # Use distribution package manager
    $SCRIPT_NAME --method manual        # Manual installation
    $SCRIPT_NAME --development          # Development installation
    $SCRIPT_NAME --create-packages      # Build distribution packages

SUPPORTED DISTRIBUTIONS:
    • Ubuntu/Debian (apt)
    • CentOS/RHEL/Fedora (yum/dnf)
    • Arch Linux (pacman)
    • openSUSE (zypper)
    • Alpine Linux (apk)
    • Generic Linux (manual)

For more information, visit: https://github.com/$GITHUB_REPO
EOF
}

# Parse arguments
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
            --no-service)
                INSTALL_SERVICE=false
                shift
                ;;
            --no-user)
                CREATE_USER=false
                shift
                ;;
            --create-packages)
                CREATE_PACKAGES=true
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

# Detect Linux distribution
detect_distribution() {
    log_info "Detecting Linux distribution..."
    
    # Check for LSB release
    if command -v lsb_release &> /dev/null; then
        DISTRO=$(lsb_release -si | tr '[:upper:]' '[:lower:]')
    # Check for systemd
    elif [[ -f /etc/os-release ]]; then
        . /etc/os-release
        DISTRO=$(echo "$ID" | tr '[:upper:]' '[:lower:]')
    # Fallback checks
    elif [[ -f /etc/debian_version ]]; then
        DISTRO="debian"
    elif [[ -f /etc/redhat-release ]]; then
        DISTRO="rhel"
    elif [[ -f /etc/arch-release ]]; then
        DISTRO="arch"
    elif [[ -f /etc/alpine-release ]]; then
        DISTRO="alpine"
    else
        DISTRO="unknown"
    fi
    
    # Normalize distribution names
    case "$DISTRO" in
        ubuntu|debian|linuxmint)
            DISTRO="debian"
            PACKAGE_MANAGER="apt"
            ;;
        centos|rhel|fedora|rocky|almalinux)
            DISTRO="rhel"
            if command -v dnf &> /dev/null; then
                PACKAGE_MANAGER="dnf"
            else
                PACKAGE_MANAGER="yum"
            fi
            ;;
        arch|manjaro|endeavouros)
            DISTRO="arch"
            PACKAGE_MANAGER="pacman"
            ;;
        opensuse*|sles)
            DISTRO="opensuse"
            PACKAGE_MANAGER="zypper"
            ;;
        alpine)
            DISTRO="alpine"
            PACKAGE_MANAGER="apk"
            ;;
        *)
            DISTRO="generic"
            PACKAGE_MANAGER="manual"
            ;;
    esac
    
    # Detect service manager
    if command -v systemctl &> /dev/null && [[ -d /etc/systemd/system ]]; then
        SERVICE_MANAGER="systemd"
    elif command -v service &> /dev/null && [[ -d /etc/init.d ]]; then
        SERVICE_MANAGER="sysv"
    elif command -v rc-service &> /dev/null; then
        SERVICE_MANAGER="openrc"
    else
        SERVICE_MANAGER="none"
    fi
    
    log_success "Detected: $DISTRO ($PACKAGE_MANAGER) with $SERVICE_MANAGER"
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        log_warning "Running as root. This is not recommended for security reasons."
        if [[ "$FORCE_INSTALL" != "true" ]]; then
            echo -n "Continue anyway? (y/N): "
            read -r response
            if [[ "$response" != "y" && "$response" != "Y" ]]; then
                log_info "Installation cancelled"
                exit 1
            fi
        fi
    fi
}

# Install system dependencies
install_system_dependencies() {
    if [[ "$SKIP_DEPENDENCIES" == "true" ]]; then
        log_warning "Skipping dependency installation"
        return 0
    fi
    
    log_info "Installing system dependencies for $DISTRO..."
    
    case "$PACKAGE_MANAGER" in
        apt)
            sudo apt update
            sudo apt install -y curl wget gnupg2 software-properties-common build-essential
            
            # Install Node.js from NodeSource
            curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
            sudo apt install -y nodejs
            
            # Install additional dependencies
            sudo apt install -y git sqlite3 nginx
            ;;
        dnf)
            sudo dnf update -y
            sudo dnf groupinstall -y "Development Tools"
            sudo dnf install -y curl wget gnupg2 git sqlite
            
            # Install Node.js
            curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
            sudo dnf install -y nodejs
            ;;
        yum)
            sudo yum update -y
            sudo yum groupinstall -y "Development Tools"
            sudo yum install -y curl wget gnupg2 git sqlite
            
            # Install Node.js
            curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
            sudo yum install -y nodejs
            ;;
        pacman)
            sudo pacman -Syu --noconfirm
            sudo pacman -S --noconfirm base-devel curl wget gnupg git sqlite nodejs npm
            ;;
        zypper)
            sudo zypper refresh
            sudo zypper install -y -t pattern devel_basis
            sudo zypper install -y curl wget gnupg2 git sqlite3 nodejs18 npm18
            ;;
        apk)
            sudo apk update
            sudo apk add curl wget gnupg git sqlite nodejs npm build-base python3 make g++
            ;;
        *)
            log_warning "Manual dependency installation required for $DISTRO"
            log_info "Please ensure the following are installed:"
            log_info "  • Node.js 18+ with npm"
            log_info "  • Git"
            log_info "  • SQLite3"
            log_info "  • Build tools (gcc, make, python3)"
            ;;
    esac
    
    log_success "System dependencies installed"
}

# Create system user
create_system_user() {
    if [[ "$CREATE_USER" != "true" ]]; then
        log_info "Skipping system user creation"
        return 0
    fi
    
    log_info "Creating system user for MCP Kanban..."
    
    local username="mcp-kanban"
    local homedir="/var/lib/mcp-kanban"
    
    if id "$username" &>/dev/null; then
        log_info "User $username already exists"
    else
        case "$DISTRO" in
            debian|arch)
                sudo useradd --system --home-dir "$homedir" --create-home \
                    --shell /bin/false --comment "MCP Kanban Service User" "$username"
                ;;
            rhel|opensuse)
                sudo useradd --system --home-dir "$homedir" --create-home \
                    --shell /sbin/nologin --comment "MCP Kanban Service User" "$username"
                ;;
            alpine)
                sudo adduser -S -h "$homedir" -s /sbin/nologin \
                    -g "MCP Kanban Service User" "$username"
                ;;
            *)
                sudo useradd --system --home-dir "$homedir" --create-home \
                    --shell /bin/false "$username"
                ;;
        esac
        
        log_success "Created system user: $username"
    fi
    
    # Set ownership
    sudo mkdir -p "$INSTALL_PATH"
    sudo chown -R "$username:$username" "$INSTALL_PATH"
}

# Install MCP Kanban
install_mcp_kanban() {
    log_info "Installing MCP Kanban to $INSTALL_PATH..."
    
    # Create installation directory
    if [[ -d "$INSTALL_PATH" ]]; then
        if [[ "$FORCE_INSTALL" == "true" ]]; then
            log_warning "Removing existing installation..."
            sudo rm -rf "$INSTALL_PATH"
        else
            echo -n "Installation directory exists. Overwrite? (y/N): "
            read -r response
            if [[ "$response" != "y" && "$response" != "Y" ]]; then
                log_warning "Installation cancelled"
                exit 1
            fi
            sudo rm -rf "$INSTALL_PATH"
        fi
    fi
    
    sudo mkdir -p "$INSTALL_PATH"
    cd "$INSTALL_PATH"
    
    # Clone repository
    log_info "Downloading MCP Kanban source code..."
    sudo git clone "https://github.com/$GITHUB_REPO.git" .
    
    # Install dependencies
    log_info "Installing Node.js dependencies..."
    if [[ "$DEVELOPMENT_MODE" == "true" ]]; then
        sudo npm install
    else
        sudo npm ci --only=production
    fi
    
    # Build project
    log_info "Building project..."
    sudo npm run build
    
    # Create necessary directories
    sudo mkdir -p data logs backups config
    
    # Initialize database
    log_info "Initializing database..."
    sudo npm run migrate || log_warning "Database migration failed, will initialize on first run"
    
    # Set permissions
    if [[ "$CREATE_USER" == "true" ]]; then
        sudo chown -R mcp-kanban:mcp-kanban "$INSTALL_PATH"
        sudo chmod -R 755 "$INSTALL_PATH"
        sudo chmod -R 644 "$INSTALL_PATH/data"
    fi
    
    log_success "MCP Kanban installed successfully"
}

# Create systemd service
create_systemd_service() {
    log_info "Creating systemd service..."
    
    local service_user="mcp-kanban"
    if [[ "$CREATE_USER" != "true" ]]; then
        service_user="$USER"
    fi
    
    cat << EOF | sudo tee /etc/systemd/system/mcp-kanban.service > /dev/null
[Unit]
Description=MCP Kanban Task Management Server
Documentation=https://github.com/$GITHUB_REPO
After=network.target
Wants=network.target

[Service]
Type=simple
User=$service_user
Group=$service_user
WorkingDirectory=$INSTALL_PATH
ExecStart=/usr/bin/node $INSTALL_PATH/dist/index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=mcp-kanban

# Environment
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=DATABASE_URL=$INSTALL_PATH/data/kanban.db
Environment=LOG_LEVEL=info

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$INSTALL_PATH

# Resource limits
LimitNOFILE=65535
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
EOF
    
    # Reload systemd and enable service
    sudo systemctl daemon-reload
    sudo systemctl enable mcp-kanban.service
    
    log_success "Systemd service created and enabled"
}

# Create SysV init script
create_sysv_service() {
    log_info "Creating SysV init script..."
    
    local service_user="mcp-kanban"
    if [[ "$CREATE_USER" != "true" ]]; then
        service_user="$USER"
    fi
    
    cat << EOF | sudo tee /etc/init.d/mcp-kanban > /dev/null
#!/bin/bash
# mcp-kanban        MCP Kanban Task Management Server
# chkconfig: 35 80 20
# description: MCP Kanban Server

. /etc/rc.d/init.d/functions

USER="$service_user"
DAEMON="mcp-kanban"
ROOT_DIR="$INSTALL_PATH"

SERVER="\$ROOT_DIR/dist/index.js"
LOCK_FILE="/var/lock/subsys/\$DAEMON"

do_start() {
    if [ ! -f "\$LOCK_FILE" ] ; then
        echo -n \$"Starting \$DAEMON: "
        runuser -l "\$USER" -c "\$SERVER" && echo_success || echo_failure
        RETVAL=\$?
        echo
        [ \$RETVAL -eq 0 ] && touch \$LOCK_FILE
    else
        echo "\$DAEMON is locked."
    fi
}
do_stop() {
    echo -n \$"Shutting down \$DAEMON: "
    pid=\`ps -aefw | grep "\$DAEMON" | grep -v " grep " | awk '{print \$2}'\`
    kill -9 \$pid > /dev/null 2>&1
    [ \$? -eq 0 ] && echo_success || echo_failure
    RETVAL=\$?
    echo
    [ \$RETVAL -eq 0 ] && rm -f \$LOCK_FILE
}

case "\$1" in
    start)
        do_start
        ;;
    stop)
        do_stop
        ;;
    restart)
        do_stop
        do_start
        ;;
    *)
        echo "Usage: \$0 {start|stop|restart}"
        RETVAL=1
esac

exit \$RETVAL
EOF
    
    sudo chmod +x /etc/init.d/mcp-kanban
    sudo chkconfig --add mcp-kanban
    sudo chkconfig mcp-kanban on
    
    log_success "SysV init script created"
}

# Create OpenRC service
create_openrc_service() {
    log_info "Creating OpenRC service..."
    
    local service_user="mcp-kanban"
    if [[ "$CREATE_USER" != "true" ]]; then
        service_user="$USER"
    fi
    
    cat << EOF | sudo tee /etc/init.d/mcp-kanban > /dev/null
#!/sbin/openrc-run

name="MCP Kanban"
description="MCP Kanban Task Management Server"

command="/usr/bin/node"
command_args="$INSTALL_PATH/dist/index.js"
command_user="$service_user"
command_background=true
pidfile="/run/\${RC_SVCNAME}.pid"

directory="$INSTALL_PATH"

depend() {
    need net
    after logger
}

start_pre() {
    checkpath --directory --owner \$command_user --mode 0755 \$(dirname \$pidfile)
}
EOF
    
    sudo chmod +x /etc/init.d/mcp-kanban
    sudo rc-update add mcp-kanban default
    
    log_success "OpenRC service created"
}

# Install system service
install_system_service() {
    if [[ "$INSTALL_SERVICE" != "true" ]]; then
        log_info "Skipping system service installation"
        return 0
    fi
    
    case "$SERVICE_MANAGER" in
        systemd)
            create_systemd_service
            ;;
        sysv)
            create_sysv_service
            ;;
        openrc)
            create_openrc_service
            ;;
        *)
            log_warning "No supported service manager found"
            log_info "You'll need to start MCP Kanban manually"
            ;;
    esac
}

# Create CLI wrapper
create_cli_wrapper() {
    log_info "Creating CLI wrapper..."
    
    cat << EOF | sudo tee /usr/local/bin/kanban > /dev/null
#!/bin/bash
exec node "$INSTALL_PATH/dist/cli/index.js" "\$@"
EOF
    
    sudo chmod +x /usr/local/bin/kanban
    
    log_success "CLI wrapper created at /usr/local/bin/kanban"
}

# Create nginx configuration
create_nginx_config() {
    if ! command -v nginx &> /dev/null; then
        log_info "Nginx not found, skipping reverse proxy setup"
        return 0
    fi
    
    log_info "Creating Nginx reverse proxy configuration..."
    
    cat << EOF | sudo tee /etc/nginx/sites-available/mcp-kanban > /dev/null
server {
    listen 80;
    server_name mcp-kanban.local localhost;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    location /ws {
        proxy_pass http://localhost:3456;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
    
    # Enable site (if sites-enabled exists)
    if [[ -d /etc/nginx/sites-enabled ]]; then
        sudo ln -sf /etc/nginx/sites-available/mcp-kanban /etc/nginx/sites-enabled/
    fi
    
    # Test nginx configuration
    if sudo nginx -t &> /dev/null; then
        sudo systemctl reload nginx 2>/dev/null || sudo service nginx reload 2>/dev/null || true
        log_success "Nginx configuration created and loaded"
    else
        log_warning "Nginx configuration created but failed to load"
    fi
}

# Create distribution packages
create_packages() {
    if [[ "$CREATE_PACKAGES" != "true" ]]; then
        return 0
    fi
    
    log_info "Creating distribution packages..."
    
    local build_dir="/tmp/mcp-kanban-build"
    mkdir -p "$build_dir"
    
    # Create .deb package
    if command -v dpkg-deb &> /dev/null; then
        log_info "Creating .deb package..."
        
        local deb_dir="$build_dir/deb"
        mkdir -p "$deb_dir/DEBIAN"
        mkdir -p "$deb_dir/opt/mcp-kanban"
        mkdir -p "$deb_dir/etc/systemd/system"
        mkdir -p "$deb_dir/usr/local/bin"
        
        # Copy files
        cp -r "$INSTALL_PATH"/* "$deb_dir/opt/mcp-kanban/"
        cp /etc/systemd/system/mcp-kanban.service "$deb_dir/etc/systemd/system/"
        cp /usr/local/bin/kanban "$deb_dir/usr/local/bin/"
        
        # Create control file
        cat << EOF > "$deb_dir/DEBIAN/control"
Package: mcp-kanban
Version: 1.0.0
Section: utils
Priority: optional
Architecture: all
Depends: nodejs (>= 18.0.0), sqlite3, git
Maintainer: MCP Kanban Team <support@mcp-kanban.com>
Description: AI-powered task management system with MCP integration
 MCP Kanban is an advanced task management system that integrates with
 AI assistants through the Model Context Protocol (MCP).
EOF
        
        # Build package
        dpkg-deb --build "$deb_dir" "$build_dir/mcp-kanban_1.0.0_all.deb"
        log_success "Created .deb package: $build_dir/mcp-kanban_1.0.0_all.deb"
    fi
    
    # Create .rpm package
    if command -v rpmbuild &> /dev/null; then
        log_info "Creating .rpm package..."
        
        local rpm_build_root="$build_dir/rpm"
        mkdir -p "$rpm_build_root"/{BUILD,RPMS,SOURCES,SPECS,SRPMS}
        
        # Create spec file
        cat << EOF > "$rpm_build_root/SPECS/mcp-kanban.spec"
Name:           mcp-kanban
Version:        1.0.0
Release:        1%{?dist}
Summary:        AI-powered task management system with MCP integration

License:        MIT
URL:            https://github.com/$GITHUB_REPO
Source0:        %{name}-%{version}.tar.gz

Requires:       nodejs >= 18.0.0, sqlite, git
BuildArch:      noarch

%description
MCP Kanban is an advanced task management system that integrates with
AI assistants through the Model Context Protocol (MCP).

%prep
%setup -q

%build

%install
rm -rf %{buildroot}
mkdir -p %{buildroot}/opt/mcp-kanban
mkdir -p %{buildroot}/etc/systemd/system
mkdir -p %{buildroot}/usr/local/bin

cp -r * %{buildroot}/opt/mcp-kanban/
install -m 644 mcp-kanban.service %{buildroot}/etc/systemd/system/
install -m 755 kanban %{buildroot}/usr/local/bin/

%files
/opt/mcp-kanban
/etc/systemd/system/mcp-kanban.service
/usr/local/bin/kanban

%post
systemctl daemon-reload
systemctl enable mcp-kanban.service

%preun
systemctl stop mcp-kanban.service
systemctl disable mcp-kanban.service

%postun
systemctl daemon-reload

%changelog
* $(date +'%a %b %d %Y') MCP Kanban Team <support@mcp-kanban.com> - 1.0.0-1
- Initial package
EOF
        
        # Create source tarball
        tar -czf "$rpm_build_root/SOURCES/mcp-kanban-1.0.0.tar.gz" -C "$INSTALL_PATH" .
        
        # Build package
        rpmbuild --define "_topdir $rpm_build_root" -bb "$rpm_build_root/SPECS/mcp-kanban.spec"
        
        if [[ -f "$rpm_build_root/RPMS/noarch/mcp-kanban-1.0.0-1."*".noarch.rpm" ]]; then
            cp "$rpm_build_root/RPMS/noarch/"*.rpm "$build_dir/"
            log_success "Created .rpm package in $build_dir/"
        fi
    fi
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
    
    # Test service (if systemd)
    if [[ "$SERVICE_MANAGER" == "systemd" && "$INSTALL_SERVICE" == "true" ]]; then
        if sudo systemctl is-enabled mcp-kanban.service &> /dev/null; then
            log_success "Service enabled test passed"
        else
            log_warning "Service not enabled"
        fi
    fi
    
    return 0
}

# Show post-installation instructions
show_post_install() {
    echo ""
    log_success "🎉 MCP Kanban installation completed successfully!"
    echo ""
    echo -e "${CYAN}📁 Installation directory: $INSTALL_PATH${NC}"
    echo -e "${CYAN}🐧 Distribution: $DISTRO ($PACKAGE_MANAGER)${NC}"
    echo -e "${CYAN}⚙️  Service manager: $SERVICE_MANAGER${NC}"
    echo ""
    
    echo -e "${PURPLE}🚀 Getting Started:${NC}"
    if [[ "$INSTALL_SERVICE" == "true" ]]; then
        case "$SERVICE_MANAGER" in
            systemd)
                echo -e "${WHITE}  • Start service: sudo systemctl start mcp-kanban${NC}"
                echo -e "${WHITE}  • Stop service: sudo systemctl stop mcp-kanban${NC}"
                echo -e "${WHITE}  • Service status: sudo systemctl status mcp-kanban${NC}"
                echo -e "${WHITE}  • View logs: sudo journalctl -u mcp-kanban -f${NC}"
                ;;
            sysv)
                echo -e "${WHITE}  • Start service: sudo service mcp-kanban start${NC}"
                echo -e "${WHITE}  • Stop service: sudo service mcp-kanban stop${NC}"
                echo -e "${WHITE}  • Service status: sudo service mcp-kanban status${NC}"
                ;;
            openrc)
                echo -e "${WHITE}  • Start service: sudo rc-service mcp-kanban start${NC}"
                echo -e "${WHITE}  • Stop service: sudo rc-service mcp-kanban stop${NC}"
                echo -e "${WHITE}  • Service status: sudo rc-service mcp-kanban status${NC}"
                ;;
        esac
    else
        echo -e "${WHITE}  • Start manually: cd $INSTALL_PATH && npm start${NC}"
    fi
    
    echo -e "${WHITE}  • CLI tool: kanban --help${NC}"
    echo -e "${WHITE}  • Web interface: http://localhost:3000${NC}"
    echo -e "${WHITE}  • Health check: http://localhost:3000/api/health${NC}"
    
    if command -v nginx &> /dev/null; then
        echo -e "${WHITE}  • Nginx proxy: http://mcp-kanban.local${NC}"
    fi
    
    echo ""
    echo -e "${PURPLE}📚 Documentation:${NC}"
    echo -e "${WHITE}  • User Guide: $INSTALL_PATH/docs/user/README.md${NC}"
    echo -e "${WHITE}  • API Docs: $INSTALL_PATH/docs/api/API_REFERENCE.md${NC}"
    echo -e "${WHITE}  • Config: $INSTALL_PATH/config/${NC}"
    
    echo ""
    echo -e "${PURPLE}🔧 Configuration Files:${NC}"
    echo -e "${WHITE}  • Application: $INSTALL_PATH/config/default.json${NC}"
    echo -e "${WHITE}  • Database: $INSTALL_PATH/data/kanban.db${NC}"
    echo -e "${WHITE}  • Logs: $INSTALL_PATH/logs/${NC}"
    if [[ "$INSTALL_SERVICE" == "true" && "$SERVICE_MANAGER" == "systemd" ]]; then
        echo -e "${WHITE}  • Service: /etc/systemd/system/mcp-kanban.service${NC}"
    fi
    
    if [[ "$CREATE_PACKAGES" == "true" ]]; then
        echo ""
        echo -e "${PURPLE}📦 Created Packages:${NC}"
        echo -e "${WHITE}  • Check: /tmp/mcp-kanban-build/${NC}"
    fi
    
    echo ""
    echo -e "${PURPLE}❓ Need help?${NC}"
    echo -e "${WHITE}  • Documentation: https://github.com/$GITHUB_REPO/docs${NC}"
    echo -e "${WHITE}  • Issues: https://github.com/$GITHUB_REPO/issues${NC}"
    echo -e "${WHITE}  • Community: https://discord.gg/mcp-kanban${NC}"
    echo ""
}

# Main installation function
main() {
    show_banner
    parse_arguments "$@"
    
    log_info "Starting MCP Kanban installation for Linux..."
    log_debug "Installation path: $INSTALL_PATH"
    log_debug "Install method: $INSTALL_METHOD"
    log_debug "Development mode: $DEVELOPMENT_MODE"
    log_debug "Install service: $INSTALL_SERVICE"
    
    # System checks
    check_root
    detect_distribution
    
    # Installation process
    install_system_dependencies
    
    if [[ "$CREATE_USER" == "true" ]]; then
        create_system_user
    fi
    
    install_mcp_kanban
    create_cli_wrapper
    install_system_service
    create_nginx_config
    create_packages
    
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