@echo off
chcp 65001 >nul
title Libra
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto nonode

if not exist "node_modules" goto install
if not exist "node_modules\electron\dist\electron.exe" goto fixelectron
goto run

:install
echo 首次运行，正在安装依赖，可能需要几分钟...
call npm install --no-audit --no-fund
if errorlevel 1 goto failed
goto run

:fixelectron
echo Electron 运行文件缺失，正在修复...
call node node_modules\electron\install.js
if not exist "node_modules\electron\dist\electron.exe" (
  echo 修复未成功，请手动执行：node node_modules\electron\install.js
  pause
  exit /b 1
)
goto run

:run
call npm run dev
echo.
echo Libra 已退出。
pause
exit /b 0

:nonode
echo 没有找到 Node.js，请先安装：https://nodejs.org
pause
exit /b 1

:failed
echo 依赖安装失败，请检查网络后重试。
pause
exit /b 1