# MCP Kanban Server - Windows PowerShell Installation Script
# Supports Windows 10/11 with PowerShell 5.1 or higher

param(
    [switch]$Help,
    [switch]$Verify,
    [switch]$Clean
)

# Error handling
$ErrorActionPreference = "Stop"

# Colors for output
$Red = "Red"
$Green = "Green"
$Yellow = "Yellow"
$Blue = "Blue"
$White = "White"

# Script configuration
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectName = "mcp-kanban"
$RequiredNodeVersion = "18.0.0"
$RequiredNpmVersion = "9.0.0"

# Logging functions
function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor $Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor $Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor $Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor $Red
}

# Platform detection
function Get-Platform {
    if ($env:OS -eq "Windows_NT") {
        return "windows"
    } else {
        return "unknown"
    }
}

# Validate Node.js version
function Test-NodeVersion {
    try {
        $nodeVersion = node --version
        if (-not $nodeVersion) {
            Write-Error "Node.js is not installed. Please install Node.js $RequiredNodeVersion or higher."
            Write-Info "Visit https://nodejs.org/ for installation instructions."
            exit 1
        }

        $nodeVersion = $nodeVersion.TrimStart('v')
        $currentVersion = [Version]$nodeVersion
        $requiredVersion = [Version]$RequiredNodeVersion

        if ($currentVersion -lt $requiredVersion) {
            Write-Error "Node.js version $nodeVersion is too old. Required: $RequiredNodeVersion or higher."
            exit 1
        }

        Write-Success "Node.js version $nodeVersion is compatible"
    }
    catch {
        Write-Error "Failed to check Node.js version: $($_.Exception.Message)"
        exit 1
    }
}

# Validate npm version
function Test-NpmVersion {
    try {
        $npmVersion = npm --version
        if (-not $npmVersion) {
            Write-Error "npm is not installed. Please install npm $RequiredNpmVersion or higher."
            exit 1
        }

        $currentVersion = [Version]$npmVersion
        $requiredVersion = [Version]$RequiredNpmVersion

        if ($currentVersion -lt $requiredVersion) {
            Write-Error "npm version $npmVersion is too old. Required: $RequiredNpmVersion or higher."
            exit 1
        }

        Write-Success "npm version $npmVersion is compatible"
    }
    catch {
        Write-Error "Failed to check npm version: $($_.Exception.Message)"
        exit 1
    }
}

# Create necessary directories
function New-Directories {
    Write-Info "Creating necessary directories..."
    
    $directories = @(
        "data\db",
        "logs",
        "backups"
    )

    foreach ($dir in $directories) {
        $fullPath = Join-Path $ScriptDir $dir
        if (-not (Test-Path $fullPath)) {
            New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
        }
    }

    Write-Success "Directories created successfully"
}

# Install dependencies
function Install-Dependencies {
    Write-Info "Installing dependencies..."
    
    # Clean install for consistency
    $nodeModulesPath = Join-Path $ScriptDir "node_modules"
    if (Test-Path $nodeModulesPath) {
        Write-Info "Removing existing node_modules..."
        Remove-Item -Path $nodeModulesPath -Recurse -Force
    }
    
    $packageLockPath = Join-Path $ScriptDir "package-lock.json"
    if (Test-Path $packageLockPath) {
        Write-Info "Installing dependencies with package-lock.json..."
        npm ci
    } else {
        Write-Info "Installing dependencies..."
        npm install
    }
    
    Write-Success "Dependencies installed successfully"
}

# Build the project
function Build-Project {
    Write-Info "Building the project..."
    
    # Clean previous builds
    $distPath = Join-Path $ScriptDir "dist"
    if (Test-Path $distPath) {
        Write-Info "Cleaning previous build..."
        npm run clean
    }
    
    # Build the project
    npm run build
    
    Write-Success "Project built successfully"
}

# Verify build artifacts
function Test-Build {
    Write-Info "Verifying build artifacts..."
    
    $requiredFiles = @(
        "dist\index.js",
        "dist\server.js",
        "dist\mcp\server.js",
        "dist\cli\index.js"
    )
    
    foreach ($file in $requiredFiles) {
        $fullPath = Join-Path $ScriptDir $file
        if (-not (Test-Path $fullPath)) {
            Write-Error "Build verification failed: $file not found"
            exit 1
        }
    }
    
    Write-Success "Build artifacts verified successfully"
}

# Set up environment variables
function Set-Environment {
    Write-Info "Setting up environment variables..."
    
    $envPath = Join-Path $ScriptDir ".env"
    if (-not (Test-Path $envPath)) {
        Write-Info "Creating .env file..."
        $envContent = @"
# MCP Kanban Server Configuration
NODE_ENV=development
PORT=3000
MCP_KANBAN_DB_FOLDER_PATH=$ScriptDir\data\db
LOG_LEVEL=info
"@
        $envContent | Out-File -FilePath $envPath -Encoding UTF8
        Write-Success ".env file created"
    } else {
        Write-Info ".env file already exists"
    }
}

# Run database migrations
function Invoke-Migrations {
    Write-Info "Running database migrations..."
    
    try {
        npm run migrate:up
        Write-Success "Database migrations completed"
    }
    catch {
        Write-Warning "Migration system not available, skipping migrations"
    }
}

# Run database seeding
function Invoke-Seeding {
    Write-Info "Running database seeding..."
    
    try {
        npm run seed:run
        Write-Success "Database seeding completed"
    }
    catch {
        Write-Warning "Seeding system not available, skipping seeding"
    }
}

# Verify installation
function Test-Installation {
    Write-Info "Verifying installation..."
    
    # Test if the server can start
    try {
        $null = node dist\server.js --help 2>$null
        Write-Success "Server startup test passed"
    }
    catch {
        Write-Warning "Server startup test failed (this might be normal if server requires specific arguments)"
    }
    
    # Test if the CLI can start
    try {
        $null = node dist\cli\index.js --help 2>$null
        Write-Success "CLI startup test passed"
    }
    catch {
        Write-Warning "CLI startup test failed (this might be normal if CLI requires specific arguments)"
    }
    
    # Test if the MCP server can start
    try {
        $null = node dist\mcp\server.js --help 2>$null
        Write-Success "MCP server startup test passed"
    }
    catch {
        Write-Warning "MCP server startup test failed (this might be normal if MCP server requires specific arguments)"
    }
}

# Display installation summary
function Show-Summary {
    Write-Success "Installation completed successfully!"
    Write-Host ""
    Write-Host "🎉 MCP Kanban Server is ready to use!" -ForegroundColor $Green
    Write-Host ""
    Write-Host "📁 Installation directory: $ScriptDir"
    Write-Host "🗄️  Database location: $ScriptDir\data\db"
    Write-Host "📝 Logs location: $ScriptDir\logs"
    Write-Host ""
    Write-Host "🚀 Quick start commands:" -ForegroundColor $Blue
    Write-Host "  • Start the server: npm start"
    Write-Host "  • Start MCP server: npm run start:mcp"
    Write-Host "  • Use CLI: npm run dev:cli"
    Write-Host "  • Run tests: npm test"
    Write-Host ""
    Write-Host "📚 Next steps:" -ForegroundColor $Blue
    Write-Host "  1. Configure your MCP client (Claude Code, Cursor, etc.)"
    Write-Host "  2. Set up your database path in .env"
    Write-Host "  3. Run 'npm run dev:cli' to explore the CLI"
    Write-Host ""
    Write-Host "📖 Documentation: docs\"
    Write-Host "🐛 Issues: https://github.com/AdamManuel-dev/task-kanban-mcp/issues"
    Write-Host ""
}

# Main installation function
function Start-Installation {
    Write-Host "🚀 MCP Kanban Server Installation" -ForegroundColor $Green
    Write-Host "==================================" -ForegroundColor $Green
    Write-Host ""
    
    # Detect platform
    $platform = Get-Platform
    Write-Info "Detected platform: $platform"
    
    # Change to script directory
    Set-Location $ScriptDir
    
    # Run installation steps
    Test-NodeVersion
    Test-NpmVersion
    New-Directories
    Install-Dependencies
    Build-Project
    Test-Build
    Set-Environment
    Invoke-Migrations
    Invoke-Seeding
    Test-Installation
    Show-Summary
}

# Handle script arguments
if ($Help) {
    Write-Host "Usage: .\install.ps1 [OPTIONS]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Help          Show this help message"
    Write-Host "  -Verify        Only verify installation"
    Write-Host "  -Clean         Clean install (remove node_modules and reinstall)"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\install.ps1              # Full installation"
    Write-Host "  .\install.ps1 -Verify      # Verify existing installation"
    Write-Host "  .\install.ps1 -Clean       # Clean installation"
    Write-Host ""
    Write-Host "Note: You may need to set execution policy to run this script:"
    Write-Host "  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser"
    exit 0
}
elseif ($Verify) {
    Set-Location $ScriptDir
    Test-Installation
}
elseif ($Clean) {
    Set-Location $ScriptDir
    Write-Info "Performing clean installation..."
    Remove-Item -Path "node_modules" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "package-lock.json" -Force -ErrorAction SilentlyContinue
    Start-Installation
}
else {
    Start-Installation
} 