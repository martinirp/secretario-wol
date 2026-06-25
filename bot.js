const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const wol = require('wake_on_lan');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const readline = require('readline');
const ping = require('ping');
require('dotenv').config();

// IP de broadcast padrão para WoL
const BROADCAST_ADDRESS = process.env.BROADCAST_ADDRESS || '255.255.255.255';
const AUTHORIZED_USERS_FILE = 'authorized_users.json';

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

// Carrega a lista de números/LIDs autorizados
function loadAuthorizedUsers() {
    if (fs.existsSync(AUTHORIZED_USERS_FILE)) {
        const data = fs.readFileSync(AUTHORIZED_USERS_FILE);
        return JSON.parse(data);
    }
    return [];
}

// Salva um novo número/LID na lista
function saveAuthorizedUser(senderId) {
    const users = loadAuthorizedUsers();
    if (!users.includes(senderId)) {
        users.push(senderId);
        fs.writeFileSync(AUTHORIZED_USERS_FILE, JSON.stringify(users));
        return true;
    }
    return false; // Já estava autorizado
}

async function setupEnv() {
    let mac = process.env.MAC_ADDRESS;
    let ip = process.env.PC_IP;
    let secret = process.env.SECRET_LINK_COMMAND;

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
        
        const envContent = `MAC_ADDRESS=${mac}\nPC_IP=${ip}\nSECRET_LINK_COMMAND=${secret}\n`;
        fs.writeFileSync('.env', envContent);
        
        console.log("\n✅ Configurações salvas no arquivo '.env' com sucesso!");
        console.log("=============================================\n");
        
        process.env.MAC_ADDRESS = mac;
        process.env.PC_IP = ip;
        process.env.SECRET_LINK_COMMAND = secret;
    }
}

async function waitForPcToTurnOn(ipAddress) {
    let attempts = 0;
    const maxAttempts = 40; 
    return new Promise((resolve) => {
        const interval = setInterval(async () => {
            attempts++;
            const result = await ping.promise.probe(ipAddress, { timeout: 1 });
            if (result.alive) {
                clearInterval(interval);
                resolve(true);
            } else if (attempts >= maxAttempts) {
                clearInterval(interval);
                resolve(false);
            }
        }, 3000);
    });
}

async function connectToWhatsApp () {
    await setupEnv();

    const MAC_ADDRESS = process.env.MAC_ADDRESS;
    const PC_IP = process.env.PC_IP;
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
                console.log('\n[!] Você foi deslogado. Apague a pasta "auth_info_baileys" e rode novamente.');
            }
        } else if (connection === 'open') {
            console.log('\n[!] Secretário conectado e pronto!');
            console.log(`[!] Para registrar um novo celular, mande a frase: "${process.env.SECRET_LINK_COMMAND}"`);
            console.log('[!] Celulares já registrados podem apenas mandar "Ligar PC".\n');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        const msg = messages[0];
        if (!msg.message) return;

        let text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!text && msg.message.ephemeralMessage) {
            text = msg.message.ephemeralMessage.message?.conversation || msg.message.ephemeralMessage.message?.extendedTextMessage?.text;
        }
        
        if (!text) return;
        
        const sender = msg.key.remoteJid;
        const normalizedText = text.toLowerCase().trim();
        const authorizedUsers = loadAuthorizedUsers();
        
        console.log(`\n[DEBUG] Mensagem recebida: "${text}" | De: ${sender}`);

        // 1. Verifica se a pessoa está tentando se registrar usando a Frase Secreta
        if (normalizedText === SECRET_LINK_COMMAND) {
            // Se já for o celular do usuário cadastrado mandando a senha de novo
            if (authorizedUsers.includes(sender)) {
                await sock.sendMessage(sender, { text: '⚠️ Este aparelho já estava autorizado. Pode mandar *Ligar PC* quando quiser!' });
                return;
            }

            // Se for um aparelho NOVO tentando se cadastrar, mas já tem 1 registrado no arquivo
            if (authorizedUsers.length >= 1) {
                console.log(`[ALERTA DE SEGURANÇA] Aparelho bloqueado tentando se registrar: ${sender}`);
                // Nem mandamos resposta pra pessoa não saber que o bot existe
                return;
            }

            // Se a lista estiver vazia, cadastra o aparelho como o ÚNICO dono
            if (saveAuthorizedUser(sender)) {
                console.log(`[SUCESSO] Dono registrado: ${sender}. O sistema agora está TRANCADO para novos registros.`);
                await sock.sendMessage(sender, { text: '✅ Seu aparelho foi reconhecido como o ÚNICO dono do sistema!\n\nNenhum outro celular poderá se registrar. A partir de agora, mande *Ligar PC* para acordar o computador.' });
            }
            return;
        }

        // 2. Se for o comando de ligar, verifica se o usuário está na lista de autorizados
        if (normalizedText === 'ligar pc') {
            if (authorizedUsers.includes(sender) || msg.key.fromMe) {
                console.log(`[COMANDO] Ligar PC recebido de um usuário autorizado (${sender}).`);
                await sock.sendMessage(sender, { text: '🔄 Enviando sinal mágico na rede... Ficarei de olho pra te avisar quando ele ligar!' });

                wol.wake(MAC_ADDRESS, { address: BROADCAST_ADDRESS }, async (error) => {
                    if (error) {
                        console.error('Erro ao enviar o pacote WoL:', error);
                        await sock.sendMessage(sender, { text: '❌ Ocorreu um erro ao enviar o sinal na rede.' });
                    } else {
                        console.log(`Sinal enviado. Aguardando o PC (${PC_IP}) ficar online...`);
                        
                        const isOnline = await waitForPcToTurnOn(PC_IP);
                        
                        if (isOnline) {
                            console.log('O PC respondeu ao Ping! Está online.');
                            await sock.sendMessage(sender, { text: '✅ **Pronto!** Seu computador acabou de ligar e já está conectado na rede!' });
                        } else {
                            console.log('O PC não respondeu após 2 minutos.');
                            await sock.sendMessage(sender, { text: '⚠️ Já se passaram 2 minutos e o PC não deu sinal de vida.' });
                        }
                    }
                });
            } else {
                console.log(`[BLOQUEADO] Tentativa de ligar o PC de um usuário não registrado: ${sender}`);
            }
        }
    });
}

connectToWhatsApp();
