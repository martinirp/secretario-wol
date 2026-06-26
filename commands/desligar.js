const http = require('http');

module.exports = {
    name: 'desligar pc',
    description: 'Desliga o computador remotamente',
    execute: async (sock, sender, env, msg) => {
        console.log(`[COMANDO] Desligar PC recebido de um usuário autorizado (${sender}).`);
        await sock.sendMessage(sender, { text: 'Processando requisição de desligamento remoto. Enviando comando.' }, { quoted: msg });

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
                await sock.sendMessage(sender, { text: 'Operação concluída. O comando de desligamento foi aceito e está em execução no sistema.' }, { quoted: msg });
            } else {
                console.log(`Erro ao desligar: Status Code ${res.statusCode}`);
                await sock.sendMessage(sender, { text: `Falha na execução: Servidor recusou a requisição (Status HTTP ${res.statusCode}).` }, { quoted: msg });
            }
        });

        req.on('error', async (error) => {
            console.error('Erro ao conectar ao PC:', error);
            await sock.sendMessage(sender, { text: 'Falha na conexão: Servidor inacessível. O computador pode já estar desligado ou o serviço não está ativo.' }, { quoted: msg });
        });

        req.on('timeout', () => {
            req.destroy();
        });

        req.end();
    }
};
