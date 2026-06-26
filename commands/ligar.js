const wol = require('wake_on_lan');
const ping = require('ping');

async function waitForPcToTurnOn(ipAddress) {
    let attempts = 0;
    const maxAttempts = 40; // 2 minutos
    return new Promise((resolve) => {
        const interval = setInterval(async () => {
            attempts++;
            const result = await ping.promise.probe(ipAddress, { timeout: 1 });
            if (result.alive) {
                clearInterval(interval);
                resolve(true);
            } else if (attempts >= maxAttempts) {
                clearInterval(interval);
                resolve(false);
            }
        }, 3000);
    });
}

module.exports = {
    name: 'ligar pc',
    description: 'Liga o computador via Wake On LAN',
    execute: async (sock, sender, env, msg) => {
        console.log(`[COMANDO] Ligar PC recebido.`);
        
        try {
            await sock.sendMessage(sender, { text: 'Processando requisição Wake-on-LAN. Sinal enviado, aguardando resposta da rede.' }, { quoted: msg });
        } catch (e) {
            console.error('Erro ao enviar mensagem inicial:', e);
        }

        wol.wake(env.MAC_ADDRESS, { address: env.BROADCAST_ADDRESS }, async (error) => {
            if (error) {
                console.error('Erro ao enviar o pacote WoL:', error);
                await sock.sendMessage(sender, { text: 'Falha na execução: Erro ao transmitir o pacote Wake-on-LAN na rede.' }, { quoted: msg });
            } else {
                console.log(`Sinal enviado. Aguardando o PC (${env.PC_IP}) ficar online...`);
                const isOnline = await waitForPcToTurnOn(env.PC_IP);
                
                try {
                    if (isOnline) {
                        console.log('O PC está online!');
                        await sock.sendMessage(sender, { text: 'Operação concluída com sucesso. O computador encontra-se online e responsivo.' }, { quoted: msg });
                    } else {
                        console.log('O PC não respondeu após 2 minutos.');
                        await sock.sendMessage(sender, { text: 'Timeout da operação. O computador não respondeu ao ping após 2 minutos.' }, { quoted: msg });
                    }
                } catch (e) {
                    console.error('Erro ao enviar resposta final:', e);
                }
            }
        });
    }
};
