@echo off
chcp 65001 >nul
rem Открыть стол DM Cockpit: setup.ps1 -Start — доустановить, что изменилось, и открыть http://localhost:5180. Флаги: -Lan, -Dev, -Update.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" -Start %*
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (echo. & echo Enter — закрыть окно & pause >nul)
exit /b %RC%
