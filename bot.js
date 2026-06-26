const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion, jidNormalizedUser } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
require('dotenv').config();

const AUTHORIZED_USERS_FILE = 'authorized_users.json';
const COMMANDS_DIR = path.join(__dirname, 'commands');

// Carrega os comandos do diretório dinamicamente
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
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

function loadAuthorizedUsers() {
    if (fs.existsSync(AUTHORIZED_USERS_FILE)) {
        const data = fs.readFileSync(AUTHORIZED_USERS_FILE);
        return JSON.parse(data);
    }
    return [];
}

function getAuthorizedJids() {
    const users = loadAuthorizedUsers();
    return users.map(u => typeof u === 'string' ? u : u.jid);
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

async function setupEnv() {
    let mac = process.env.MAC_ADDRESS;
    let ip = process.env.PC_IP;
    let secret = process.env.SECRET_LINK_COMMAND;
    let broadcast = process.env.BROADCAST_ADDRESS;

    if (!mac || !ip || !secret) {
        console.log("\n=============================================");
        console.log("   PRIMEIRA EXECUÇÃO - CONFIGURAÇÃO INICIAL  ");
        console.log("=============================================\n");
        
        if (!mac) {
            mac = await askQuestion("1. Digite o MAC Address do PC que será ligado (Ex: 00:1A:2B:3C:4D:5E):\n> ");
        }
        if (!ip) {
            ip = await askQuestion("\n2. Digite o IP local do PC para sabermos quando ele ligar (Ex: 192.168.0.100):\n> ");
        }
        if (!secret) {
            secret = await askQuestion("\n3. Escolha uma FRASE SECRETA para registrar seu celular (Ex: Registrar Chefe 123):\n> ");
        }
        
        const envContent = `MAC_ADDRESS=${mac}\nPC_IP=${ip}\nSECRET_LINK_COMMAND=${secret}\nBROADCAST_ADDRESS=255.255.255.255\n`;
        fs.writeFileSync('.env', envContent);
        
        console.log("\n✅ Configurações salvas no arquivo '.env' com sucesso!");
        console.log("=============================================\n");
        
        process.env.MAC_ADDRESS = mac;
        process.env.PC_IP = ip;
        process.env.SECRET_LINK_COMMAND = secret;
        process.env.BROADCAST_ADDRESS = '255.255.255.255';
    }
}

async function connectToWhatsApp () {
    await setupEnv();

    const envConfig = {
        MAC_ADDRESS: process.env.MAC_ADDRESS,
        PC_IP: process.env.PC_IP,
        BROADCAST_ADDRESS: process.env.BROADCAST_ADDRESS || '255.255.255.255'
    };

    const SECRET_LINK_COMMAND = process.env.SECRET_LINK_COMMAND.toLowerCase().trim();

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
                console.log('\n[!] Você foi deslogado. Apagando a pasta "auth_info_baileys" automaticamente e reiniciando...');
                try {
                    fs.rmSync('auth_info_baileys', { recursive: true, force: true });
                } catch (err) {
                    console.error('Erro ao apagar pasta:', err);
                }
                setTimeout(connectToWhatsApp, 3000);
            }
        } else if (connection === 'open') {
            console.log('\n[!] Secretário conectado e pronto!');
            console.log(`[!] Comandos carregados: ${Array.from(commands.keys()).join(', ')}`);
            
            const authorizedUsers = getAuthorizedJids();
            if (authorizedUsers.length > 0) {
                console.log(`[!] Bot já possui um dono registrado. Tudo pronto!\n`);
            } else {
                console.log(`[!] Para registrar o celular mestre, mande: "${process.env.SECRET_LINK_COMMAND}"\n`);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        console.log(`[DEBUG] EVENTO messages.upsert | tipo: ${type} | msgs: ${messages.length}`);
        
        if (type !== 'notify') {
            return; // Evita processar mensagens antigas do histórico
        }

        for (const msg of messages) {
            if (!msg.message) continue;

            // Copiando do BossBot: ID exata e extração de dados
            const remoteJid = msg.key.remoteJid;
            if (!remoteJid || remoteJid === 'status@broadcast') continue;

            const isGroup = remoteJid.endsWith('@g.us');
            const senderJid = jidNormalizedUser(msg.key.participant || remoteJid);
            const senderPhone = senderJid.split('@')[0];
            const senderName = msg.pushName || '';
            const normalizedSenderUser = senderJid;
            const chatJid = remoteJid;

            // Extração de texto idêntica ao BossBot
            const text = msg.message.conversation || 
                         msg.message.extendedTextMessage?.text || 
                         msg.message.ephemeralMessage?.message?.conversation ||
                         msg.message.ephemeralMessage?.message?.extendedTextMessage?.text ||
                         msg.message.imageMessage?.caption || 
                         msg.message.videoMessage?.caption || 
                         '';

            if (!text) continue;
            
            // Remover espaços duplicados e forçar minúscula
            let normalizedText = text.trim().replace(/\s+/g, ' ').toLowerCase();

            const authorizedUsers = getAuthorizedJids();
            
            // Ignora silenciosamente mensagens de outras pessoas caso já exista um dono cadastrado
            if (authorizedUsers.length > 0 && !authorizedUsers.includes(normalizedSenderUser) && !msg.key.fromMe) {
                continue;
            }

            console.log(`\n[DEBUG] Mensagem recebida: "${text}" | Comando: "${normalizedText}" | De: ${normalizedSenderUser} | Chat: ${chatJid}`);

            // 1. Sistema de Registro Secreto
            if (normalizedText === SECRET_LINK_COMMAND) {
                if (authorizedUsers.includes(normalizedSenderUser)) {
                    await sock.sendMessage(chatJid, { text: '⚠️ Este aparelho já estava autorizado. Pode mandar os comandos normalmente!' }, { quoted: msg });
                    continue;
                }
                if (authorizedUsers.length >= 1) {
                    console.log(`[ALERTA DE SEGURANÇA] Aparelho bloqueado tentando se registrar: ${normalizedSenderUser}`);
                    continue; // Limite de 1 usuário
                }

                if (saveAuthorizedUser(normalizedSenderUser, senderName)) {
                    console.log(`[SUCESSO] Dono registrado: ${normalizedSenderUser} (${senderName}). Sistema TRANCADO.`);
                    await sock.sendMessage(chatJid, { text: `✅ Seu aparelho foi reconhecido como o ÚNICO dono do sistema!\n\nNenhum outro celular poderá se registrar.\nComandos disponíveis: *${Array.from(commands.keys()).join('*, *')}*` }, { quoted: msg });
                }
                continue;
            }

            // Sistema de DESREGISTRO (vesh)
            if (normalizedText === 'vesh') {
                if (authorizedUsers.includes(normalizedSenderUser) || msg.key.fromMe) {
                    if (fs.existsSync(AUTHORIZED_USERS_FILE)) {
                        fs.unlinkSync(AUTHORIZED_USERS_FILE);
                    }
                    console.log(`[SUCESSO] Sistema DESBLOQUEADO (desregistrado por ${normalizedSenderUser}).`);
                    await sock.sendMessage(chatJid, { text: `🔓 Sistema DESBLOQUEADO!\n\nTodos os registros foram apagados. O bot está livre para um novo celular se registrar com a palavra-chave (vish).` }, { quoted: msg });
                }
                continue;
            }

            // 2. Sistema de Execução Dinâmica de Comandos
            let foundCommand = null;
            // Busca manual no Map para ser 100% insensível a maiúsculas, minúsculas e espaços extras
            for (const [key, cmd] of commands.entries()) {
                if (key.toLowerCase().trim() === normalizedText.toLowerCase().trim()) {
                    foundCommand = cmd;
                    break;
                }
            }

            if (foundCommand) {
                // Verifica se o usuário tem permissão
                if (authorizedUsers.includes(normalizedSenderUser) || msg.key.fromMe) {
                    try {
                        // Usa o chatJid bruto (exatamente onde a mensagem chegou) igual ao BossBot
                        let targetJid = chatJid;
                        // FIX PARA SELF-BOT: Se a mensagem foi mandada por você mesmo no seu próprio chat ("Você")
                        if (msg.key.fromMe && !isGroup) {
                            targetJid = jidNormalizedUser(sock.user.id);
                        }

                        console.log(`\n[DEBUG TARGET JID] remoteJid: ${chatJid} | normalizedSender: ${normalizedSenderUser} | sock.user.id: ${sock.user.id} | ENVIANDO RESPOSTA PARA: ${targetJid}\n`);

                        // Passa a msg original como quarto argumento para o comando poder usar quote
                        await foundCommand.execute(sock, targetJid, envConfig, msg);
                    } catch (error) {
                        console.error(`Erro ao executar comando ${foundCommand.name}:`, error);
                    }
                } else {
                    console.log(`[BLOQUEADO] Tentativa de usar comando de um usuário não registrado: ${normalizedSenderUser}`);
                }
            } else {
                // Se o usuário mandou algo que parece um comando e está registrado, avisamos
                if ((authorizedUsers.includes(normalizedSenderUser) || msg.key.fromMe) && !normalizedText.includes(' ')) {
                    console.log(`[DEBUG] Comando não encontrado: "${normalizedText}"`);
                }
            }
        }
    });
}

connectToWhatsApp();
