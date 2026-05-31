@echo off
echo ========================================================
echo   Actualizador Rapido de Reglas - Creative OS
echo ========================================================
echo.
echo Subiendo las nuevas reglas de seguridad a la nube...
call npx firebase deploy --only firestore:rules

echo.
echo ========================================================
echo  ¡Proceso Terminado! Las reglas ya estan actualizadas.
echo ========================================================
pause
