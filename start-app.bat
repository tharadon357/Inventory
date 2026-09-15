@echo off
setlocal

rem === Guitar Store Expo web app launcher — MANUAL/debug use only ===
rem NOTE: this no longer auto-installs itself into Windows Startup. The site
rem is kept alive automatically by the silent "GuitarStoreWatchdog" background
rem task instead (checks every 1 minute, no window, never pops up). Only run
rem this file by hand when you want to watch the Expo logs directly.
rem The frontend code now lives in the "frontend" subfolder after the
rem frontend/backend split.
set "PROJECT_DIR=%~dp0frontend"

cd /d "%PROJECT_DIR%"

:loop
echo Starting Guitar Store app (Expo web) on http://localhost:8081 ...
npx expo start --web --port 8081
echo.
echo [Guitar Store] App stopped unexpectedly. Restarting in 3 seconds...
echo (Close this window if you want to stop it for good.)
timeout /t 3 /nobreak >nul
goto loop
