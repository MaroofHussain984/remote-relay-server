const WebSocket = require('ws');
const PORT = process.env.PORT || 10000;

const rooms = new Map(); // ID -> { hostWs, password, viewerWs, viewerControlWs }

const wss = new WebSocket.Server({ port: PORT }, () => {
    console.log(`WebSocket Relay Server running on port ${PORT}`);
});

wss.on('connection', (ws) => {
    let currentId = null;
    let role = null; // 'host', 'viewer', 'viewer_control'

    ws.on('message', (message, isBinary) => {
        if (!isBinary) {
            const msg = message.toString().trim();
            console.log(`[Server Received]: ${msg}`); // Debugging

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
            // 2. Viewer Video Stream Connection
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
                        console.log(`Viewer (Video) connected to host ${targetId}`);
                    } else {
                        ws.send('WRONG_PASSWORD');
                    }
                } else {
                    ws.send('OFFLINE');
                }
            }
            // 3. Viewer Control Connection (Mouse/Keyboard)
            else if (msg.startsWith('VIEWER:')) {
                const parts = msg.split(':');
                currentId = parts[1];
                role = 'viewer_control';
                
                if (!rooms.has(currentId)) rooms.set(currentId, {});
                rooms.get(currentId).viewerControlWs = ws;
                console.log(`Viewer (Control) connected for: ${currentId}`);
            }
            // 4. Control Commands Forwarding (MOVE, LCLICK, KEY)
            else if (role === 'viewer_control' && currentId) {
                const room = rooms.get(currentId);
                if (room && room.hostWs && room.hostWs.readyState === WebSocket.OPEN) {
                    console.log(`Forwarding to Host ${currentId}: ${msg}`); // Debugging
                    room.hostWs.send(message);
                } else {
                    console.log(`Cannot forward. Host WS not open for ${currentId}`); // Debugging
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
            if (role === 'host') {
                rooms.delete(currentId);
                console.log(`Host Disconnected: ${currentId}`);
            }
            else if (role === 'viewer') room.viewerWs = null;
            else if (role === 'viewer_control') room.viewerControlWs = null;
        }
    });
});
