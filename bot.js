const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion, jidNormalizedUser } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
require('dotenv').config();

const AUTHORIZED_USERS_FILE = 'authorized_users.json';
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

// --- 2. Utils de Autenticação de Usuários ---
function loadAuthorizedUsers() {
    if (!fs.existsSync(AUTHORIZED_USERS_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(AUTHORIZED_USERS_FILE));
    } catch {
        return [];
    }
}

function getAuthorizedJids() {
    return loadAuthorizedUsers().map(u => typeof u === 'string' ? u : u.jid);
}

function saveAuthorizedUser(senderId, senderName) {
    const users = loadAuthorizedUsers();
    const jids = getAuthorizedJids();
    if (!jids.includes(senderId)) {
        users.push({ jid: senderId, name: senderName, registeredAt: new Date().toISOString() });
        fs.writeFileSync(AUTHORIZED_USERS_FILE, JSON.stringify(users, null, 2));
        return true;
    }
    return false;
}

function askQuestion(query) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(query, ans => { rl.close(); resolve(ans); }));
}

// --- 3. Configuração Inicial ---
async function setupEnv() {
    let { MAC_ADDRESS, PC_IP, SECRET_LINK_COMMAND, BROADCAST_ADDRESS } = process.env;

    if (!MAC_ADDRESS || !PC_IP || !SECRET_LINK_COMMAND) {
        console.log("\n=============================================");
        console.log("   PRIMEIRA EXECUÇÃO - CONFIGURAÇÃO INICIAL  ");
        console.log("=============================================\n");
        
        MAC_ADDRESS = MAC_ADDRESS || await askQuestion("1. Digite o MAC Address do PC que será ligado (Ex: 00:1A:2B:3C:4D:5E):\n> ");
        PC_IP = PC_IP || await askQuestion("\n2. Digite o IP local do PC para sabermos quando ele ligar (Ex: 192.168.0.100):\n> ");
        SECRET_LINK_COMMAND = SECRET_LINK_COMMAND || await askQuestion("\n3. Escolha uma FRASE SECRETA para registrar seu celular (Ex: Registrar Chefe 123):\n> ");
        
        fs.writeFileSync('.env', `MAC_ADDRESS=${MAC_ADDRESS}\nPC_IP=${PC_IP}\nSECRET_LINK_COMMAND=${SECRET_LINK_COMMAND}\nBROADCAST_ADDRESS=255.255.255.255\n`);
        
        console.log("\n✅ Configurações salvas no arquivo '.env' com sucesso!");
        process.env.MAC_ADDRESS = MAC_ADDRESS;
        process.env.PC_IP = PC_IP;
        process.env.SECRET_LINK_COMMAND = SECRET_LINK_COMMAND;
        process.env.BROADCAST_ADDRESS = '255.255.255.255';
    }
}

// --- 4. Conexão Principal ---
async function connectToWhatsApp() {
    await setupEnv();

    const envConfig = {
        MAC_ADDRESS: process.env.MAC_ADDRESS,
        PC_IP: process.env.PC_IP,
        BROADCAST_ADDRESS: process.env.BROADCAST_ADDRESS || '255.255.255.255'
    };

    const SECRET_COMMAND = process.env.SECRET_LINK_COMMAND.toLowerCase().trim();

    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false,
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
            
            if (getAuthorizedJids().length > 0) {
                console.log(`[!] Bot já possui um dono registrado. Tudo pronto!\n`);
            } else {
                console.log(`[!] Para registrar o celular mestre, mande: "${process.env.SECRET_LINK_COMMAND}"\n`);
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
            const isGroup = remoteJid.endsWith('@g.us');
            const participant = msg.key.participant || remoteJid;
            const senderJid = jidNormalizedUser(participant);
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
            const authorizedUsers = getAuthorizedJids();
            
            // Segurança: Ignora mensagens de não-donos (exceto o próprio bot enviando do chat do dono)
            if (authorizedUsers.length > 0 && !authorizedUsers.includes(senderJid) && !msg.key.fromMe) {
                continue;
            }

            // Sistema de Registro
            if (normalizedText === SECRET_COMMAND) {
                if (authorizedUsers.includes(senderJid)) {
                    await sock.sendMessage(remoteJid, { text: '⚠️ Este aparelho já estava autorizado.' });
                    continue;
                }
                if (authorizedUsers.length >= 1) {
                    console.log(`[BLOQUEIO] Tentativa de registro por número não autorizado: ${senderJid}`);
                    continue; // Limite de 1 usuário (dono)
                }

                if (saveAuthorizedUser(senderJid, senderName)) {
                    console.log(`[SUCESSO] Dono registrado: ${senderJid}`);
                    await sock.sendMessage(remoteJid, { text: `✅ Aparelho reconhecido! Sistema TRANCADO.\nComandos disponíveis: *${Array.from(commands.keys()).join('*, *')}*` });
                }
                continue;
            }

            // Sistema de Desregistro (vesh)
            if (normalizedText === 'vesh') {
                if (authorizedUsers.includes(senderJid) || msg.key.fromMe) {
                    if (fs.existsSync(AUTHORIZED_USERS_FILE)) fs.unlinkSync(AUTHORIZED_USERS_FILE);
                    console.log(`[SUCESSO] Sistema DESBLOQUEADO.`);
                    await sock.sendMessage(remoteJid, { text: `🔓 Sistema DESBLOQUEADO! Todos os registros foram apagados.` });
                }
                continue;
            }

            // Execução de Comandos
            let foundCommand = Array.from(commands.values()).find(cmd => cmd.name.toLowerCase() === normalizedText);

            if (foundCommand) {
                if (authorizedUsers.includes(senderJid) || msg.key.fromMe) {
                    try {
                        // FIX SELF-BOT: Se enviou pra si mesmo, a resposta deve ir para o ID logado
                        let targetJid = remoteJid;
                        if (msg.key.fromMe && !isGroup) {
                            targetJid = jidNormalizedUser(sock.user.id);
                        }
                        
                        console.log(`\n[COMANDO] "${foundCommand.name}" executado. Enviando reposta para: ${targetJid}`);
                        await foundCommand.execute(sock, targetJid, envConfig, msg);
                    } catch (error) {
                        console.error(`Erro ao executar ${foundCommand.name}:`, error);
                    }
                }
            }
        }
    });
}

connectToWhatsApp();
