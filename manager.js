const { spawn } = require('child_process');

function startBot() {
    console.log('[MANAGER] Iniciando o bot...');
    
    // Inicia o bot passando a mesma saída/entrada do terminal (stdio: inherit)
    // Isso é importante para o bot poder pedir a frase secreta e exibir os QR Codes no console
    const bot = spawn('node', ['bot.js'], { stdio: 'inherit' });

    bot.on('close', (code) => {
        console.log(`[MANAGER] O bot foi encerrado (Código: ${code}).`);
        console.log('[MANAGER] Reiniciando o bot em 3 segundos para garantir que ele nunca pare...');
        
        setTimeout(() => {
            startBot();
        }, 3000);
    });

    bot.on('error', (err) => {
        console.error('[MANAGER] Falha ao iniciar o processo do bot:', err);
    });
}

// Inicia o loop infinito do manager
console.log('=============================================');
console.log('   MANAGER INICIADO - PROTEÇÃO ANTI-QUEDA    ');
console.log('=============================================');
startBot();
