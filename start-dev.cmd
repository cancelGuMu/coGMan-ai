@echo off
setlocal

set "ROOT=%~dp0"
set "API_DIR=%ROOT%apps\api"
set "WEB_DIR=%ROOT%apps\web"
set "PYTHON_EXE=%API_DIR%\.venv\Scripts\python.exe"
set "NPM_EXE=C:\Program Files\nodejs\npm.cmd"

if not exist "%PYTHON_EXE%" (
  echo [ERROR] Backend venv not found:
  echo %PYTHON_EXE%
  echo.
  echo Run this first:
  echo cd apps\api ^&^& uv sync --all-groups
  echo.
  pause
  exit /b 1
)

if not exist "%NPM_EXE%" (
  echo [ERROR] npm not found:
  echo %NPM_EXE%
  echo.
  pause
  exit /b 1
)

echo Starting coGMan-ai services...
start "coGMan-ai API" /D "%API_DIR%" cmd.exe /k ""%PYTHON_EXE%" -m uvicorn app.main:app --app-dir src --host 127.0.0.1 --port 8000"
timeout /t 2 /nobreak >nul
start "coGMan-ai Web" /D "%WEB_DIR%" cmd.exe /k ""%NPM_EXE%" run dev"

echo.
echo Started:
echo Web: http://127.0.0.1:3000
echo API: http://127.0.0.1:8000
echo.
timeout /t 3 /nobreak >nul
