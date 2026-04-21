@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1

cd /d "%~dp0"
title Flow Studio

echo.
echo   ========================================
echo        Flow Studio - Starting...
echo   ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo   [ERROR] Node.js not found
    echo   Install: https://nodejs.org
    pause
    exit /b 1
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
    echo   [ERROR] npm.cmd not found
    echo   Check your Node.js installation
    pause
    exit /b 1
)

where npx.cmd >nul 2>&1
if errorlevel 1 (
    echo   [ERROR] npx.cmd not found
    echo   Check your Node.js installation
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo   [1/4] Installing frontend dependencies...
    call npm.cmd install
    if errorlevel 1 (
        echo   [ERROR] Frontend npm install failed
        pause
        exit /b 1
    )
) else (
    echo   [1/4] Frontend dependencies OK
)

if not exist "backend\node_modules" (
    echo   [2/4] Installing backend dependencies...
    pushd "backend"
    call npm.cmd install
    set "BACKEND_INSTALL_EXIT=%errorlevel%"
    popd
    if not "%BACKEND_INSTALL_EXIT%"=="0" (
        echo   [ERROR] Backend npm install failed
        pause
        exit /b 1
    )
) else (
    echo   [2/4] Backend dependencies OK
)

if not exist "backend\storage\workflows" mkdir "backend\storage\workflows"
if not exist "backend\storage\outputs" mkdir "backend\storage\outputs"
if not exist "backend\storage\uploads" mkdir "backend\storage\uploads"
echo   [3/4] Storage directories OK

echo   [4/4] Cleaning old processes...
call :kill_port 3001
call :kill_port 5173
call :kill_port 5174
call :kill_port 5175

echo.
echo   ----------------------------------------
echo    Frontend: http://localhost:5173
echo    Backend:  http://localhost:3001
echo   ----------------------------------------
echo.
echo   Press Ctrl+C to stop
echo.

set "BACKEND_LOG=%TEMP%\flow-studio-backend.log"
del "%BACKEND_LOG%" >nul 2>&1
start "Flow Studio Backend" /MIN cmd /c "cd /d ""%~dp0backend"" && node server.js > ""%BACKEND_LOG%"" 2>&1"

call :wait_for_backend
if errorlevel 1 (
    echo.
    echo   [ERROR] Backend failed to start on http://localhost:3001
    echo   Check log: %BACKEND_LOG%
    pause
    exit /b 1
)

call npx.cmd vite --host --port 5173 --strictPort
set "FRONTEND_EXIT=%errorlevel%"

echo.
echo   Frontend exited with code %FRONTEND_EXIT%.
pause
exit /b %FRONTEND_EXIT%

:kill_port
setlocal
set "TARGET_PORT=%~1"
for /f %%P in ('powershell -NoProfile -Command "$port=%TARGET_PORT%; Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue ^| Select-Object -ExpandProperty OwningProcess -Unique"') do (
    if not "%%P"=="0" (
        taskkill /F /PID %%P /T >nul 2>&1
        echo   Killed port %TARGET_PORT% ^(PID: %%P^)
    )
)
endlocal
exit /b 0

:wait_for_backend
for /L %%I in (1,1,20) do (
    curl.exe -fsS http://127.0.0.1:3001/api/health >nul 2>&1
    if not errorlevel 1 exit /b 0
    powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3001/api/health ^| Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
    if not errorlevel 1 exit /b 0
    timeout /t 1 /nobreak >nul
)
exit /b 1
