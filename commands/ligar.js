const wol = require('wake_on_lan');
const ping = require('ping');



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
                console.log('Sinal Wake-on-LAN enviado.');
                try {
                    await sock.sendMessage(sender, { text: 'Operação concluída. Sinal Wake-on-LAN enviado ao computador com sucesso.' }, { quoted: msg });
                } catch (e) {
                    console.error('Erro ao enviar resposta final:', e);
                }
            }
        });
    }
};
