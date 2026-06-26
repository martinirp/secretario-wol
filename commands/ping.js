module.exports = {
    name: 'ping',
    description: 'Testa se o bot consegue enviar mensagens',
    execute: async (sock, sender, env, msg) => {
        console.log('[PING] Comando ping recebido');
        console.log('[PING] sock.user:', JSON.stringify(sock.user));
        console.log('[PING] sender:', sender);
        console.log('[PING] chatJid:', msg.key.remoteJid);
        console.log('[PING] fromMe:', msg.key.fromMe);

        try {
            console.log('[PING] sender original:', sender);
            console.log('[PING] Tentando enviar mensagem...');
            const result = await sock.sendMessage(sender, { text: '🏓 Pong! Bot funcionando.' }, { quoted: msg });
            console.log('[PING] Mensagem enviada! Result:', JSON.stringify(result?.key));
        } catch (err) {
            console.error('[PING] ERRO ao enviar:', err);
        }
    }
};
