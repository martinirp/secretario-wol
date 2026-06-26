module.exports = {
    name: 'ping',
    description: 'Testa se o bot consegue enviar mensagens',
    execute: async (sock, sender, env, msg) => {
        console.log('[PING] Comando ping recebido de:', sender);
        try {
            await sock.sendMessage(sender, { text: 'Status: Online. Sistema operacional e responsivo.' }, { quoted: msg });
            console.log('[PING] Resposta enviada com sucesso!');
        } catch (err) {
            console.error('[PING] Erro ao enviar resposta:', err);
        }
    }
};
