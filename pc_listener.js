const http = require('http');
const { exec } = require('child_process');

const PORT = 3000;

const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/desligar') {
        console.log('Recebido comando para desligar o PC!');
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Desligando...\n');

        // Comando para desligar o Windows (em 5 segundos, forçado)
        exec('shutdown -s -f -t 5', (error, stdout, stderr) => {
            if (error) {
                console.error(`Erro ao desligar: ${error.message}`);
                return;
            }
            if (stderr) {
                console.error(`Stderr: ${stderr}`);
                return;
            }
            console.log(`Stdout: ${stdout}`);
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found\n');
    }
});

server.listen(PORT, () => {
    console.log(`Servidor rodando no PC na porta ${PORT}...`);
    console.log(`Aguardando o comando do bot para desligar.`);
});
