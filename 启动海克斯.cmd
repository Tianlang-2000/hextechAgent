@echo off
setlocal
cd /d "%~dp0"
if errorlevel 1 (
  echo Unable to open the application directory.
  pause
  exit /b 1
)
if exist "%~dp0release\win-unpacked\Hextech Agent.exe" (
  start "Hextech Agent" /D "%~dp0release\win-unpacked" "%~dp0release\win-unpacked\Hextech Agent.exe"
  if errorlevel 1 (
    echo Unable to start the packaged application.
    pause
    exit /b 1
  )
  exit /b 0
)
if not exist "%~dp0node_modules\electron\dist\electron.exe" (
  echo Dependencies are missing. Run npm ci in this folder first.
  pause
  exit /b 1
)
if not exist "%~dp0dist\index.html" (
  call npm run build
  if errorlevel 1 (
    echo The build failed. See the error above.
    pause
    exit /b 1
  )
)
start "Hextech Agent" /D "%~dp0." "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
if errorlevel 1 (
  echo Unable to start Electron.
  pause
  exit /b 1
)
exit /b 0
