@echo off
echo ========================================================
echo   Actualizador de Reglas de Seguridad - Creative OS
echo ========================================================
echo.
echo Paso 1: Instalando Firebase Tools (esto puede tardar unos minutos)...
call npm install firebase-tools --no-save

echo.
echo Paso 2: Autenticando con Google...
echo (Si ya estas logueado, esto sera rapido. Si no, se abrira tu navegador).
call npx firebase login

echo.
echo Paso 3: Subiendo las nuevas reglas de seguridad a la nube...
call npx firebase deploy --only firestore:rules

echo.
echo ========================================================
echo  ¡Proceso Terminado! Las reglas ya estan actualizadas.
echo ========================================================
pause
