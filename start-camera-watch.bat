@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-camera-watch.ps1"
exit /b %ERRORLEVEL%
