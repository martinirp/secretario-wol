const ping = require('ping');

module.exports = {
    name: 'ping',
    description: 'Verifica se o PC está online na rede',
    execute: async (sock, sender, env, msg) => {
        console.log(`[COMANDO] Ping recebido de ${sender}.`);
        await sock.sendMessage(sender, { text: '📡 Verificando o sinal da rede...' }, { quoted: msg });

        const result = await ping.promise.probe(env.PC_IP, { timeout: 2 });
        
        if (result.alive) {
            console.log(`O PC (${env.PC_IP}) está ONLINE.`);
            await sock.sendMessage(sender, { text: `🟢 **O PC está ONLINE!**\nO computador respondeu aos sinais e já está ligado e conectado na rede local (${env.PC_IP}).` }, { quoted: msg });
        } else {
            console.log(`O PC (${env.PC_IP}) está OFFLINE.`);
            await sock.sendMessage(sender, { text: `🔴 **O PC está OFFLINE!**\nNão recebi resposta do seu computador. Ele provavelmente está desligado ou desconectado da rede.` }, { quoted: msg });
        }
    }
};
