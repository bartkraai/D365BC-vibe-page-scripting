@echo off
title BC Page Scripting

where pwsh >nul 2>nul
if not errorlevel 1 (
    pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
    goto :eof
)

where powershell >nul 2>nul
if not errorlevel 1 (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
    goto :eof
)

echo [ERROR] Neither PowerShell 7 (pwsh) nor Windows PowerShell was found.
pause
exit /b 1
