@echo off
setlocal

rem === Guitar Store LOCAL backend (SQLite) launcher — MANUAL/debug use only ===
rem NOTE: this no longer auto-installs itself into Windows Startup. The site
rem is kept alive automatically by the silent "GuitarStoreWatchdog" background
rem task instead. Only run this file by hand when you want to watch the
rem server logs directly.
rem The backend code now lives in the "backend" subfolder after the
rem frontend/backend split.
set "PROJECT_DIR=%~dp0backend"

cd /d "%PROJECT_DIR%"

:loop
echo Starting Guitar Store LOCAL API (SQLite) on http://localhost:3081 ...
node server-local.js
echo.
echo [Guitar Store] Server stopped unexpectedly. Restarting in 3 seconds...
echo (Close this window if you want to stop it for good.)
timeout /t 3 /nobreak >nul
goto loop
