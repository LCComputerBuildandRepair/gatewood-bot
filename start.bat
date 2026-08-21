@echo off
title Gatewood RP Bot
cd /d "%~dp0"

:start
echo.
echo [%time%] Starting Gatewood RP bot...
node index.js
echo.
echo [%time%] Bot stopped (exit code %errorlevel%). Restarting in 5 seconds...
echo Close this window to stop it for good.
timeout /t 5 /nobreak >nul
goto start
