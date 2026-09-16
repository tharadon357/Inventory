@echo off
setlocal
set "TASK_NAME=GuitarStoreWatchdog"

echo ============================================================
echo  ลบ watchdog ที่คอยเช็ค/เปิดเว็บอัตโนมัติทุก 1 นาที
echo ============================================================
echo.

schtasks /query /tn "%TASK_NAME%" >nul 2>&1
if %errorlevel%==0 (
  schtasks /delete /tn "%TASK_NAME%" /f
  echo [OK] ลบ scheduled task "%TASK_NAME%" แล้ว
) else (
  echo [OK] ไม่มี scheduled task "%TASK_NAME%" อยู่แล้ว ^(ไม่ต้องลบ^)
)

echo.
echo ============================================================
echo  ต่อไปนี้เว็บจะไม่เปิดเองอัตโนมัติอีกแล้ว
echo  ถ้าอยากใช้งาน ให้ดับเบิลคลิก fix-and-start.bat ตอนที่ต้องการเองครับ
echo ============================================================
echo.
pause
