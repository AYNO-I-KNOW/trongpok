@echo off
setlocal
title Tongpok - Verify and Publish
set "TongpokRepo=%~dp0"
if exist "%TongpokRepo%\scripts\publish-dev2.mjs" goto repo_ready
set "TongpokRepo=%USERPROFILE%\Documents\ChatGPT\Tongpok\trongpok-integration"
if exist "%TongpokRepo%\scripts\publish-dev2.mjs" goto repo_ready
set "TongpokRepo=D:\Tongpok\trongpok-integration"
if not exist "%TongpokRepo%\scripts\publish-dev2.mjs" goto missing_repo
:repo_ready
cd /d "%TongpokRepo%"
if errorlevel 1 goto failed
echo Checking, committing and publishing the Dev 2 work branch.
echo A failed install, test, lint or build stops publication.
node scripts\publish-dev2.mjs
if errorlevel 1 goto failed
echo.
echo Work branch published. Starting the local preview at http://localhost:3000
call npm run dev
goto done
:missing_repo
echo Could not locate the Tongpok integration project.
goto done
:failed
echo.
echo The process stopped. Keep the error above for troubleshooting.
:done
pause
endlocal
