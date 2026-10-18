@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required for the local launcher. You can also play the hosted GitHub Pages site.
  pause
  exit /b 1
)
start "RVKKO Games" http://127.0.0.1:4180
node scripts/serve.cjs
