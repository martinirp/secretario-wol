const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
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

function saveAuthorizedUser(senderId) {
    const users = loadAuthorizedUsers();
    if (!users.includes(senderId)) {
        users.push(senderId);
        fs.writeFileSync(AUTHORIZED_USERS_FILE, JSON.stringify(users));
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
            
            const authorizedUsers = loadAuthorizedUsers();
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
            console.log(`[DEBUG] Ignorado pois type não é notify, e sim: ${type}`);
            return; // Evita processar mensagens antigas do histórico
        }

        const msg = messages[0];
        if (!msg.message) return;

        const sender = msg.key.remoteJid;

        // IGNORAR MENSAGENS DE GRUPOS E STATUS
        if (!sender || sender.endsWith('@g.us') || sender === 'status@broadcast') {
            return;
        }

        // Melhorar a extração de texto para diferentes tipos de mensagens
        let text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        
        if (!text && msg.message.ephemeralMessage) {
            text = msg.message.ephemeralMessage.message?.conversation || msg.message.ephemeralMessage.message?.extendedTextMessage?.text;
        }

        if (!text && msg.message.imageMessage) {
            text = msg.message.imageMessage.caption;
        }

        if (!text && msg.message.videoMessage) {
            text = msg.message.videoMessage.caption;
        }
        
        if (!text) return;
        
        const normalizedText = text.toLowerCase().trim();
        const authorizedUsers = loadAuthorizedUsers();
        
        // Ignora silenciosamente mensagens de outras pessoas caso já exista um dono cadastrado
        if (authorizedUsers.length > 0 && !authorizedUsers.includes(sender) && !msg.key.fromMe) {
            return;
        }

        console.log(`\n[DEBUG] Mensagem recebida: "${text}" | De: ${sender}`);

        // 1. Sistema de Registro Secreto
        if (normalizedText === SECRET_LINK_COMMAND) {
            if (authorizedUsers.includes(sender)) {
                await sock.sendMessage(sender, { text: '⚠️ Este aparelho já estava autorizado. Pode mandar os comandos normalmente!' });
                return;
            }
            if (authorizedUsers.length >= 1) {
                console.log(`[ALERTA DE SEGURANÇA] Aparelho bloqueado tentando se registrar: ${sender}`);
                return; // Limite de 1 usuário
            }

            if (saveAuthorizedUser(sender)) {
                console.log(`[SUCESSO] Dono registrado: ${sender}. Sistema TRANCADO.`);
                await sock.sendMessage(sender, { text: `✅ Seu aparelho foi reconhecido como o ÚNICO dono do sistema!\n\nNenhum outro celular poderá se registrar.\nComandos disponíveis: *${Array.from(commands.keys()).join('*, *')}*` });
            }
            return;
        }

        // 2. Sistema de Execução Dinâmica de Comandos
        if (commands.has(normalizedText)) {
            // Verifica se o usuário tem permissão
            if (authorizedUsers.includes(sender) || msg.key.fromMe) {
                const command = commands.get(normalizedText);
                try {
                    await command.execute(sock, sender, envConfig);
                } catch (error) {
                    console.error(`Erro ao executar comando ${command.name}:`, error);
                    await sock.sendMessage(sender, { text: '❌ Ocorreu um erro interno ao executar este comando.' });
                }
            } else {
                console.log(`[BLOQUEADO] Tentativa de usar comando de um usuário não registrado: ${sender}`);
            }
        } else {
            // Se o usuário mandou só uma palavra (possível comando digitado errado) e está registrado, avisamos
            if ((authorizedUsers.includes(sender) || msg.key.fromMe) && !normalizedText.includes(' ')) {
                console.log(`[DEBUG] Comando não encontrado no Map: "${normalizedText}"`);
                await sock.sendMessage(sender, { text: `❓ Comando não encontrado: *${normalizedText}*\n\nComandos disponíveis: *${Array.from(commands.keys()).join('*, *')}*` });
            }
        }
    });
}

connectToWhatsApp();
