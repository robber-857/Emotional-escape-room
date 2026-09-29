@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
set "UAT3_EXIT=%ERRORLEVEL%"
echo.
echo UAT3 exit code: %UAT3_EXIT%
if "%~1"=="" pause
exit /b %UAT3_EXIT%
