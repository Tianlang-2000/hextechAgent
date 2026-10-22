@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist "release\win-unpacked\Hextech Agent.exe" (
  start "Hextech Agent" "release\win-unpacked\Hextech Agent.exe"
  exit /b 0
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo 请先运行 npm install 安装依赖。
  pause
  exit /b 1
)
if not exist "dist\index.html" (
  call npm run build
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
start "Hextech Agent" "node_modules\electron\dist\electron.exe" .
