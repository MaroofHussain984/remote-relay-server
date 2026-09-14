const net = require('net');
const PORT = process.env.PORT || 10000;

const clients = new Map(); // ID -> Socket mapping

const server = net.createServer((socket) => {
    let myId = null;

    socket.on('data', (data) => {
        const msg = data.toString().trim();
        
        // 1. Jab koi app apni ID register kare
        if (msg.startsWith('REG:')) {
            myId = msg.split(':')[1];
            clients.set(myId, socket);
            console.log(`Client Registered: ${myId}`);
        }
        // 2. Jab koi viewer kisi ID se connect hona chahe
        else if (msg.startsWith('CONNECT:')) {
            const targetId = msg.split(':')[1];
            const targetSocket = clients.get(targetId);

            if (targetSocket) {
                socket.write('OK\n');
                socket.pipe(targetSocket);
                targetSocket.pipe(socket);
                console.log(`Bridged connection between viewer and ${targetId}`);
            } else {
                socket.write('DENIED\n');
            }
        }
    });

    socket.on('close', () => {
        if (myId) clients.delete(myId);
    });
    
    socket.on('err', () => {});
});

server.listen(PORT, () => {
    console.log(`Relay Server running on port ${PORT}`);
});
