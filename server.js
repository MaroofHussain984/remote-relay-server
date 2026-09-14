const WebSocket = require('ws');
const PORT = process.env.PORT || 10000;

const clients = new Map(); // ID -> WebSocket mapping

const wss = new WebSocket.Server({ port: PORT }, () => {
    console.log(`WebSocket Relay Server running on port ${PORT}`);
});

wss.on('connection', (ws) => {
    let myId = null;

    ws.on('message', (message) => {
        const msg = message.toString().trim();
        
        // 1. ID Registration
        if (msg.startsWith('REG:')) {
            myId = msg.split(':')[1];
            clients.set(myId, ws);
            console.log(`Client Registered: ${myId}`);
        }
        // 2. Connection Request
        else if (msg.startsWith('CONNECT:')) {
            const targetId = msg.split(':')[1];
            const targetWs = clients.get(targetId);

            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                ws.send('OK');
                console.log(`Bridged connection to ${targetId}`);
            } else {
                ws.send('DENIED');
            }
        }
    });

    ws.on('close', () => {
        if (myId) clients.delete(myId);
    });
});
