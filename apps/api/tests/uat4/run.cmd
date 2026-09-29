@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
set "UAT4_EXIT=%ERRORLEVEL%"
echo.
echo UAT4 exit code: %UAT4_EXIT%
if "%~1"=="" pause
exit /b %UAT4_EXIT%
