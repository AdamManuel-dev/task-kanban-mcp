# PowerShell script for Windows environment variable setup
# Enhanced version with better error handling and Windows integration

param(
    [switch]$AsAdmin,
    [switch]$SystemWide,
    [string]$Environment = "development"
)

# Set error action preference
$ErrorActionPreference = "Stop"

Write-Host "MCP Kanban - Windows Environment Setup (PowerShell)" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green

# Function to check if running as administrator
function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Function to set environment variable
function Set-EnvironmentVariable {
    param(
        [string]$Name,
        [string]$Value,
        [string]$Target = "User"
    )
    
    try {
        [Environment]::SetEnvironmentVariable($Name, $Value, $Target)
        Write-Host "✓ Set $Name = $Value" -ForegroundColor Green
    }
    catch {
        Write-Warning "Failed to set $Name`: $($_.Exception.Message)"
    }
}

# Function to create directory with proper permissions
function New-DirectoryWithPermissions {
    param([string]$Path)
    
    if (-not (Test-Path $Path)) {
        try {
            New-Item -ItemType Directory -Path $Path -Force | Out-Null
            Write-Host "✓ Created directory: $Path" -ForegroundColor Green
        }
        catch {
            Write-Error "Failed to create directory $Path`: $($_.Exception.Message)"
        }
    } else {
        Write-Host "✓ Directory exists: $Path" -ForegroundColor Yellow
    }
}

# Check administrator privileges
$isAdmin = Test-Administrator
if ($SystemWide -and -not $isAdmin) {
    Write-Error "System-wide configuration requires administrator privileges. Run as administrator or remove -SystemWide flag."
    exit 1
}

if ($isAdmin) {
    Write-Host "✓ Running with administrator privileges" -ForegroundColor Green
} else {
    Write-Host "ℹ Running with user privileges (user-level configuration only)" -ForegroundColor Yellow
}

# Determine target for environment variables
$envTarget = if ($SystemWide -and $isAdmin) { "Machine" } else { "User" }
Write-Host "Environment target: $envTarget" -ForegroundColor Cyan

# Define base paths
$mcpHome = Join-Path $env:USERPROFILE ".mcp-kanban"
$dataDir = Join-Path $mcpHome "data"
$logDir = Join-Path $mcpHome "logs"
$backupDir = Join-Path $mcpHome "backups"
$configDir = Join-Path $mcpHome "config"

# Create directories
Write-Host "`nCreating application directories..." -ForegroundColor Cyan
New-DirectoryWithPermissions -Path $mcpHome
New-DirectoryWithPermissions -Path $dataDir
New-DirectoryWithPermissions -Path $logDir
New-DirectoryWithPermissions -Path $backupDir
New-DirectoryWithPermissions -Path $configDir

# Environment-specific configuration
$config = @{
    development = @{
        NODE_ENV = "development"
        LOG_LEVEL = "debug"
        JWT_SECRET = "dev-secret-change-in-production"
        API_KEY_SECRET = "dev-api-key-secret"
        CORS_ORIGIN = "http://localhost:3000,http://127.0.0.1:3000"
    }
    production = @{
        NODE_ENV = "production"
        LOG_LEVEL = "info"
        JWT_SECRET = [System.Web.Security.Membership]::GeneratePassword(32, 8)
        API_KEY_SECRET = [System.Web.Security.Membership]::GeneratePassword(32, 8)
        CORS_ORIGIN = "https://yourdomain.com"
    }
    staging = @{
        NODE_ENV = "staging"
        LOG_LEVEL = "info"
        JWT_SECRET = "staging-secret-change-in-production"
        API_KEY_SECRET = "staging-api-key-secret"
        CORS_ORIGIN = "https://staging.yourdomain.com"
    }
}

$envConfig = $config[$Environment]
if (-not $envConfig) {
    Write-Error "Invalid environment: $Environment. Valid options: development, production, staging"
    exit 1
}

Write-Host "`nConfiguring environment: $Environment" -ForegroundColor Cyan

# Base environment variables
$environmentVariables = @{
    # MCP Kanban specific
    MCP_KANBAN_HOME = $mcpHome
    MCP_KANBAN_DATA_DIR = $dataDir
    MCP_KANBAN_LOG_DIR = $logDir
    MCP_KANBAN_BACKUP_DIR = $backupDir
    MCP_KANBAN_CONFIG_DIR = $configDir
    
    # Database configuration
    DATABASE_URL = "sqlite:///$($dataDir -replace '\\', '/')/kanban.db"
    MCP_KANBAN_DB_FOLDER_PATH = $dataDir
    
    # Server configuration
    PORT = "3000"
    WEBSOCKET_PORT = "3001"
    MCP_SERVER_PORT = "3001"
    MCP_SERVER_HOST = "127.0.0.1"
    
    # Logging
    LOG_FILE = Join-Path $logDir "mcp-kanban.log"
    
    # Performance
    MAX_MEMORY = "512"
    NODE_OPTIONS = "--max-old-space-size=512"
    
    # Backup configuration
    BACKUP_SCHEDULE = "0 2 * * *"
    BACKUP_RETENTION_DAYS = "30"
    BACKUP_COMPRESSION = "gzip"
    
    # Windows-specific
    SHELL = "powershell"
    TERM = "windows"
    PATH_SEPARATOR = ";"
}

# Add environment-specific variables
foreach ($key in $envConfig.Keys) {
    $environmentVariables[$key] = $envConfig[$key]
}

# Set environment variables
Write-Host "`nSetting environment variables..." -ForegroundColor Cyan
foreach ($var in $environmentVariables.GetEnumerator()) {
    Set-EnvironmentVariable -Name $var.Key -Value $var.Value -Target $envTarget
}

# Create configuration files
Write-Host "`nCreating configuration files..." -ForegroundColor Cyan

# Windows environment file
$windowsEnvPath = Join-Path $configDir "windows.env"
$envContent = @"
# MCP Kanban Windows Configuration
# Generated on $(Get-Date)
# Environment: $Environment

"@

foreach ($var in $environmentVariables.GetEnumerator()) {
    $envContent += "$($var.Key)=$($var.Value)`n"
}

$envContent | Out-File -FilePath $windowsEnvPath -Encoding UTF8
Write-Host "✓ Created: $windowsEnvPath" -ForegroundColor Green

# PowerShell profile integration
$profileIntegration = @"
# MCP Kanban Environment Loader
function Load-MCPKanbanEnvironment {
    `$envFile = "$windowsEnvPath"
    if (Test-Path `$envFile) {
        Get-Content `$envFile | ForEach-Object {
            if (`$_ -match "^([^#][^=]*)=(.*)$") {
                `$env:$(`$matches[1]) = `$matches[2]
            }
        }
        Write-Host "MCP Kanban environment loaded" -ForegroundColor Green
    }
}

# Auto-load MCP Kanban environment
Load-MCPKanbanEnvironment
"@

$profilePath = Join-Path $configDir "mcp-kanban-profile.ps1"
$profileIntegration | Out-File -FilePath $profilePath -Encoding UTF8
Write-Host "✓ Created PowerShell profile: $profilePath" -ForegroundColor Green

# Windows service configuration
$serviceConfig = @"
# Windows Service Configuration for MCP Kanban
ServiceName=MCPKanbanServer
DisplayName=MCP Kanban Server
Description=MCP Kanban Board Management Server
StartType=Automatic
WorkingDirectory=$(Get-Location)
ExecutablePath=node.exe dist\server.js
Environment=$Environment
LogPath=$logDir\service.log
"@

$serviceConfigPath = Join-Path $configDir "service.conf"
$serviceConfig | Out-File -FilePath $serviceConfigPath -Encoding UTF8
Write-Host "✓ Created service config: $serviceConfigPath" -ForegroundColor Green

# Create startup scripts
Write-Host "`nCreating startup scripts..." -ForegroundColor Cyan

# PowerShell startup script
$psStartupScript = @"
# MCP Kanban PowerShell Startup Script
param([switch]`$Development)

Write-Host "Starting MCP Kanban Server..." -ForegroundColor Green

# Load environment
. "$profilePath"

# Change to application directory
Set-Location "$(Get-Location)"

# Check Node.js
try {
    `$nodeVersion = node --version
    Write-Host "Node.js version: `$nodeVersion" -ForegroundColor Green
} catch {
    Write-Error "Node.js not found. Please install Node.js from https://nodejs.org/"
    exit 1
}

# Check npm
try {
    `$npmVersion = npm --version
    Write-Host "npm version: `$npmVersion" -ForegroundColor Green
} catch {
    Write-Error "npm not found. Please ensure npm is properly installed."
    exit 1
}

# Install dependencies if needed
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# Build if needed
if (-not (Test-Path "dist")) {
    Write-Host "Building application..." -ForegroundColor Yellow
    npm run build
}

# Start application
if (`$Development) {
    Write-Host "Starting in development mode..." -ForegroundColor Yellow
    npm run dev
} else {
    Write-Host "Starting in production mode..." -ForegroundColor Green
    npm start
}
"@

$psStartupPath = Join-Path $mcpHome "start-mcp-kanban.ps1"
$psStartupScript | Out-File -FilePath $psStartupPath -Encoding UTF8
Write-Host "✓ Created PowerShell startup script: $psStartupPath" -ForegroundColor Green

# Create Windows service installer
$serviceInstaller = @"
# Windows Service Installer for MCP Kanban
param([switch]`$Uninstall)

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "This script must be run as Administrator"
    exit 1
}

`$serviceName = "MCPKanbanServer"
`$serviceDisplayName = "MCP Kanban Server"
`$serviceDescription = "MCP Kanban Board Management Server"
`$servicePath = "node.exe `"$(Get-Location)\dist\server.js`""

if (`$Uninstall) {
    Write-Host "Uninstalling service..." -ForegroundColor Yellow
    
    if (Get-Service -Name `$serviceName -ErrorAction SilentlyContinue) {
        Stop-Service -Name `$serviceName -Force
        sc.exe delete `$serviceName
        Write-Host "Service uninstalled successfully" -ForegroundColor Green
    } else {
        Write-Host "Service not found" -ForegroundColor Yellow
    }
} else {
    Write-Host "Installing service..." -ForegroundColor Green
    
    # Create service
    sc.exe create `$serviceName binPath= `$servicePath DisplayName= `$serviceDisplayName start= auto
    sc.exe description `$serviceName `$serviceDescription
    
    # Set service to restart on failure
    sc.exe failure `$serviceName reset= 0 actions= restart/5000/restart/5000/restart/5000
    
    Write-Host "Service installed successfully" -ForegroundColor Green
    Write-Host "Starting service..." -ForegroundColor Yellow
    Start-Service -Name `$serviceName
    Write-Host "Service started" -ForegroundColor Green
}
"@

$serviceInstallerPath = Join-Path $mcpHome "install-service.ps1"
$serviceInstaller | Out-File -FilePath $serviceInstallerPath -Encoding UTF8
Write-Host "✓ Created service installer: $serviceInstallerPath" -ForegroundColor Green

# Check prerequisites
Write-Host "`nChecking prerequisites..." -ForegroundColor Cyan

try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Warning "Node.js not found. Please install from https://nodejs.org/"
}

try {
    $npmVersion = npm --version
    Write-Host "✓ npm found: $npmVersion" -ForegroundColor Green
} catch {
    Write-Warning "npm not found. Please ensure npm is properly installed."
}

# Create Windows registry entries
if ($isAdmin) {
    Write-Host "`nCreating registry entries..." -ForegroundColor Cyan
    try {
        New-Item -Path "HKLM:\SOFTWARE\MCPKanban" -Force | Out-Null
        Set-ItemProperty -Path "HKLM:\SOFTWARE\MCPKanban" -Name "InstallPath" -Value (Get-Location)
        Set-ItemProperty -Path "HKLM:\SOFTWARE\MCPKanban" -Name "DataPath" -Value $dataDir
        Set-ItemProperty -Path "HKLM:\SOFTWARE\MCPKanban" -Name "Version" -Value "1.0.0"
        Set-ItemProperty -Path "HKLM:\SOFTWARE\MCPKanban" -Name "Environment" -Value $Environment
        Set-ItemProperty -Path "HKLM:\SOFTWARE\MCPKanban" -Name "ConfiguredDate" -Value (Get-Date).ToString()
        Write-Host "✓ Registry entries created" -ForegroundColor Green
    } catch {
        Write-Warning "Failed to create registry entries: $($_.Exception.Message)"
    }
}

# Set file permissions
Write-Host "`nSetting file permissions..." -ForegroundColor Cyan
try {
    $acl = Get-Acl $mcpHome
    $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule($env:USERNAME, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
    $acl.SetAccessRule($accessRule)
    Set-Acl -Path $mcpHome -AclObject $acl
    Write-Host "✓ File permissions set" -ForegroundColor Green
} catch {
    Write-Warning "Failed to set file permissions: $($_.Exception.Message)"
}

# Summary
Write-Host "`n" -NoNewline
Write-Host "Windows environment setup completed successfully!" -ForegroundColor Green -BackgroundColor Black
Write-Host ""
Write-Host "Configuration Summary:" -ForegroundColor Cyan
Write-Host "=====================" -ForegroundColor Cyan
Write-Host "Environment:    $Environment"
Write-Host "Target:         $envTarget"
Write-Host "Home Directory: $mcpHome"
Write-Host "Data Directory: $dataDir"
Write-Host "Log Directory:  $logDir"  
Write-Host "Database URL:   $($environmentVariables.DATABASE_URL)"
Write-Host "Server Port:    $($environmentVariables.PORT)"
Write-Host "WebSocket Port: $($environmentVariables.WEBSOCKET_PORT)"
Write-Host "MCP Port:       $($environmentVariables.MCP_SERVER_PORT)"
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "===========" -ForegroundColor Yellow
Write-Host "1. Restart PowerShell to load new environment variables"
Write-Host "2. Run: npm install"
Write-Host "3. Run: npm run build"
Write-Host "4. Start with: . `"$psStartupPath`""
Write-Host ""
Write-Host "For automatic environment loading, add this to your PowerShell profile:"
Write-Host ". `"$profilePath`"" -ForegroundColor Gray
Write-Host ""
Write-Host "To install as Windows service (requires admin):"
Write-Host ". `"$serviceInstallerPath`"" -ForegroundColor Gray
Write-Host ""

# Offer to add to PowerShell profile
$addToProfile = Read-Host "Add MCP Kanban environment to your PowerShell profile? (y/n)"
if ($addToProfile -eq 'y' -or $addToProfile -eq 'Y') {
    try {
        $profileLine = ". `"$profilePath`""
        if (Test-Path $PROFILE) {
            $profileContent = Get-Content $PROFILE
            if ($profileContent -notcontains $profileLine) {
                Add-Content -Path $PROFILE -Value "`n# MCP Kanban Environment"
                Add-Content -Path $PROFILE -Value $profileLine
                Write-Host "✓ Added to PowerShell profile" -ForegroundColor Green
            } else {
                Write-Host "Already in PowerShell profile" -ForegroundColor Yellow
            }
        } else {
            New-Item -ItemType File -Path $PROFILE -Force | Out-Null
            Add-Content -Path $PROFILE -Value "# MCP Kanban Environment"
            Add-Content -Path $PROFILE -Value $profileLine
            Write-Host "✓ Created PowerShell profile and added MCP Kanban environment" -ForegroundColor Green
        }
    } catch {
        Write-Warning "Failed to update PowerShell profile: $($_.Exception.Message)"
    }
}

Write-Host "`nSetup complete! 🎉" -ForegroundColor Green