const wol = require('wake_on_lan');
const ping = require('ping');

// Função auxiliar para esperar o PC ligar
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
    execute: async (sock, sender, env) => {
        console.log(`[COMANDO] Ligar PC recebido de um usuário autorizado (${sender}).`);
        await sock.sendMessage(sender, { text: '🔄 Enviando sinal mágico na rede... Ficarei de olho pra te avisar quando ele ligar!' });

        wol.wake(env.MAC_ADDRESS, { address: env.BROADCAST_ADDRESS }, async (error) => {
            if (error) {
                console.error('Erro ao enviar o pacote WoL:', error);
                await sock.sendMessage(sender, { text: '❌ Ocorreu um erro ao enviar o sinal na rede.' });
            } else {
                console.log(`Sinal enviado. Aguardando o PC (${env.PC_IP}) ficar online...`);
                
                const isOnline = await waitForPcToTurnOn(env.PC_IP);
                
                if (isOnline) {
                    console.log('O PC respondeu ao Ping! Está online.');
                    await sock.sendMessage(sender, { text: '✅ **Pronto!** Seu computador acabou de ligar e já está conectado na rede!' });
                } else {
                    console.log('O PC não respondeu após 2 minutos.');
                    await sock.sendMessage(sender, { text: '⚠️ Já se passaram 2 minutos e o PC não deu sinal de vida.' });
                }
            }
        });
    }
};
