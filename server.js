const WebSocket = require('ws');
const PORT = process.env.PORT || 10000;

const rooms = new Map(); // ID -> { hostWs, password, viewerWs }

const wss = new WebSocket.Server({ port: PORT }, () => {
    console.log(`WebSocket Relay Server running on port ${PORT}`);
});

wss.on('connection', (ws) => {
    let currentId = null;
    let role = null; // 'host' ya 'viewer'

    ws.on('message', (message, isBinary) => {
        if (!isBinary) {
            const msg = message.toString().trim();
            
            // 1. Host Registration
            if (msg.startsWith('REG:')) {
                const parts = msg.split(':');
                currentId = parts[1];
                const password = parts[2];
                role = 'host';
                
                if (!rooms.has(currentId)) rooms.set(currentId, {});
                rooms.get(currentId).hostWs = ws;
                rooms.get(currentId).password = password;
                console.log(`Host Registered: ${currentId}`);
            }
            // 2. Viewer Connection Request
            else if (msg.startsWith('CONNECT:')) {
                const parts = msg.split(':');
                const targetId = parts[1];
                const password = parts[2];
                role = 'viewer';
                currentId = targetId;

                const room = rooms.get(targetId);
                if (room && room.hostWs && room.hostWs.readyState === WebSocket.OPEN) {
                    if (room.password === password) {
                        room.viewerWs = ws;
                        ws.send('OK');
                        room.hostWs.send('START_STREAM');
                        console.log(`Viewer connected to host ${targetId}`);
                    } else {
                        ws.send('WRONG_PASSWORD');
                    }
                } else {
                    ws.send('OFFLINE');
                }
            }
            // 3. NAYA: Viewer ke commands (MOVE, LCLICK, KEY) ko Host tak forward karna
            else if (role === 'viewer' && currentId) {
                const room = rooms.get(currentId);
                if (room && room.hostWs && room.hostWs.readyState === WebSocket.OPEN) {
                    room.hostWs.send(message);
                }
            }
        } else {
            // Binary Data Relay (Screen Frames from Host to Viewer)
            if (role === 'host' && currentId) {
                const room = rooms.get(currentId);
                if (room && room.viewerWs && room.viewerWs.readyState === WebSocket.OPEN) {
                    room.viewerWs.send(message, { binary: true });
                }
            }
        }
    });

    ws.on('close', () => {
        if (currentId && rooms.has(currentId)) {
            const room = rooms.get(currentId);
            if (role === 'host') rooms.delete(currentId);
            else if (role === 'viewer') room.viewerWs = null;
        }
    });
});
