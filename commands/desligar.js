const http = require('http');

module.exports = {
    name: 'desligar pc',
    description: 'Desliga o computador remotamente',
    execute: async (sock, sender, env) => {
        console.log(`[COMANDO] Desligar PC recebido de um usuário autorizado (${sender}).`);
        await sock.sendMessage(sender, { text: '🔌 Enviando o comando para desligar o PC...' });

        const options = {
            hostname: env.PC_IP,
            port: 3000,
            path: '/desligar',
            method: 'GET',
            timeout: 5000 // 5 segundos de timeout
        };

        const req = http.request(options, async (res) => {
            if (res.statusCode === 200) {
                console.log('PC recebeu o comando de desligar com sucesso.');
                await sock.sendMessage(sender, { text: '✅ **Feito!** O PC confirmou que está sendo desligado agora.' });
            } else {
                console.log(`Erro ao desligar: Status Code ${res.statusCode}`);
                await sock.sendMessage(sender, { text: '⚠️ O PC não aceitou o comando de desligar.' });
            }
        });

        req.on('error', async (error) => {
            console.error('Erro ao conectar ao PC:', error);
            await sock.sendMessage(sender, { text: '❌ Ocorreu um erro. O PC não respondeu (ele já pode estar desligado ou o script não está rodando lá).' });
        });

        req.on('timeout', () => {
            req.destroy();
        });

        req.end();
    }
};
