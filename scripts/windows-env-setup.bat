@echo off
REM Windows Environment Variable Setup Script
REM Handles environment configuration for Windows development

setlocal enabledelayedexpansion

echo MCP Kanban - Windows Environment Setup
echo =====================================

REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Warning: Running without administrator privileges
    echo Some system-wide configurations may not be applied
    echo.
)

REM Create directories
echo Creating application directories...
if not exist "%USERPROFILE%\.mcp-kanban" mkdir "%USERPROFILE%\.mcp-kanban"
if not exist "%USERPROFILE%\.mcp-kanban\data" mkdir "%USERPROFILE%\.mcp-kanban\data"
if not exist "%USERPROFILE%\.mcp-kanban\logs" mkdir "%USERPROFILE%\.mcp-kanban\logs"
if not exist "%USERPROFILE%\.mcp-kanban\backups" mkdir "%USERPROFILE%\.mcp-kanban\backups"
if not exist "%USERPROFILE%\.mcp-kanban\config" mkdir "%USERPROFILE%\.mcp-kanban\config"

REM Set environment variables for current session
echo Setting environment variables...

set MCP_KANBAN_HOME=%USERPROFILE%\.mcp-kanban
set MCP_KANBAN_DATA_DIR=%USERPROFILE%\.mcp-kanban\data
set MCP_KANBAN_LOG_DIR=%USERPROFILE%\.mcp-kanban\logs
set MCP_KANBAN_BACKUP_DIR=%USERPROFILE%\.mcp-kanban\backups
set MCP_KANBAN_CONFIG_DIR=%USERPROFILE%\.mcp-kanban\config

REM Database configuration
set DATABASE_URL=sqlite:///%USERPROFILE%\.mcp-kanban\data\kanban.db
set MCP_KANBAN_DB_FOLDER_PATH=%USERPROFILE%\.mcp-kanban\data

REM Server configuration
set NODE_ENV=development
set PORT=3000
set WEBSOCKET_PORT=3001
set MCP_SERVER_PORT=3001
set MCP_SERVER_HOST=127.0.0.1

REM Logging configuration
set LOG_LEVEL=info
set LOG_FILE=%USERPROFILE%\.mcp-kanban\logs\mcp-kanban.log

REM Security configuration
set JWT_SECRET=dev-secret-change-in-production
set API_KEY_SECRET=dev-api-key-secret
set CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000

REM Performance configuration
set MAX_MEMORY=512
set NODE_OPTIONS=--max-old-space-size=512

REM Backup configuration
set BACKUP_SCHEDULE=0 2 * * *
set BACKUP_RETENTION_DAYS=30
set BACKUP_COMPRESSION=gzip

REM Windows-specific configuration
set SHELL=cmd
set TERM=cmd
set PATH_SEPARATOR=;

REM Set persistent environment variables (requires admin for system-wide)
echo Setting persistent environment variables...

REM User-level environment variables
setx MCP_KANBAN_HOME "%USERPROFILE%\.mcp-kanban" >nul 2>&1
setx MCP_KANBAN_DATA_DIR "%USERPROFILE%\.mcp-kanban\data" >nul 2>&1
setx MCP_KANBAN_LOG_DIR "%USERPROFILE%\.mcp-kanban\logs" >nul 2>&1
setx MCP_KANBAN_BACKUP_DIR "%USERPROFILE%\.mcp-kanban\backups" >nul 2>&1
setx MCP_KANBAN_CONFIG_DIR "%USERPROFILE%\.mcp-kanban\config" >nul 2>&1

setx DATABASE_URL "sqlite:///%USERPROFILE%\.mcp-kanban\data\kanban.db" >nul 2>&1
setx MCP_KANBAN_DB_FOLDER_PATH "%USERPROFILE%\.mcp-kanban\data" >nul 2>&1

setx NODE_ENV "development" >nul 2>&1
setx PORT "3000" >nul 2>&1
setx WEBSOCKET_PORT "3001" >nul 2>&1
setx MCP_SERVER_PORT "3001" >nul 2>&1
setx MCP_SERVER_HOST "127.0.0.1" >nul 2>&1

setx LOG_LEVEL "info" >nul 2>&1
setx LOG_FILE "%USERPROFILE%\.mcp-kanban\logs\mcp-kanban.log" >nul 2>&1

setx JWT_SECRET "dev-secret-change-in-production" >nul 2>&1
setx API_KEY_SECRET "dev-api-key-secret" >nul 2>&1
setx CORS_ORIGIN "http://localhost:3000,http://127.0.0.1:3000" >nul 2>&1

setx MAX_MEMORY "512" >nul 2>&1
setx NODE_OPTIONS "--max-old-space-size=512" >nul 2>&1

setx BACKUP_SCHEDULE "0 2 * * *" >nul 2>&1
setx BACKUP_RETENTION_DAYS "30" >nul 2>&1
setx BACKUP_COMPRESSION "gzip" >nul 2>&1

REM Create configuration file
echo Creating configuration file...
echo # MCP Kanban Windows Configuration> "%USERPROFILE%\.mcp-kanban\config\windows.env"
echo # Generated on %date% %time%>> "%USERPROFILE%\.mcp-kanban\config\windows.env"
echo.>> "%USERPROFILE%\.mcp-kanban\config\windows.env"
echo MCP_KANBAN_HOME=%USERPROFILE%\.mcp-kanban>> "%USERPROFILE%\.mcp-kanban\config\windows.env"
echo MCP_KANBAN_DATA_DIR=%USERPROFILE%\.mcp-kanban\data>> "%USERPROFILE%\.mcp-kanban\config\windows.env"
echo MCP_KANBAN_LOG_DIR=%USERPROFILE%\.mcp-kanban\logs>> "%USERPROFILE%\.mcp-kanban\config\windows.env"
echo MCP_KANBAN_BACKUP_DIR=%USERPROFILE%\.mcp-kanban\backups>> "%USERPROFILE%\.mcp-kanban\config\windows.env"
echo MCP_KANBAN_CONFIG_DIR=%USERPROFILE%\.mcp-kanban\config>> "%USERPROFILE%\.mcp-kanban\config\windows.env"
echo.>> "%USERPROFILE%\.mcp-kanban\config\windows.env"
echo DATABASE_URL=sqlite:///%USERPROFILE%\.mcp-kanban\data\kanban.db>> "%USERPROFILE%\.mcp-kanban\config\windows.env"
echo MCP_KANBAN_DB_FOLDER_PATH=%USERPROFILE%\.mcp-kanban\data>> "%USERPROFILE%\.mcp-kanban\config\windows.env"
echo.>> "%USERPROFILE%\.mcp-kanban\config\windows.env"
echo NODE_ENV=development>> "%USERPROFILE%\.mcp-kanban\config\windows.env"
echo PORT=3000>> "%USERPROFILE%\.mcp-kanban\config\windows.env"
echo WEBSOCKET_PORT=3001>> "%USERPROFILE%\.mcp-kanban\config\windows.env"
echo MCP_SERVER_PORT=3001>> "%USERPROFILE%\.mcp-kanban\config\windows.env"
echo MCP_SERVER_HOST=127.0.0.1>> "%USERPROFILE%\.mcp-kanban\config\windows.env"
echo.>> "%USERPROFILE%\.mcp-kanban\config\windows.env"
echo LOG_LEVEL=info>> "%USERPROFILE%\.mcp-kanban\config\windows.env"
echo LOG_FILE=%USERPROFILE%\.mcp-kanban\logs\mcp-kanban.log>> "%USERPROFILE%\.mcp-kanban\config\windows.env"

REM Create Windows service configuration
echo Creating Windows service configuration...
echo # Windows Service Configuration> "%USERPROFILE%\.mcp-kanban\config\service.conf"
echo ServiceName=MCPKanbanServer>> "%USERPROFILE%\.mcp-kanban\config\service.conf"
echo DisplayName=MCP Kanban Server>> "%USERPROFILE%\.mcp-kanban\config\service.conf"
echo Description=MCP Kanban Board Management Server>> "%USERPROFILE%\.mcp-kanban\config\service.conf"
echo StartType=Automatic>> "%USERPROFILE%\.mcp-kanban\config\service.conf"
echo WorkingDirectory=%CD%>> "%USERPROFILE%\.mcp-kanban\config\service.conf"
echo ExecutablePath=node.exe dist\server.js>> "%USERPROFILE%\.mcp-kanban\config\service.conf"

REM Check for Node.js
echo Checking Node.js installation...
node --version >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    echo Then restart this script
    pause
    exit /b 1
) else (
    echo Node.js found: 
    node --version
)

REM Check for npm
echo Checking npm installation...
npm --version >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: npm is not installed or not in PATH
    echo Please ensure npm is properly installed with Node.js
    pause
    exit /b 1
) else (
    echo npm found: 
    npm --version
)

REM Create PowerShell helper script
echo Creating PowerShell helper script...
echo # MCP Kanban PowerShell Helper> "%USERPROFILE%\.mcp-kanban\config\mcp-kanban.ps1"
echo # Load environment variables from config>> "%USERPROFILE%\.mcp-kanban\config\mcp-kanban.ps1"
echo Get-Content "%USERPROFILE%\.mcp-kanban\config\windows.env" ^| ForEach-Object {>> "%USERPROFILE%\.mcp-kanban\config\mcp-kanban.ps1"
echo     if ($_ -match "^([^#][^=]*)=(.*)$") {>> "%USERPROFILE%\.mcp-kanban\config\mcp-kanban.ps1"
echo         $env:$($matches[1]) = $matches[2]>> "%USERPROFILE%\.mcp-kanban\config\mcp-kanban.ps1"
echo     }>> "%USERPROFILE%\.mcp-kanban\config\mcp-kanban.ps1"
echo }>> "%USERPROFILE%\.mcp-kanban\config\mcp-kanban.ps1"
echo Write-Host "MCP Kanban environment loaded">> "%USERPROFILE%\.mcp-kanban\config\mcp-kanban.ps1"

REM Create startup batch file
echo Creating startup script...
echo @echo off> "%USERPROFILE%\.mcp-kanban\start-mcp-kanban.bat"
echo echo Starting MCP Kanban Server...>> "%USERPROFILE%\.mcp-kanban\start-mcp-kanban.bat"
echo cd /d "%CD%">> "%USERPROFILE%\.mcp-kanban\start-mcp-kanban.bat"
echo call "%USERPROFILE%\.mcp-kanban\config\windows.env">> "%USERPROFILE%\.mcp-kanban\start-mcp-kanban.bat"
echo npm start>> "%USERPROFILE%\.mcp-kanban\start-mcp-kanban.bat"
echo pause>> "%USERPROFILE%\.mcp-kanban\start-mcp-kanban.bat"

REM Set file permissions (Windows equivalent)
echo Setting file permissions...
icacls "%USERPROFILE%\.mcp-kanban" /grant:r "%USERNAME%:(OI)(CI)F" >nul 2>&1
icacls "%USERPROFILE%\.mcp-kanban\data" /grant:r "%USERNAME%:(OI)(CI)F" >nul 2>&1
icacls "%USERPROFILE%\.mcp-kanban\logs" /grant:r "%USERNAME%:(OI)(CI)F" >nul 2>&1
icacls "%USERPROFILE%\.mcp-kanban\backups" /grant:r "%USERNAME%:(OI)(CI)F" >nul 2>&1

REM Create registry entries for Windows integration (requires admin)
echo Creating Windows registry entries...
reg add "HKCU\Software\MCPKanban" /v "InstallPath" /t REG_SZ /d "%CD%" /f >nul 2>&1
reg add "HKCU\Software\MCPKanban" /v "DataPath" /t REG_SZ /d "%USERPROFILE%\.mcp-kanban\data" /f >nul 2>&1
reg add "HKCU\Software\MCPKanban" /v "Version" /t REG_SZ /d "1.0.0" /f >nul 2>&1
reg add "HKCU\Software\MCPKanban" /v "ConfiguredDate" /t REG_SZ /d "%date%" /f >nul 2>&1

echo.
echo Windows environment setup completed successfully!
echo.
echo Configuration Summary:
echo ======================
echo Home Directory: %USERPROFILE%\.mcp-kanban
echo Data Directory: %USERPROFILE%\.mcp-kanban\data
echo Log Directory:  %USERPROFILE%\.mcp-kanban\logs
echo Database URL:   sqlite:///%USERPROFILE%\.mcp-kanban\data\kanban.db
echo Server Port:    3000
echo WebSocket Port: 3001
echo MCP Port:       3001
echo.
echo Next Steps:
echo ===========
echo 1. Restart your command prompt to load new environment variables
echo 2. Run: npm install
echo 3. Run: npm run build
echo 4. Run: npm start
echo.
echo Or use the startup script: %USERPROFILE%\.mcp-kanban\start-mcp-kanban.bat
echo.
echo For PowerShell users, load environment with:
echo . "%USERPROFILE%\.mcp-kanban\config\mcp-kanban.ps1"
echo.

REM Check if user wants to install as Windows service
set /p install_service="Would you like to install MCP Kanban as a Windows service? (y/n): "
if /i "%install_service%"=="y" (
    echo.
    echo Installing Windows service...
    echo Note: This requires administrator privileges
    
    REM Create service installer script
    echo @echo off> "%USERPROFILE%\.mcp-kanban\install-service.bat"
    echo echo Installing MCP Kanban Windows Service...>> "%USERPROFILE%\.mcp-kanban\install-service.bat"
    echo sc create MCPKanbanServer binPath= "node.exe %CD%\dist\server.js" DisplayName= "MCP Kanban Server" start= auto>> "%USERPROFILE%\.mcp-kanban\install-service.bat"
    echo sc description MCPKanbanServer "MCP Kanban Board Management Server">> "%USERPROFILE%\.mcp-kanban\install-service.bat"
    echo echo Service installed. Starting service...>> "%USERPROFILE%\.mcp-kanban\install-service.bat"
    echo sc start MCPKanbanServer>> "%USERPROFILE%\.mcp-kanban\install-service.bat"
    echo echo Service installation complete.>> "%USERPROFILE%\.mcp-kanban\install-service.bat"
    echo pause>> "%USERPROFILE%\.mcp-kanban\install-service.bat"
    
    echo Service installer created: %USERPROFILE%\.mcp-kanban\install-service.bat
    echo Run as administrator to install the service.
)

pause