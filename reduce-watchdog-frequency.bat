@echo off
setlocal
set "PROJECT_DIR=C:\Users\aoaww\OneDrive\Desktop\Inventory-main"
set "TASK_NAME=GuitarStoreWatchdog"

echo Slowing the watchdog down to check every 5 minutes instead of every
echo 1 minute, to cut down on how often anything can flash/interrupt you...
echo.

schtasks /create /tn "%TASK_NAME%" /tr "wscript.exe \"%PROJECT_DIR%\watchdog-launcher.vbs\"" /sc minute /mo 5 /f

echo.
echo Done. The site still self-heals automatically, just checked every
echo 5 minutes now instead of every 1 minute.
echo.
echo This window will close in a few seconds.
timeout /t 6 >nul
