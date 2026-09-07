@echo off
setlocal EnableExtensions
if /I "%~1"=="--dry-run" (
  node "%~dp0release.mjs" dry-run
) else if "%~1"=="" (
  node "%~dp0release.mjs" deploy
) else (
  echo Usage: %~nx0 [--dry-run]
  exit /b 2
)
exit /b %ERRORLEVEL%
