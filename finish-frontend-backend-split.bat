@echo off
setlocal enabledelayedexpansion

echo ============================================================
echo  Finishing the frontend/backend split
echo ============================================================
echo.

set "ROOT=%~dp0"
cd /d "%ROOT%"

rem --- 1. Copy .env into backend\ if it isn't there yet -----------------
if not exist "backend\.env" (
  if exist ".env" (
    copy /y ".env" "backend\.env" >nul
    echo Copied .env into backend\.env
  )
) else (
  echo backend\.env already exists - leaving it alone.
)

echo.
echo Removing the old top-level copies that now live in frontend\ or
echo backend\ instead (only deletes files that were successfully copied
echo into the new folders)...
echo.

if exist "backend\.env" if exist ".env" (
  del /f /q ".env"
  echo Removed old top-level .env
)

if exist "backend\server.js" if exist "server.js" (
  del /f /q "server.js"
  echo Removed old top-level server.js
)
if exist "backend\server-local.js" if exist "server-local.js" (
  del /f /q "server-local.js"
  echo Removed old top-level server-local.js
)
if exist "backend\utils\cluster.js" if exist "utils\cluster.js" (
  rmdir /s /q "utils"
  echo Removed old top-level utils\ folder
)
if exist "backend\guitar_store_seed.sql" if exist "guitar_store_seed.sql" (
  del /f /q "guitar_store_seed.sql"
  echo Removed old top-level guitar_store_seed.sql
)
if exist "backend\guitar_store_orders_migration.sql" if exist "guitar_store_orders_migration.sql" (
  del /f /q "guitar_store_orders_migration.sql"
  echo Removed old top-level guitar_store_orders_migration.sql
)
if exist "backend\products.json" if exist "products.json" (
  del /f /q "products.json"
  echo Removed old top-level products.json
)
if exist "backend\inventory-local.db" if exist "inventory-local.db" (
  del /f /q "inventory-local.db"
  echo Removed old top-level inventory-local.db
)

if exist "frontend\src\app\index.tsx" if exist "src" (
  rmdir /s /q "src"
  echo Removed old top-level src\ folder
)
if exist "frontend\assets\images\icon.png" if exist "assets" (
  rmdir /s /q "assets"
  echo Removed old top-level assets\ folder
)
if exist "frontend\scripts\reset-project.js" if exist "scripts" (
  rmdir /s /q "scripts"
  echo Removed old top-level scripts\ folder
)
if exist "frontend\app.json" if exist "app.json" (
  del /f /q "app.json"
  echo Removed old top-level app.json
)
if exist "frontend\tsconfig.json" if exist "tsconfig.json" (
  del /f /q "tsconfig.json"
  echo Removed old top-level tsconfig.json
)
if exist "frontend\expo-env.d.ts" if exist "expo-env.d.ts" (
  del /f /q "expo-env.d.ts"
  echo Removed old top-level expo-env.d.ts
)
if exist "frontend\package.json" if exist "backend\package.json" if exist "package.json" (
  del /f /q "package.json"
  echo Removed old top-level package.json
)
if exist "frontend\package-lock.json" if exist "backend\package-lock.json" if exist "package-lock.json" (
  del /f /q "package-lock.json"
  echo Removed old top-level package-lock.json
)

echo.
echo ============================================================
echo  Done. New layout:
echo    frontend\   - Expo app (npm install, then npm run web)
echo    backend\    - Express API (npm install, then npm start)
echo  The old top-level node_modules\ was left in place on purpose -
echo  it lets "backend\server-local.js" keep finding sqlite3/sqlite
echo  locally without needing to reinstall them. Do not delete it.
echo ============================================================
echo.
echo This window will close in a few seconds.
timeout /t 10 >nul
