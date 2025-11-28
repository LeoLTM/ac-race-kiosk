@echo off
echo =====================================
echo AC Nickname Interceptor Setup
echo =====================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed or not in PATH!
    echo.
    echo Please install Python from: https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)

echo [OK] Python is installed
echo.

REM Check if pip is available
python -m pip --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: pip is not available!
    echo.
    pause
    exit /b 1
)

echo [OK] pip is available
echo.

REM Install watchdog
echo Installing required package: watchdog
echo.
python -m pip install watchdog

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to install watchdog
    echo.
    pause
    exit /b 1
)

echo.
echo =====================================
echo Setup Complete!
echo =====================================
echo.
echo You can now run the interceptor with:
echo     python ac_nickname_interceptor.py
echo.
echo Or double-click: run_interceptor.bat
echo.
pause
