@echo off
chcp 65001 >nul
title Apple Music UI for foobar2000 - installer
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
echo.
pause
