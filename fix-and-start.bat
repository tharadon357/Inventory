@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================================
echo  1) ปิดโปรเซสเก่าที่อาจค้างอยู่ที่พอร์ต 3081 / 8081 / 8082
echo ============================================================
for %%P in (3081 8081 8082) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr :%%P ^| findstr LISTENING') do (
    echo   ปิดโปรเซส PID %%A ที่ใช้พอร์ต %%P
    taskkill /F /PID %%A >nul 2>&1
  )
)

echo.
echo ============================================================
echo  2) ตรวจสอบ backend\node_modules ^(sqlite3^)
echo ============================================================
if exist "backend\node_modules\sqlite3" (
  echo [OK] backend มี sqlite3 อยู่แล้ว
) else (
  echo   กำลังติดตั้ง sqlite3 ลงใน backend\ ...
  pushd backend
  call npm install sqlite3 sqlite --no-save
  popd
)

echo.
echo ============================================================
echo  3) ตรวจสอบ frontend\node_modules
echo ============================================================
if exist "frontend\node_modules" (
  echo [OK] frontend มี node_modules อยู่แล้ว
) else (
  echo   [!] frontend ยังไม่เคยติดตั้งแพ็กเกจของตัวเองเลย
  echo       กำลังรัน npm install ใน frontend\ ... ^(ใช้เวลาสักพัก รอสักครู่นะครับ^)
  pushd frontend
  call npm install
  popd
)

echo.
echo ============================================================
echo  4) ล้างแคชเก่าของ Metro/Expo
echo ============================================================
if exist "frontend\.expo" (
  rmdir /s /q "frontend\.expo"
  echo   ลบ frontend\.expo แล้ว
)
if exist ".expo" (
  rmdir /s /q ".expo"
  echo   ลบ .expo ที่ root แล้ว
)
if exist "frontend\node_modules\.cache" (
  rmdir /s /q "frontend\node_modules\.cache"
  echo   ลบ frontend\node_modules\.cache แล้ว
)

echo.
echo ============================================================
echo  5) เปิด backend ^(พอร์ต 3081^)
echo ============================================================
start "Guitar Store Backend" cmd /k "cd /d %~dp0backend && node server-local.js"

timeout /t 5 >nul

echo.
echo ============================================================
echo  6) เปิด frontend ^(พอร์ต 8081^)
echo ============================================================
start "Guitar Store Frontend" cmd /k "cd /d %~dp0frontend && npx expo start --web --port 8081 --clear"

echo.
echo ============================================================
echo  เสร็จแล้ว! ถ้าเพิ่งติดตั้ง frontend\node_modules รอบนี้อาจใช้เวลา
echo  รวมหลายนาที ^(ติดตั้งแพ็กเกจใหม่ทั้งหมด^) รอจนหน้าต่าง
echo  "Guitar Store Frontend" ขึ้นคำว่า "Web Bundled" ก่อน แล้วค่อยเปิด
echo     http://localhost:8081
echo  ถ้ายังไม่ขึ้นอีก ถ่ายภาพหน้าต่าง "Guitar Store Frontend" ส่งมาดูครับ
echo ============================================================
echo.
pause
