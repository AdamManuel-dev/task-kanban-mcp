# MCP Kanban Installation Script for Windows PowerShell
# Requires PowerShell 5.1 or later

#Requires -Version 5.1

[CmdletBinding()]
param(
    [Parameter(HelpMessage="Installation directory path")]
    [string]$InstallPath = "$env:USERPROFILE\mcp-kanban",
    
    [Parameter(HelpMessage="Skip dependency checks")]
    [switch]$SkipDependencyCheck,
    
    [Parameter(HelpMessage="Development installation (includes dev dependencies)")]
    [switch]$Development,
    
    [Parameter(HelpMessage="Verbose output")]
    [switch]$Verbose,
    
    [Parameter(HelpMessage="Install as Windows service")]
    [switch]$InstallService,
    
    [Parameter(HelpMessage="Force reinstallation")]
    [switch]$Force
)

# Error handling
$ErrorActionPreference = "Stop"
$ProgressPreference = "Continue"

# Colors for output
$colors = @{
    Info = "Cyan"
    Success = "Green"
    Warning = "Yellow"
    Error = "Red"
    Highlight = "Magenta"
}

function Write-ColoredOutput {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Message,
        
        [Parameter(Mandatory=$true)]
        [string]$Type
    )
    
    $color = $colors[$Type]
    if ($color) {
        Write-Host $Message -ForegroundColor $color
    } else {
        Write-Host $Message
    }
}

function Write-Banner {
    Write-Host ""
    Write-ColoredOutput "╔══════════════════════════════════════════════════════════════╗" "Highlight"
    Write-ColoredOutput "║                    MCP Kanban Installer                      ║" "Highlight"
    Write-ColoredOutput "║              AI-Powered Task Management System               ║" "Highlight"
    Write-ColoredOutput "╚══════════════════════════════════════════════════════════════╝" "Highlight"
    Write-Host ""
}

function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-ExecutionPolicy {
    $policy = Get-ExecutionPolicy
    $allowedPolicies = @("Unrestricted", "RemoteSigned", "Bypass")
    
    if ($policy -notin $allowedPolicies) {
        Write-ColoredOutput "⚠️  Current PowerShell execution policy: $policy" "Warning"
        Write-ColoredOutput "This script requires ExecutionPolicy to be 'RemoteSigned' or 'Unrestricted'" "Warning"
        
        if (Test-Administrator) {
            $response = Read-Host "Would you like to change the execution policy? (y/N)"
            if ($response -eq 'y' -or $response -eq 'Y') {
                try {
                    Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
                    Write-ColoredOutput "✅ Execution policy updated successfully" "Success"
                } catch {
                    Write-ColoredOutput "❌ Failed to update execution policy: $_" "Error"
                    Write-ColoredOutput "Please run: Set-ExecutionPolicy RemoteSigned -Scope CurrentUser" "Info"
                    exit 1
                }
            } else {
                Write-ColoredOutput "Installation cancelled. Please update execution policy manually." "Warning"
            exit 1
        }
        } else {
            Write-ColoredOutput "Please run as Administrator or change execution policy manually:" "Info"
            Write-ColoredOutput "Set-ExecutionPolicy RemoteSigned -Scope CurrentUser" "Info"
            exit 1
        }
    }
}

function Test-Dependencies {
    Write-ColoredOutput "🔍 Checking system dependencies..." "Info"
    
    $dependencies = @{
        "Node.js" = @{
            Command = "node"
            Args = @("--version")
            MinVersion = "18.0.0"
            DownloadUrl = "https://nodejs.org/download"
    }
        "npm" = @{
            Command = "npm"
            Args = @("--version")
            MinVersion = "8.0.0"
            DownloadUrl = "https://nodejs.org/download"
        }
        "Git" = @{
            Command = "git"
            Args = @("--version")
            MinVersion = "2.0.0"
            DownloadUrl = "https://git-scm.com/download/win"
    }
}

    $missing = @()
    
    foreach ($dep in $dependencies.GetEnumerator()) {
        $name = $dep.Key
        $config = $dep.Value
        
        try {
            $result = & $config.Command $config.Args 2>$null
            if ($LASTEXITCODE -eq 0) {
                # Extract version number
                $version = if ($result -match '(\d+\.\d+\.\d+)') { $matches[1] } else { "unknown" }
                Write-ColoredOutput "  ✅ $name $version" "Success"
                
                # Check minimum version if specified
                if ($config.MinVersion -and $version -ne "unknown") {
                    $currentVersion = [Version]$version
                    $minVersion = [Version]$config.MinVersion
                    if ($currentVersion -lt $minVersion) {
                        Write-ColoredOutput "  ⚠️  $name version $version is below minimum required $($config.MinVersion)" "Warning"
                        $missing += @{Name = $name; Url = $config.DownloadUrl; Current = $version; Required = $config.MinVersion}
                    }
                }
            } else {
                throw "Command failed"
            }
        } catch {
            Write-ColoredOutput "  ❌ $name not found" "Error"
            $missing += @{Name = $name; Url = $config.DownloadUrl; Current = "Not installed"; Required = $config.MinVersion}
        }
    }
    
    if ($missing.Count -gt 0) {
        Write-ColoredOutput "`n⚠️  Missing or outdated dependencies:" "Warning"
        foreach ($dep in $missing) {
            Write-ColoredOutput "  • $($dep.Name) (Current: $($dep.Current), Required: $($dep.Required))" "Warning"
            Write-ColoredOutput "    Download from: $($dep.Url)" "Info"
        }
        
        if (-not $SkipDependencyCheck) {
            Write-ColoredOutput "`nPlease install the missing dependencies and run the script again." "Error"
            Write-ColoredOutput "Or use -SkipDependencyCheck to proceed anyway (not recommended)." "Info"
            exit 1
        }
    }
}

function Install-MCPKanban {
    param(
        [string]$InstallPath,
        [bool]$IsDevelopment
    )
    
    Write-ColoredOutput "📦 Installing MCP Kanban to: $InstallPath" "Info"
    
    # Create installation directory
    if (Test-Path $InstallPath) {
        if ($Force) {
            Write-ColoredOutput "🗑️  Removing existing installation..." "Warning"
            Remove-Item $InstallPath -Recurse -Force
        } else {
            $response = Read-Host "Installation directory exists. Overwrite? (y/N)"
            if ($response -ne 'y' -and $response -ne 'Y') {
                Write-ColoredOutput "Installation cancelled." "Warning"
                exit 1
            }
            Remove-Item $InstallPath -Recurse -Force
        }
    }
    
    New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
    Set-Location $InstallPath
    
    # Clone repository
    Write-ColoredOutput "📥 Downloading MCP Kanban..." "Info"
    $cloneArgs = @("clone", "https://github.com/yourusername/mcp-kanban.git", ".")
    
    try {
        & git @cloneArgs
        if ($LASTEXITCODE -ne 0) {
            throw "Git clone failed"
        }
    } catch {
        Write-ColoredOutput "❌ Failed to download repository: $_" "Error"
        exit 1
}

# Install dependencies
    Write-ColoredOutput "📦 Installing Node.js dependencies..." "Info"
    
    try {
        if ($IsDevelopment) {
            & npm install
        } else {
            & npm ci --only=production
        }
        
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed"
        }
    } catch {
        Write-ColoredOutput "❌ Failed to install dependencies: $_" "Error"
        exit 1
    }
    
    # Build project
    Write-ColoredOutput "🔨 Building project..." "Info"
    
    try {
        & npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "Build failed"
        }
    } catch {
        Write-ColoredOutput "❌ Build failed: $_" "Error"
        exit 1
    }
    
    # Initialize database
    Write-ColoredOutput "🗄️  Initializing database..." "Info"
    
    # Create data directory
    $dataPath = Join-Path $InstallPath "data"
    New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
    
    try {
        & npm run migrate
        if ($LASTEXITCODE -eq 0) {
            & npm run seed
        }
    } catch {
        Write-ColoredOutput "⚠️  Database initialization failed, will initialize on first run" "Warning"
    }
}

function Install-WindowsService {
    param(
        [string]$InstallPath
    )
    
    if (-not (Test-Administrator)) {
        Write-ColoredOutput "❌ Administrator privileges required to install Windows service" "Error"
        return $false
    }
    
    Write-ColoredOutput "🔧 Installing Windows service..." "Info"
    
    $serviceName = "MCPKanban"
    $serviceDisplayName = "MCP Kanban Task Management"
    $serviceDescription = "AI-powered task management system with MCP integration"
    $executablePath = Join-Path $InstallPath "dist\index.js"
    $nodeExe = (Get-Command node).Source
    
    # Create service wrapper script
    $wrapperScript = @"
@echo off
cd /d "$InstallPath"
"$nodeExe" "$executablePath"
"@
    
    $wrapperPath = Join-Path $InstallPath "service-wrapper.bat"
    $wrapperScript | Out-File -FilePath $wrapperPath -Encoding ASCII
    
    try {
        # Remove existing service if it exists
        $existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
        if ($existingService) {
            Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
            & sc.exe delete $serviceName
        }
        
        # Create new service
        & sc.exe create $serviceName binPath= $wrapperPath start= auto DisplayName= $serviceDisplayName
        & sc.exe description $serviceName $serviceDescription
        
        # Configure service recovery options
        & sc.exe failure $serviceName reset= 0 actions= restart/5000/restart/10000/restart/30000
        
        Write-ColoredOutput "✅ Windows service installed successfully" "Success"
        Write-ColoredOutput "Service name: $serviceName" "Info"
        Write-ColoredOutput "To start: Start-Service $serviceName" "Info"
        Write-ColoredOutput "To stop: Stop-Service $serviceName" "Info"
        
        return $true
    } catch {
        Write-ColoredOutput "❌ Failed to install Windows service: $_" "Error"
        return $false
    }
}

function Add-PathEnvironment {
    param(
        [string]$InstallPath
    )
    
    Write-ColoredOutput "🔧 Adding to PATH environment..." "Info"
    
    $binPath = Join-Path $InstallPath "bin"
    New-Item -ItemType Directory -Path $binPath -Force | Out-Null
    
    # Create kanban.cmd wrapper
    $wrapperContent = @"
@echo off
node "$InstallPath\dist\cli\index.js" %*
"@
    
    $wrapperPath = Join-Path $binPath "kanban.cmd"
    $wrapperContent | Out-File -FilePath $wrapperPath -Encoding ASCII
    
    # Add to user PATH
    $currentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    if ($currentPath -notlike "*$binPath*") {
        $newPath = if ($currentPath) { "$currentPath;$binPath" } else { $binPath }
        [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
        Write-ColoredOutput "✅ Added to PATH: $binPath" "Success"
        Write-ColoredOutput "Restart your terminal to use 'kanban' command" "Info"
    } else {
        Write-ColoredOutput "ℹ️  Already in PATH: $binPath" "Info"
    }
}

function Create-DesktopShortcut {
    param(
        [string]$InstallPath
    )
    
    Write-ColoredOutput "🖥️  Creating desktop shortcuts..." "Info"
    
    $shell = New-Object -ComObject WScript.Shell
    $desktop = $shell.SpecialFolders("Desktop")
    
    # Server shortcut
    $serverShortcut = $shell.CreateShortcut("$desktop\MCP Kanban Server.lnk")
    $serverShortcut.TargetPath = "node"
    $serverShortcut.Arguments = "dist\index.js"
    $serverShortcut.WorkingDirectory = $InstallPath
    $serverShortcut.Description = "Start MCP Kanban Server"
    $serverShortcut.IconLocation = "shell32.dll,21"
    $serverShortcut.Save()
    
    # CLI shortcut
    $cliShortcut = $shell.CreateShortcut("$desktop\MCP Kanban CLI.lnk")
    $cliShortcut.TargetPath = "cmd"
    $cliShortcut.Arguments = "/k `"cd /d `"$InstallPath`" && node dist\cli\index.js`""
    $cliShortcut.Description = "MCP Kanban Command Line Interface"
    $cliShortcut.IconLocation = "shell32.dll,25"
    $cliShortcut.Save()
    
    Write-ColoredOutput "✅ Desktop shortcuts created" "Success"
}

function Create-StartMenuShortcuts {
    param(
        [string]$InstallPath
    )
    
    Write-ColoredOutput "📋 Creating Start Menu shortcuts..." "Info"
    
    $shell = New-Object -ComObject WScript.Shell
    $startMenu = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs"
    $mcpFolder = "$startMenu\MCP Kanban"
    
    New-Item -ItemType Directory -Path $mcpFolder -Force | Out-Null
    
    # Server shortcut
    $serverShortcut = $shell.CreateShortcut("$mcpFolder\MCP Kanban Server.lnk")
    $serverShortcut.TargetPath = "node"
    $serverShortcut.Arguments = "dist\index.js"
    $serverShortcut.WorkingDirectory = $InstallPath
    $serverShortcut.Description = "Start MCP Kanban Server"
    $serverShortcut.Save()
    
    # CLI shortcut
    $cliShortcut = $shell.CreateShortcut("$mcpFolder\MCP Kanban CLI.lnk")
    $cliShortcut.TargetPath = "cmd"
    $cliShortcut.Arguments = "/k `"cd /d `"$InstallPath`" && node dist\cli\index.js`""
    $cliShortcut.Description = "MCP Kanban Command Line Interface"
    $cliShortcut.Save()
    
    # Uninstall shortcut
    $uninstallShortcut = $shell.CreateShortcut("$mcpFolder\Uninstall MCP Kanban.lnk")
    $uninstallShortcut.TargetPath = "powershell"
    $uninstallShortcut.Arguments = "-ExecutionPolicy Bypass -File `"$InstallPath\uninstall.ps1`""
    $uninstallShortcut.Description = "Uninstall MCP Kanban"
    $uninstallShortcut.Save()
    
    Write-ColoredOutput "✅ Start Menu shortcuts created" "Success"
}

function Create-UninstallScript {
    param(
        [string]$InstallPath
    )
    
    $uninstallScript = @"
# MCP Kanban Uninstaller
param([switch]`$Force)

Write-Host "MCP Kanban Uninstaller" -ForegroundColor Cyan

if (-not `$Force) {
    `$response = Read-Host "Are you sure you want to uninstall MCP Kanban? (y/N)"
    if (`$response -ne 'y' -and `$response -ne 'Y') {
        Write-Host "Uninstall cancelled." -ForegroundColor Yellow
        exit 0
    }
}

# Stop and remove Windows service
`$service = Get-Service -Name "MCPKanban" -ErrorAction SilentlyContinue
if (`$service) {
    Write-Host "Removing Windows service..." -ForegroundColor Yellow
    Stop-Service -Name "MCPKanban" -Force -ErrorAction SilentlyContinue
    & sc.exe delete "MCPKanban"
    }

# Remove from PATH
`$binPath = "$InstallPath\bin"
`$currentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if (`$currentPath -like "*`$binPath*") {
    `$newPath = (`$currentPath -split ";") | Where-Object { `$_ -ne `$binPath } | Join-String -Separator ";"
    [Environment]::SetEnvironmentVariable("PATH", `$newPath, "User")
    Write-Host "Removed from PATH" -ForegroundColor Green
}

# Remove shortcuts
Remove-Item "`$env:USERPROFILE\Desktop\MCP Kanban*.lnk" -ErrorAction SilentlyContinue
Remove-Item "`$env:APPDATA\Microsoft\Windows\Start Menu\Programs\MCP Kanban" -Recurse -Force -ErrorAction SilentlyContinue

# Remove installation directory
Remove-Item "$InstallPath" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "MCP Kanban has been uninstalled successfully." -ForegroundColor Green
"@
    
    $uninstallPath = Join-Path $InstallPath "uninstall.ps1"
    $uninstallScript | Out-File -FilePath $uninstallPath -Encoding UTF8
}

function Test-Installation {
    param(
        [string]$InstallPath
    )
    
    Write-ColoredOutput "🧪 Testing installation..." "Info"
    
    Set-Location $InstallPath
    
    # Test CLI
    try {
        $result = & node "dist\cli\index.js" "--version" 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-ColoredOutput "  ✅ CLI test passed" "Success"
        } else {
            Write-ColoredOutput "  ❌ CLI test failed" "Error"
            return $false
    }
    } catch {
        Write-ColoredOutput "  ❌ CLI test failed: $_" "Error"
        return $false
    }
    
    # Test server startup (quick test)
    try {
        $job = Start-Job -ScriptBlock { 
            param($path)
            Set-Location $path
            & node "dist\index.js"
        } -ArgumentList $InstallPath
        
        Start-Sleep -Seconds 5
        
        if ($job.State -eq "Running") {
            Write-ColoredOutput "  ✅ Server startup test passed" "Success"
            Stop-Job $job
            Remove-Job $job
            return $true
        } else {
            Write-ColoredOutput "  ❌ Server startup test failed" "Error"
            Remove-Job $job
            return $false
        }
    } catch {
        Write-ColoredOutput "  ❌ Server startup test failed: $_" "Error"
        return $false
    }
}

function Show-PostInstallInstructions {
    param(
        [string]$InstallPath,
        [bool]$ServiceInstalled
    )
    
    Write-Host ""
    Write-ColoredOutput "🎉 Installation completed successfully!" "Success"
    Write-Host ""
    Write-ColoredOutput "📍 Installation location: $InstallPath" "Info"
    Write-Host ""
    Write-ColoredOutput "🚀 Getting Started:" "Highlight"
    
    if ($ServiceInstalled) {
        Write-ColoredOutput "  • Start service: Start-Service MCPKanban" "Info"
        Write-ColoredOutput "  • Stop service: Stop-Service MCPKanban" "Info"
        Write-ColoredOutput "  • Service status: Get-Service MCPKanban" "Info"
    } else {
        Write-ColoredOutput "  • Start server: cd '$InstallPath' && npm start" "Info"
        Write-ColoredOutput "  • Or use desktop shortcut" "Info"
    }
    
    Write-ColoredOutput "  • Use CLI: kanban --help (restart terminal first)" "Info"
    Write-ColoredOutput "  • Access web interface: http://localhost:3000" "Info"
    Write-ColoredOutput "  • Health check: http://localhost:3000/api/health" "Info"
    Write-Host ""
    Write-ColoredOutput "📚 Documentation:" "Highlight"
    Write-ColoredOutput "  • User Guide: $InstallPath\docs\user\README.md" "Info"
    Write-ColoredOutput "  • API Docs: $InstallPath\docs\api\API_REFERENCE.md" "Info"
    Write-ColoredOutput "  • Troubleshooting: $InstallPath\docs\guides\TROUBLESHOOTING.md" "Info"
    Write-Host ""
    Write-ColoredOutput "🔧 Configuration:" "Highlight"
    Write-ColoredOutput "  • Config file: $InstallPath\config\default.json" "Info"
    Write-ColoredOutput "  • Database: $InstallPath\data\kanban.db" "Info"
    Write-ColoredOutput "  • Logs: $InstallPath\logs\" "Info"
    Write-Host ""
    Write-ColoredOutput "❓ Need help? Check the documentation or visit:" "Info"
    Write-ColoredOutput "   https://github.com/yourusername/mcp-kanban" "Highlight"
    Write-Host ""
}

# Main installation process
try {
    Write-Banner
    
    # Security checks
    Write-ColoredOutput "🔒 Checking PowerShell security settings..." "Info"
    Test-ExecutionPolicy
    
    if ($InstallService -and -not (Test-Administrator)) {
        Write-ColoredOutput "⚠️  Administrator privileges required for service installation" "Warning"
        $response = Read-Host "Continue without service installation? (y/N)"
        if ($response -ne 'y' -and $response -ne 'Y') {
            Write-ColoredOutput "Installation cancelled. Run as Administrator to install service." "Warning"
            exit 1
        }
        $InstallService = $false
    }
    
    # Dependency checks
    if (-not $SkipDependencyCheck) {
        Test-Dependencies
    }
    
    # Install MCP Kanban
    Install-MCPKanban -InstallPath $InstallPath -IsDevelopment $Development
    
    # Create shortcuts and environment setup
    Add-PathEnvironment -InstallPath $InstallPath
    Create-DesktopShortcut -InstallPath $InstallPath
    Create-StartMenuShortcuts -InstallPath $InstallPath
    Create-UninstallScript -InstallPath $InstallPath
    
    # Install Windows service if requested
    $serviceInstalled = $false
    if ($InstallService) {
        $serviceInstalled = Install-WindowsService -InstallPath $InstallPath
    }
    
    # Test installation
    $testPassed = Test-Installation -InstallPath $InstallPath
    
    if ($testPassed) {
        Show-PostInstallInstructions -InstallPath $InstallPath -ServiceInstalled $serviceInstalled
    } else {
        Write-ColoredOutput "⚠️  Installation completed but tests failed. Manual verification may be needed." "Warning"
        Show-PostInstallInstructions -InstallPath $InstallPath -ServiceInstalled $serviceInstalled
    }
    
} catch {
    Write-ColoredOutput "❌ Installation failed: $_" "Error"
    Write-ColoredOutput "Please check the error message above and try again." "Info"
    Write-ColoredOutput "For help, visit: https://github.com/yourusername/mcp-kanban/issues" "Info"
    exit 1
}

# Keep window open in interactive mode
if ($Host.Name -eq "ConsoleHost" -and [Environment]::UserInteractive) {
    Write-Host ""
    Write-Host "Press any key to exit..." -ForegroundColor Gray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
} 