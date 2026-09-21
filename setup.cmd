@echo off
chcp 65001 >nul
rem Установка DM Cockpit: зовёт setup.ps1 (Windows PowerShell, без смены политики выполнения). Флаги: -Test, -Update.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*
set "RC=%ERRORLEVEL%"
echo %CMDCMDLINE% | find /i "/c" >nul && (echo. & echo Enter — закрыть окно & pause >nul)
exit /b %RC%
