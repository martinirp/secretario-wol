const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'coins',
    description: 'Checa o histórico de Tibia Coins do Coins API',
    execute: async (sock, sender, env, msg) => {
        console.log(`[COMANDO] Coins solicitado por ${sender}`);
        await sock.sendMessage(sender, { text: 'Processando consulta ao histórico de transações...' }, { quoted: msg });

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
                    await sock.sendMessage(sender, { text: 'Falha na leitura: O arquivo payments.json está corrompido ou em formato inválido.' }, { quoted: msg });
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
                    await sock.sendMessage(sender, { text: 'Consulta concluída: O histórico de transações encontra-se vazio no momento.' }, { quoted: msg });
                    return;
                }

                // Pega os últimos 7 registros (mais recentes)
                const ultimos = items.slice(-7).reverse(); // Reverse para mostrar o mais novo primeiro

                let totalRecebido = 0;
                let totalPendente = 0;
                let totalUsado = 0;

                items.forEach(item => {
                    const amount = Number(item.amount || item.coins || 0);
                    if (!isNaN(amount)) {
                        totalRecebido += amount;
                        if (item.used) {
                            totalUsado += amount;
                        } else {
                            totalPendente += amount;
                        }
                    }
                });

                let responseText = `RELATÓRIO DE TRANSAÇÕES E SALDO\n\n`;
                responseText += `[ SALDO CALCULADO (BASEADO NO HISTÓRICO) ]\n`;
                responseText += `- Total Histórico: ${totalRecebido} TC\n`;
                responseText += `- Disponível/Pendente: ${totalPendente} TC\n`;
                responseText += `- Já Usado: ${totalUsado} TC\n\n`;
                responseText += `[ ÚLTIMAS TRANSAÇÕES ]\n\n`;

                ultimos.forEach((item, index) => {
                    const char = item.character || item.name || 'Desconhecido';
                    const amount = item.amount || item.coins || 'N/A';
                    const status = item.used ? 'Usado' : 'Pendente';
                    
                    const dateRaw = item.date || item.createdAt || item.timestamp;
                    let dateFormatted = 'Registro de tempo indisponível';
                    if (dateRaw) {
                        const d = new Date(dateRaw);
                        const data = d.toLocaleDateString('pt-BR');
                        const hora = d.toLocaleTimeString('pt-BR');
                        dateFormatted = `${data} às ${hora}`;
                    }

                    responseText += `Transação #${index + 1}\n`;
                    responseText += `- Personagem: ${char}\n`;
                    responseText += `- Quantidade: ${amount} TC\n`;
                    responseText += `- Status: ${status}\n`;
                    responseText += `- Data/Hora: ${dateFormatted}\n\n`;
                });

                responseText += `Fonte: Base de dados local.`;
                await sock.sendMessage(sender, { text: responseText }, { quoted: msg });

            } else {
                console.log('[API] Arquivo payments.json não encontrado. Tentando via requisição HTTP...');

                // Se não achar o arquivo físico (por estar em outra pasta), tenta conectar pela API local
                const port = 5001; // Porta padrão que vimos no M-Auth

                try {
                    const response = await fetch(`http://127.0.0.1:${port}/api/history`);
                    if (response.ok) {
                        const data = await response.json();
                        await sock.sendMessage(sender, { text: `*CONEXÃO VIA API ESTABELECIDA*\n\nDados brutos retornados pelo servidor:\n${JSON.stringify(data).substring(0, 200)}...` }, { quoted: msg });
                    } else {
                        throw new Error('Endpoint /api/history não respondeu corretamente.');
                    }
                } catch (e) {
                    await sock.sendMessage(sender, { text: `Falha na requisição: Arquivo payments.json não localizado e serviço da API local indisponível.\nVerifique a integridade dos caminhos e processos no servidor.` }, { quoted: msg });
                }
            }
        } catch (error) {
            console.error('Erro no comando coins:', error);
            await sock.sendMessage(sender, { text: `Erro crítico na execução do comando:\n${error.message}` }, { quoted: msg });
        }
    }
};
