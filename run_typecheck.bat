@echo off
npx vue-tsc --noEmit 2>&1
echo EXIT_CODE=%ERRORLEVEL%