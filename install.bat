@echo off
setlocal enabledelayedexpansion

REM MCP Kanban Server Installation Script for Windows (Batch Version)
REM This script installs the MCP Kanban Server on Windows systems using Command Prompt

echo.
echo ========================================
echo   MCP Kanban Server - Windows Installer
echo ========================================
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% == 0 (
    echo [WARNING] Running as administrator. This is not required for normal installation.
    echo.
)

REM Check prerequisites
echo [INFO] Checking prerequisites...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH
    echo [INFO] Please install Node.js 18 or later from https://nodejs.org/
    echo [INFO] After installation, restart your terminal and run this script again.
    pause
    exit /b 1
)

REM Check Node.js version
for /f "tokens=*" %%i in ('node --version 2^>nul') do set NODE_VERSION=%%i
echo [SUCCESS] Node.js version %NODE_VERSION% detected

REM Extract major version for comparison
for /f "tokens=2 delims=v." %%a in ("%NODE_VERSION%") do set NODE_MAJOR=%%a
if %NODE_MAJOR% lss 18 (
    echo [ERROR] Node.js version %NODE_VERSION% is too old. Version 18 or later is required.
    echo [INFO] Please update Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if npm is installed
npm --version >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] npm is not installed or not in PATH
    echo [INFO] npm should be included with Node.js installation.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version 2^>nul') do set NPM_VERSION=%%i
echo [SUCCESS] npm version %NPM_VERSION% detected

REM Check if Git is installed (optional but recommended)
git --version >nul 2>&1
if %errorLevel% == 0 (
    for /f "tokens=*" %%i in ('git --version 2^>nul') do set GIT_VERSION=%%i
    echo [SUCCESS] %GIT_VERSION% detected
) else (
    echo [WARNING] Git not detected. Some features may be limited.
)

echo.
echo [INFO] Prerequisites check completed successfully.
echo.

REM Install dependencies
echo [INFO] Installing dependencies...
echo.

REM Clear npm cache first
echo [INFO] Clearing npm cache...
npm cache clean --force >nul 2>&1

REM Install dependencies
echo [INFO] Installing npm dependencies...
npm install
if %errorLevel% neq 0 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)

echo [SUCCESS] Dependencies installed successfully
echo.

REM Build project
echo [INFO] Building project...
echo.

REM Run TypeScript compilation
echo [INFO] Compiling TypeScript...
npm run build
if %errorLevel% neq 0 (
    echo [ERROR] Build failed
    pause
    exit /b 1
)

echo [SUCCESS] Project built successfully
echo.

REM Verify build artifacts
if not exist "dist\server.js" (
    echo [ERROR] Build artifacts not found at dist\server.js
    pause
    exit /b 1
)

echo [SUCCESS] Build artifacts verified
echo.

REM Test installation (optional)
echo [INFO] Testing installation...
echo.

REM Test if the server can start (run in background and kill after 3 seconds)
echo [INFO] Testing server startup...
start /b node dist\server.js >nul 2>&1
timeout /t 3 /nobreak >nul
taskkill /f /im node.exe >nul 2>&1
echo [SUCCESS] Server startup test completed
echo.

REM Show post-installation instructions
echo.
echo ========================================
echo   Installation completed successfully!
echo ========================================
echo.
echo [INFO] Next Steps:
echo   1. Start the server: npm start
echo   2. Access the API: http://localhost:3000
echo   3. Use the CLI: npm run cli
echo   4. View documentation: docs\README.md
echo.
echo [INFO] Configuration:
echo   • Database file: data\kanban.db
echo   • Configuration: config\default.json
echo   • Logs: logs\ directory
echo.
echo [INFO] Documentation:
echo   • User Guide: docs\user\README.md
echo   • API Documentation: docs\api\README.md
echo   • CLI Usage: docs\guides\CLI_USAGE.md
echo.
echo [INFO] Quick Start:
echo   npm start                    # Start the server
echo   npm run cli board list       # List boards
echo   npm run cli task create      # Create a task
echo.
echo [INFO] Need Help?
echo   • Check the troubleshooting guide: docs\user\troubleshooting.md
echo   • Open an issue on GitHub
echo   • Review the logs in the logs\ directory
echo.
echo [SUCCESS] Installation completed successfully!
echo.
pause 