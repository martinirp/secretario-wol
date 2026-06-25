@echo off
title Servidor para Desligar o PC
echo.
echo ===================================================
echo   Servidor de Desligamento Remoto (Sem Node.js)
echo ===================================================
echo.
echo Iniciando servidor na porta 3000...
echo.

powershell -ExecutionPolicy Bypass -NoProfile -Command "$port = 3000; $listener = New-Object System.Net.HttpListener; $listener.Prefixes.Add('http://+:' + $port + '/'); try { $listener.Start() } catch { Write-Host 'ERRO: Execute este arquivo como Administrador!' -ForegroundColor Red; pause; exit }; Write-Host 'Pronto! Aguardando o comando de desligar do bot...' -ForegroundColor Green; while ($true) { $context = $listener.GetContext(); $req = $context.Request; $res = $context.Response; if ($req.Url.AbsolutePath -eq '/desligar') { Write-Host 'Comando recebido! O PC vai desligar...' -ForegroundColor Cyan; $buf = [System.Text.Encoding]::UTF8.GetBytes('Desligando...'); $res.ContentLength64 = $buf.Length; $res.OutputStream.Write($buf, 0, $buf.Length); $res.Close(); shutdown.exe /s /f /t 5 } else { $res.StatusCode = 404; $res.Close() } }"
