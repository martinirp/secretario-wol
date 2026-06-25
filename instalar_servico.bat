@echo off
title Instalador do Servidor de Desligar PC
color 0A

echo ===================================================
echo   Instalando o Servico de Desligar PC (Background)
echo ===================================================
echo.

:: Verifica se o .bat esta sendo executado como Administrador
net session >nul 2>&1
if %errorLevel% == 0 (
    echo [OK] Permissoes de Administrador confirmadas.
) else (
    color 0C
    echo [ERRO] Por favor, clique com o botao direito neste arquivo e selecione "Executar como Administrador"!
    pause
    exit
)

echo.
echo 1. Criando pasta segura do sistema em C:\ProgramData\BotDesligar...
mkdir "C:\ProgramData\BotDesligar" 2>nul

echo 2. Copiando o script do servidor para a pasta segura...
copy /Y "%~dp0desligar_listener.ps1" "C:\ProgramData\BotDesligar\desligar_listener.ps1" >nul

echo 3. Registrando no Windows... (Criando rotina SYSTEM)
:: A rotina roda invisível como SYSTEM, iniciando junto com o boot (igual a um Serviço do Windows nativo)
schtasks /create /tn "ServicoBotDesligar" /tr "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File C:\ProgramData\BotDesligar\desligar_listener.ps1" /sc onstart /ru SYSTEM /rl HIGHEST /f

echo 4. Iniciando o servidor invisivel agora...
schtasks /run /tn "ServicoBotDesligar"

echo.
echo ===================================================
echo  INSTALACAO CONCLUIDA COM SUCESSO!
echo ===================================================
echo  - O servidor ja esta rodando 100%% invisivel.
echo  - Ele funciona exatamente como um Servico do Windows.
echo  - Ele vai iniciar sozinho toda vez que o PC ligar.
echo.
echo Pode fechar esta janela e testar o comando no bot!
pause
