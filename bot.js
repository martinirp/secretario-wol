const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion, jidNormalizedUser } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
require('dotenv').config();

const COMMANDS_DIR = path.join(__dirname, 'commands');

// --- 1. Carregamento Dinâmico de Comandos ---
const commands = new Map();
if (fs.existsSync(COMMANDS_DIR)) {
    const commandFiles = fs.readdirSync(COMMANDS_DIR).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const command = require(path.join(COMMANDS_DIR, file));
        if (command.name && command.execute) {
            commands.set(command.name, command);
        }
    }
}

function askQuestion(query) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(query, ans => { rl.close(); resolve(ans); }));
}

// --- 2. Configuração Inicial ---
async function setupEnv() {
    let { MAC_ADDRESS, PC_IP, BROADCAST_ADDRESS } = process.env;

    if (!MAC_ADDRESS || !PC_IP) {
        console.log("\n=============================================");
        console.log("   PRIMEIRA EXECUÇÃO - CONFIGURAÇÃO INICIAL  ");
        console.log("=============================================\n");
        
        MAC_ADDRESS = MAC_ADDRESS || await askQuestion("1. Digite o MAC Address do PC que será ligado (Ex: 00:1A:2B:3C:4D:5E):\n> ");
        PC_IP = PC_IP || await askQuestion("\n2. Digite o IP local do PC para sabermos quando ele ligar (Ex: 192.168.0.100):\n> ");
        
        fs.writeFileSync('.env', `MAC_ADDRESS=${MAC_ADDRESS}\nPC_IP=${PC_IP}\nBROADCAST_ADDRESS=255.255.255.255\n`);
        
        console.log("\n✅ Configurações salvas no arquivo '.env' com sucesso!");
        process.env.MAC_ADDRESS = MAC_ADDRESS;
        process.env.PC_IP = PC_IP;
        process.env.BROADCAST_ADDRESS = '255.255.255.255';
    }
}

// --- 3. Conexão Principal ---
async function connectToWhatsApp() {
    await setupEnv();

    const envConfig = {
        MAC_ADDRESS: process.env.MAC_ADDRESS,
        PC_IP: process.env.PC_IP,
        BROADCAST_ADDRESS: process.env.BROADCAST_ADDRESS || '255.255.255.255'
    };

    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrcode.generate(qr, { small: true });
            console.log('\n[!] Por favor, escaneie o QR Code acima com o seu celular!');
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`\nConexão fechada (Status: ${statusCode}). Tentando reconectar...`);
            
            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 3000);
            } else {
                console.log('\n[!] Você foi deslogado. Apagando "auth_info_baileys" e reiniciando...');
                try { fs.rmSync('auth_info_baileys', { recursive: true, force: true }); } catch (e) {}
                setTimeout(connectToWhatsApp, 3000);
            }
        } else if (connection === 'open') {
            console.log('\n[!] Secretário conectado e pronto!');
            console.log(`[!] Comandos carregados: ${Array.from(commands.keys()).join(', ')}`);
            if (process.env.AUTHORIZED_NUMBER) {
                console.log(`[!] O bot responderá APENAS ao número sincronizado: ${process.env.AUTHORIZED_NUMBER}\n`);
            } else {
                console.log(`[!] NENHUM NÚMERO SINCRONIZADO. Envie a palavra-chave para sincronizar.\n`);
            }
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            if (!msg.message) continue;

            const remoteJid = msg.key.remoteJid;
            if (!remoteJid || remoteJid === 'status@broadcast') continue;

            // Extração limpa de dados
            const senderName = msg.pushName || '';

            // Texto da mensagem
            const text = msg.message.conversation || 
                         msg.message.extendedTextMessage?.text || 
                         msg.message.ephemeralMessage?.message?.conversation ||
                         msg.message.ephemeralMessage?.message?.extendedTextMessage?.text ||
                         msg.message.imageMessage?.caption || 
                         msg.message.videoMessage?.caption || '';

            if (!text) continue;
            
            const normalizedText = text.trim().replace(/\s+/g, ' ').toLowerCase();

            // --- Sincronização de Número ---
            if (normalizedText === 'vish') {
                if (!process.env.AUTHORIZED_NUMBER) {
                    process.env.AUTHORIZED_NUMBER = remoteJid;
                    
                    const envPath = path.join(__dirname, '.env');
                    fs.appendFileSync(envPath, `\nAUTHORIZED_NUMBER=${remoteJid}\n`);
                    
                    console.log(`\n[AUTH] Número sincronizado: ${remoteJid}`);
                    await sock.sendMessage(remoteJid, { text: 'Dispositivo sincronizado. Este bot responderá exclusivamente a este número.' }, { quoted: msg });
                } else if (process.env.AUTHORIZED_NUMBER === remoteJid) {
                    await sock.sendMessage(remoteJid, { text: 'Este dispositivo já encontra-se sincronizado e autorizado.' }, { quoted: msg });
                }
                continue;
            }

            // --- Verificação de Autorização ---
            if (process.env.AUTHORIZED_NUMBER && process.env.AUTHORIZED_NUMBER !== remoteJid) {
                console.log(`\n[BLOQUEADO] Mensagem de número não autorizado: ${remoteJid}`);
                continue;
            }

            // Execução de Comandos
            let foundCommand = Array.from(commands.values()).find(cmd => cmd.name.toLowerCase() === normalizedText);

            if (foundCommand) {
                if (!process.env.AUTHORIZED_NUMBER) {
                    await sock.sendMessage(remoteJid, { text: 'Acesso negado. O sistema não possui um administrador sincronizado.' }, { quoted: msg });
                    continue;
                }

                try {
                    const targetJid = remoteJid;
                    
                    console.log(`\n[COMANDO] "${foundCommand.name}" executado por ${senderName || targetJid}. Enviando reposta para: ${targetJid}`);
                    await foundCommand.execute(sock, targetJid, envConfig, msg);
                } catch (error) {
                    console.error(`Erro ao executar ${foundCommand.name}:`, error);
                }
            }
        }
    });
}

connectToWhatsApp();
