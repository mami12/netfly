@echo off
echo Starting Netfly Sports Platform...
start cmd /k "cd backend && npx tsx src/index.ts"
timeout /t 3 >nul
start cmd /k "cd frontend && npx vite --host"
echo Netfly Sports is running at http://localhost:5173