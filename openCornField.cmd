@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
if "%PORT%"=="" set "PORT=4300"
set "APP_URL=http://127.0.0.1:%PORT%"

cd /d "%SCRIPT_DIR%"

if not exist "data" mkdir "data"
if not exist "data\thumbnails" mkdir "data\thumbnails"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required but was not found on this PC.
  echo Opening the official Node.js download page...
  start "" "https://nodejs.org/en/download"
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is required but was not found on this PC.
  echo Opening the official Node.js download page...
  start "" "https://nodejs.org/en/download"
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 exit /b 1
)

echo Starting CornField...
start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$url = '%APP_URL%'; for ($i = 0; $i -lt 60; $i++) { try { Invoke-WebRequest -Uri $url -UseBasicParsing | Out-Null; Start-Process $url; exit 0 } catch { Start-Sleep -Milliseconds 500 } }; Start-Process $url"
echo Keep this window open while using the app.
call npm run start
