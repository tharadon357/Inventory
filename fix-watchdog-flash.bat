@echo off
setlocal
set "PROJECT_DIR=C:\Users\aoaww\OneDrive\Desktop\Inventory-main"
set "TASK_NAME=GuitarStoreWatchdog"

echo Updating the watchdog task to run fully invisibly (no more flash)...
echo.

schtasks /create /tn "%TASK_NAME%" /tr "wscript.exe \"%PROJECT_DIR%\watchdog-launcher.vbs\"" /sc minute /mo 1 /f

echo.
echo Running it once now to confirm it still works...
schtasks /run /tn "%TASK_NAME%"

echo.
echo Done - it should no longer flash a window every minute.
echo This window will close in a few seconds.
timeout /t 6 >nul
