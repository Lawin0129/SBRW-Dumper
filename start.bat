@echo off
setlocal EnableDelayedExpansion

if not exist "node_modules" (
    echo One or more dependencies are missing. Running npm install...
    call npm install
)

node src/index.js
pause
