@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Mise a jour de Socrate
echo Mise a jour de la base...
call npx wrangler d1 execute socrate --remote --file schema.sql -y
if errorlevel 1 ( echo Echec de la mise a jour de la base. & pause & exit /b )
echo Mise en ligne...
call npx wrangler deploy
echo.
echo Termine.
pause
