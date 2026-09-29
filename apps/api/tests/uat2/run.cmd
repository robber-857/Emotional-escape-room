@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
set "UAT2_EXIT=%ERRORLEVEL%"
echo.
echo UAT2 exit code: %UAT2_EXIT%
pause
exit /b %UAT2_EXIT%
