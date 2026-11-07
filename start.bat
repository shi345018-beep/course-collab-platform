@echo off
setlocal
cd /d "%~dp0"
if not defined PORT set "PORT=8099"

set "NODE_EXE="
for /f "delims=" %%i in ('where node 2^>nul') do set "NODE_EXE=%%i"

if not defined NODE_EXE (
  if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
    set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  )
)

if not defined NODE_EXE (
  echo.
  echo [ERROR] Node.js not found on this computer.
  echo.
  echo   1. Download Node.js 22 LTS from https://nodejs.org
  echo   2. Install it with default options
  echo   3. Close this window and run start.bat again
  echo.
  pause
  exit /b 1
)

echo ============================================
echo   Course Collaboration and Review Platform
echo ============================================
echo   Node: %NODE_EXE%
echo.

if not exist "data\db.json" (
  echo First run: generating demo data...
  "%NODE_EXE%" seed.js
)

echo Starting server on port %PORT% (auto-increments if busy)
echo The real URL will be printed below. Press Ctrl+C to stop.
echo.
"%NODE_EXE%" server.js
pause
