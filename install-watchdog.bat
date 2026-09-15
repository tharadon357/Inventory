@echo off
setlocal
set "PROJECT_DIR=C:\Users\aoaww\OneDrive\Desktop\Inventory-main"
set "TASK_NAME=GuitarStoreWatchdog"

echo Installing Guitar Store watchdog task (checks every 1 minute, restarts
echo the site automatically in the background if it ever goes down)...
echo.

schtasks /create /tn "%TASK_NAME%" /tr "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%PROJECT_DIR%\watchdog.ps1\"" /sc minute /mo 1 /f

echo.
echo Running it once right now so the site comes back immediately...
schtasks /run /tn "%TASK_NAME%"

echo.
echo Done. This window will close in a few seconds.
echo (The watchdog now runs silently in the background forever - no window
echo  to accidentally close. To check on it, look at watchdog.log in this
echo  folder, or search "Task Scheduler" and find "GuitarStoreWatchdog".)
timeout /t 6 >nul
