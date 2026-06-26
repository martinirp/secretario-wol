const { exec } = require('child_process');

module.exports = {
    name: 'reset',
    description: 'Atualiza o código via GitHub (git pull) e reinicia o bot',
    execute: async (sock, sender, env) => {
        console.log(`[COMANDO] Reset solicitado por ${sender}.`);
        await sock.sendMessage(sender, { text: '🔄 Puxando as últimas atualizações do GitHub...' });

        exec('git pull', async (error, stdout, stderr) => {
            if (error) {
                console.error(`Erro ao executar git pull: ${error.message}`);
                await sock.sendMessage(sender, { text: `❌ Falha ao atualizar o bot pelo GitHub:\n${error.message}` });
                return;
            }

            console.log(`[GIT PULL] ${stdout}`);
            await sock.sendMessage(sender, { text: `✅ Atualização concluída com sucesso!\n\n${stdout}\n\nReiniciando o sistema agora... Aguarde uns segundos.` });

            // Dá um tempo para a mensagem ser enviada e encerra o processo
            // O manager.js vai detectar que o bot fechou e vai abri-lo novamente com o código novo!
            setTimeout(() => {
                console.log('[RESET] Encerrando o processo para reinicialização...');
                process.exit(0);
            }, 2000);
        });
    }
};
