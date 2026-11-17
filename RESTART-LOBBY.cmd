@echo off
chcp 65001 >nul
title MS Games: restart the lobby
echo.
echo  Stopping the old lobby on port 47801 and starting the new version.
echo  Headsets and the console reconnect by themselves after a few seconds.
echo.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":47801 .*LISTENING"') do (
  echo  Stopping process %%p
  taskkill /PID %%p /F >nul 2>&1
)
timeout /t 2 /nobreak >nul
netstat -ano | findstr /r /c:":47801 .*LISTENING" >nul
if %errorlevel%==0 (
  echo  The lobby was already started again by another program. Done.
) else (
  cd /d "%~dp0lobby"
  start "MS Games lobby" /min node server.js
  timeout /t 3 /nobreak >nul
  echo  The new lobby is running. Do not close the small black window "MS Games lobby".
)
echo.
echo  Open the console again: http://localhost:47801
echo.
pause
