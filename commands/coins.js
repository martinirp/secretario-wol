const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'coins',
    description: 'Checa o histórico de Tibia Coins do Coins API',
    execute: async (sock, sender, env, msg) => {
        console.log(`[COMANDO] Coins solicitado por ${sender}`);
        await sock.sendMessage(sender, { text: '🔍 Buscando histórico de moedas...' }, { quoted: msg });

        try {
            // Como o bot e a API rodam no mesmo servidor (Termux/Debian), 
            // a maneira mais rápida é ler o arquivo payments.json direto do diretório.
            // Aqui ele testa vários caminhos possíveis onde a pasta mauth/coins-api pode estar.
            const possiblePaths = [
                // Caminho absoluto no Linux (Termux/Proot)
                path.join(process.env.HOME || '/root', 'mauth/coins-api/payments.json'),
                // Caminho relativo a partir da pasta do bot (secretario-wol)
                path.join(process.cwd(), '../mauth/coins-api/payments.json'),
                // Outro relativo
                path.join(__dirname, '../../mauth/coins-api/payments.json'),
                // Caminhos de teste local no Windows
                'D:/Projects/CoinHistory/payments.json',
                'D:/Projects/tibiacoin_checker/payments.json'
            ];

            let dataPath = null;
            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    dataPath = p;
                    break;
                }
            }

            if (dataPath) {
                console.log(`[API] Lendo histórico diretamente do arquivo: ${dataPath}`);
                const rawData = fs.readFileSync(dataPath, 'utf8');
                let history = [];

                try {
                    history = JSON.parse(rawData);
                } catch (e) {
                    await sock.sendMessage(sender, { text: '⚠️ Erro ao ler o formato do arquivo payments.json.' }, { quoted: msg });
                    return;
                }

                // Normaliza para array (caso o JSON seja um objeto que contém array)
                let items = [];
                if (Array.isArray(history)) {
                    items = history;
                } else if (history.payments && Array.isArray(history.payments)) {
                    items = history.payments;
                } else if (history.history && Array.isArray(history.history)) {
                    items = history.history;
                } else if (typeof history === 'object') {
                    // Se for um dicionário de IDs
                    items = Object.values(history);
                }

                if (items.length === 0) {
                    await sock.sendMessage(sender, { text: '🪙 O histórico de moedas está vazio no momento.' }, { quoted: msg });
                    return;
                }

                // Pega os últimos 7 registros (mais recentes)
                const ultimos = items.slice(-7).reverse(); // Reverse para mostrar o mais novo primeiro

                let responseText = `🪙 *ÚLTIMAS TRANSAÇÕES* 🪙\n\n`;

                ultimos.forEach((item, index) => {
                    const char = item.character || item.name || 'Desconhecido';
                    const amount = item.amount || item.coins || 'N/A';
                    const status = item.used ? '✅ (Usado)' : '⏳ (Pendente)';
                    // Tenta extrair a data
                    const dateRaw = item.date || item.createdAt || item.timestamp;
                    const dateFormatted = dateRaw ? new Date(dateRaw).toLocaleString('pt-BR') : 'Data não registrada';

                    responseText += `*${index + 1}.* 👤 ${char}\n`;
                    responseText += ` *Quant:* ${amount} TC\n`;
                    responseText += ` *Status:* ${status}\n`;
                    responseText += ` *Data:* ${dateFormatted}\n\n`;
                });

                responseText += `_Base de dados lida com sucesso do servidor._`;
                await sock.sendMessage(sender, { text: responseText }, { quoted: msg });

            } else {
                console.log('[API] Arquivo payments.json não encontrado. Tentando via requisição HTTP...');

                // Se não achar o arquivo físico (por estar em outra pasta), tenta conectar pela API local
                const port = 5001; // Porta padrão que vimos no M-Auth

                try {
                    const response = await fetch(`http://127.0.0.1:${port}/api/history`);
                    if (response.ok) {
                        const data = await response.json();
                        await sock.sendMessage(sender, { text: `🪙 *HISTÓRICO DE COINS*\n\nConectado via API com sucesso! O formato retornado é:\n${JSON.stringify(data).substring(0, 200)}...` }, { quoted: msg });
                    } else {
                        throw new Error('Endpoint /api/history não respondeu corretamente.');
                    }
                } catch (e) {
                    await sock.sendMessage(sender, { text: `❌ Não consegui achar o arquivo *payments.json* nas pastas \`mauth/coins-api\` e a API local não respondeu.\nVerifique se o caminho da pasta no servidor está correto em relação ao bot.` }, { quoted: msg });
                }
            }
        } catch (error) {
            console.error('Erro no comando coins:', error);
            await sock.sendMessage(sender, { text: `❌ Ocorreu um erro fatal ao buscar o histórico:\n_${error.message}_` }, { quoted: msg });
        }
    }
};
