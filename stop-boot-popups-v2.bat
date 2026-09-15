@echo off
setlocal

echo Cleaning up every place this project could auto-launch a VISIBLE
echo window at Windows login...
echo.

rem --- Per-user Startup folder ---
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if exist "%STARTUP_DIR%\start-app.bat" (
  del /f /q "%STARTUP_DIR%\start-app.bat"
  echo Removed start-app.bat from your Startup folder.
)
if exist "%STARTUP_DIR%\start-local-server.bat" (
  del /f /q "%STARTUP_DIR%\start-local-server.bat"
  echo Removed start-local-server.bat from your Startup folder.
)

rem --- All-users Startup folder (in case it ended up there too) ---
set "ALLUSERS_STARTUP=%ProgramData%\Microsoft\Windows\Start Menu\Programs\Startup"
if exist "%ALLUSERS_STARTUP%\start-app.bat" (
  del /f /q "%ALLUSERS_STARTUP%\start-app.bat" 2>nul
  echo Removed start-app.bat from the shared Startup folder.
)
if exist "%ALLUSERS_STARTUP%\start-local-server.bat" (
  del /f /q "%ALLUSERS_STARTUP%\start-local-server.bat" 2>nul
  echo Removed start-local-server.bat from the shared Startup folder.
)

echo.
echo Closing any currently-running copies on ports 8081, 8082 and 3081...
for %%P in (8081 8082 3081) do (
  for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%%P ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
  )
)

echo.
echo Done. Nothing tied to this project will launch a visible window at
echo login anymore. The silent GuitarStoreWatchdog background task is the
echo ONLY thing keeping the site alive now, and it never shows a window.
echo.
echo The site stays reachable at: http://localhost:8081
echo.
echo This window will close in a few seconds.
timeout /t 7 >nul
