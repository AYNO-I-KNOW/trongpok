@echo off
setlocal
title Tongpok - Git
for %%I in ("%~dp0..") do set "TongpokRepo=%%~fI"
if exist "%TongpokRepo%\.git" goto repo_ready
set "TongpokRepo=%USERPROFILE%\Documents\ChatGPT\Tongpok\trongpok-integration"
if exist "%TongpokRepo%\.git" goto repo_ready
set "TongpokRepo=D:\Tongpok\trongpok-integration"
if not exist "%TongpokRepo%\.git" goto missing_repo
:repo_ready
cd /d "%TongpokRepo%"
if errorlevel 1 goto missing_repo
set "TongpokGit=%ProgramFiles%\Git\cmd\git.exe"
if not exist "%TongpokGit%" set "TongpokGit=git"
"%TongpokGit%" rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 goto missing_repo
echo Tongpok repository: %TongpokRepo%
echo.
"%TongpokGit%" status --short --branch
echo.
echo Checking the GitHub connection. This may open GitHub sign-in if needed.
"%TongpokGit%" fetch origin
if errorlevel 1 goto connection_failed
echo.
echo GitHub connection succeeded. Remote references have been updated.
echo Your source files and pending changes are unchanged.
goto open_shell
:connection_failed
echo.
echo Fetch failed. Keep the error above for troubleshooting.
echo Your source files and pending changes are unchanged.
goto open_shell
:missing_repo
echo Could not open the Tongpok repository beside this script.
pause
exit /b 1
:open_shell
echo.
echo Git is ready in this project folder. Type exit to close the terminal.
"%ComSpec%" /d /k
endlocal
