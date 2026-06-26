const { exec } = require('child_process');

module.exports = {
    name: 'reset',
    description: 'Atualiza o código via GitHub (git pull) e reinicia o bot',
    execute: async (sock, sender, env, msg) => {
        console.log(`[COMANDO] Reset solicitado por ${sender}.`);
        await sock.sendMessage(sender, { text: 'Iniciando atualização de sistema via repositório remoto (GitHub)...' }, { quoted: msg });

        exec('git pull', async (error, stdout, stderr) => {
            console.log(`[RESET] Callback do exec disparado.`);
            if (error) {
                console.error(`[RESET] Erro ao executar git pull: ${error.message}`);
                await sock.sendMessage(sender, { text: `Falha na atualização: Erro de execução no git pull:\n${error.message}` }, { quoted: msg });
                return;
            }

            console.log(`[RESET] Saída do git: ${stdout}`);
            await sock.sendMessage(sender, { text: `Atualização concluída com sucesso.\n\nDetalhes do pull:\n${stdout}\n\nO sistema será reiniciado em instantes.` }, { quoted: msg });

            // Dá um tempo para a mensagem ser enviada e encerra o processo
            setTimeout(() => {
                console.log('[RESET] Encerrando o processo para reinicialização...');
                process.exit(0);
            }, 2000);
        });
    }
};
