@echo off
cd /d "%~dp0"
node scripts\verify-dev2.mjs
if errorlevel 1 goto done
call npm run dev
:done
pause
