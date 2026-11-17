@echo off
rem MS Games 2 - dev server on Windows. Double-click from the repo root: it updates itself from GitHub, installs what is missing and runs.
rem (For no setup at all use the installer: GitHub > Releases > latest > MS-Games-Setup.exe)
setlocal
cd /d "%~dp0"

if exist "%~dp0.git" (
  where git >nul 2>nul && (
    echo Updating from GitHub ...
    git pull --ff-only
    echo.
  )
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Installing it with winget ...
  where winget >nul 2>nul || (
    echo winget was not found. Install Node 24 from https://nodejs.org and run this again.
    pause
    exit /b 1
  )
  winget install -e --id OpenJS.NodeJS --accept-package-agreements --accept-source-agreements
  echo.
  echo Node.js is installed. Close this window and double-click dev-windows.cmd again.
  pause
  exit /b 0
)

if not exist "%~dp0lobby\node_modules\ws" (
  echo Installing packages in lobby\ ...
  pushd "%~dp0lobby"
  call npm install --no-audit --no-fund
  popd
)

if not exist "%~dp0lobby-stage\node_modules" mklink /J "%~dp0lobby-stage\node_modules" "%~dp0lobby\node_modules"
if not exist "%~dp0lobby-stage\public\play\assets" mklink /J "%~dp0lobby-stage\public\play\assets" "%~dp0lobby\public\play\assets"

cd /d "%~dp0lobby-stage"
echo.
echo Console:  http://localhost:47901
echo Scan:     http://localhost:47901/scan/
echo Game:     http://localhost:47901/play/?desktop=1^&id=DEV^&name=DEV
echo TV:       http://localhost:47901/tv/
echo Stop with Ctrl+C.
echo.
start "" "http://localhost:47901"
node tools\dev-server.mjs --port 47901 --data data-dev
pause
