@echo off
cd /d "%~dp0"

echo ============================================================
echo  กำลังแก้รูปสินค้า 3 รายการในฐานข้อมูล inventory-local.db
echo ============================================================
echo.
echo หมายเหตุ: ถ้าหน้าต่าง "Guitar Store Backend" กำลังรันอยู่
echo ให้ปิดหน้าต่างนั้นก่อนรันไฟล์นี้ แล้วค่อยเปิด backend ใหม่ทีหลัง
echo.
pause

node fix-product-images.js

echo.
pause
