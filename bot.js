const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const wol = require('wake_on_lan');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const readline = require('readline');
const ping = require('ping');
require('dotenv').config();

// IP de broadcast padrão para WoL
const BROADCAST_ADDRESS = process.env.BROADCAST_ADDRESS || '255.255.255.255';

// Função auxiliar para fazer perguntas no console
function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

// Verifica e cria o arquivo .env se for a primeira vez
async function setupEnv() {
    let mac = process.env.MAC_ADDRESS;
    let authNum = process.env.AUTHORIZED_NUMBER;
    let ip = process.env.PC_IP;

    if (!mac || !authNum || !ip) {
        console.log("\n=============================================");
        console.log("   PRIMEIRA EXECUÇÃO - CONFIGURAÇÃO INICIAL  ");
        console.log("=============================================\n");
        
        if (!mac) {
            mac = await askQuestion("1. Digite o MAC Address do PC que será ligado (Ex: 00:1A:2B:3C:4D:5E):\n> ");
        }
        if (!ip) {
            ip = await askQuestion("\n2. Digite o IP local do PC para sabermos quando ele ligar (Ex: 192.168.0.100):\n> ");
        }
        if (!authNum) {
            authNum = await askQuestion("\n3. Digite o número do SEU WhatsApp (apenas números, com DDI 55 e DDD):\n> ");
        }
        
        const envContent = `MAC_ADDRESS=${mac}\nPC_IP=${ip}\nAUTHORIZED_NUMBER=${authNum}\n`;
        fs.writeFileSync('.env', envContent);
        
        console.log("\n✅ Configurações salvas no arquivo '.env' com sucesso!");
        console.log("=============================================\n");
        
        process.env.MAC_ADDRESS = mac;
        process.env.PC_IP = ip;
        process.env.AUTHORIZED_NUMBER = authNum;
    }
}

// Função para ficar pingando o PC até ele responder (máximo de ~2 minutos)
async function waitForPcToTurnOn(ipAddress) {
    let attempts = 0;
    const maxAttempts = 40; // 40 tentativas * 3 segundos = ~2 minutos
    
    return new Promise((resolve) => {
        const interval = setInterval(async () => {
            attempts++;
            const result = await ping.promise.probe(ipAddress, { timeout: 1 });
            
            if (result.alive) {
                clearInterval(interval);
                resolve(true); // PC ligou!
            } else if (attempts >= maxAttempts) {
                clearInterval(interval);
                resolve(false); // Demorou demais, falhou
            }
        }, 3000); // Ping a cada 3 segundos
    });
}

async function connectToWhatsApp () {
    // 1. Configura as variáveis de ambiente perguntando no terminal se necessário
    await setupEnv();

    const MAC_ADDRESS = process.env.MAC_ADDRESS;
    const PC_IP = process.env.PC_IP;
    const AUTHORIZED_NUMBER = process.env.AUTHORIZED_NUMBER;

    // 2. Inicia o Bot do WhatsApp
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true 
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexão fechada. Tentando reconectar...', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('\n[!] Secretário conectado e pronto!');
            console.log(`[!] O número autorizado a mandar comandos é: ${AUTHORIZED_NUMBER}`);
            console.log('[!] Aguardando mensagem "Ligar PC"...\n');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Escutando as mensagens recebidas
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return; 
        
        const msg = messages[0];
        if (!msg.message) return;

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!text) return;

        const sender = msg.key.remoteJid;

        // Filtro de Segurança
        if (!sender.includes(AUTHORIZED_NUMBER)) {
            return;
        }

        if (text.toLowerCase().trim() === 'ligar pc') {
            console.log(`Comando de ligar recebido de ${sender}.`);
            await sock.sendMessage(msg.key.remoteJid, { text: '🔄 Enviando sinal... Ficarei de olho pra te avisar quando ele ligar!' });

            // Dispara o Wake on LAN
            wol.wake(MAC_ADDRESS, { address: BROADCAST_ADDRESS }, async (error) => {
                if (error) {
                    console.error('Erro ao enviar o pacote WoL:', error);
                    await sock.sendMessage(msg.key.remoteJid, { text: '❌ Ocorreu um erro ao enviar o sinal na rede.' });
                } else {
                    console.log(`Sinal de ligar enviado. Aguardando o PC (${PC_IP}) ficar online...`);
                    
                    // Aguarda até o PC responder ao Ping
                    const isOnline = await waitForPcToTurnOn(PC_IP);
                    
                    if (isOnline) {
                        console.log('O PC respondeu ao Ping! Está online.');
                        await sock.sendMessage(msg.key.remoteJid, { text: '✅ **Pronto!** Seu computador acabou de ligar e já está conectado na rede!' });
                    } else {
                        console.log('O PC não respondeu após 2 minutos.');
                        await sock.sendMessage(msg.key.remoteJid, { text: '⚠️ Já se passaram 2 minutos e o PC não deu sinal de vida. Pode ser que a placa-mãe não tenha respondido ao comando.' });
                    }
                }
            });
        }
    });
}

connectToWhatsApp();
