const WebSocket = require('ws');
const PORT = process.env.PORT || 10000;

const rooms = new Map(); // ID -> { hostWs, hostControlWs, password, viewerWs, viewerControlWs }

const wss = new WebSocket.Server({ port: PORT }, () => {
    console.log(`WebSocket Relay Server running on port ${PORT}`);
});

wss.on('connection', (ws) => {
    let currentId = null;
    let role = null; // 'host', 'host_control', 'viewer', 'viewer_control'

    ws.on('message', (message, isBinary) => {
        if (!isBinary) {
            const msg = message.toString().trim();
            console.log(`[Server Received]: ${msg}`);

            // 1. Host Registration (Sharer ki Video)
            if (msg.startsWith('REG:')) {
                const parts = msg.split(':');
                currentId = parts[1];
                role = 'host';
                if (!rooms.has(currentId)) rooms.set(currentId, {});
                rooms.get(currentId).hostWs = ws;
                rooms.get(currentId).password = parts[2];
                console.log(`Host Registered: ${currentId}`);
            }
            // 2. Host Control Registration (Sharer ke Mouse/Keyboard/File)
            else if (msg.startsWith('HOST_CTRL:')) {
                const parts = msg.split(':');
                currentId = parts[1];
                role = 'host_control';
                if (!rooms.has(currentId)) rooms.set(currentId, {});
                rooms.get(currentId).hostControlWs = ws;
                console.log(`Host Control Connected: ${currentId}`);
            }
            // 3. Viewer Video Stream Connection
            else if (msg.startsWith('CONNECT:')) {
                const parts = msg.split(':');
                const targetId = parts[1];
                role = 'viewer';
                currentId = targetId;
                const room = rooms.get(targetId);
                if (room && room.hostWs && room.hostWs.readyState === WebSocket.OPEN) {
                    if (room.password === parts[2]) {
                        room.viewerWs = ws;
                        ws.send('OK');
                        room.hostWs.send('START_STREAM');
                        console.log(`Viewer (Video) connected to host ${targetId}`);
                    } else { ws.send('WRONG_PASSWORD'); }
                } else { ws.send('OFFLINE'); }
            }
            // 4. Viewer Control Connection
            else if (msg.startsWith('VIEWER:')) {
                const parts = msg.split(':');
                currentId = parts[1];
                role = 'viewer_control';
                if (!rooms.has(currentId)) rooms.set(currentId, {});
                rooms.get(currentId).viewerControlWs = ws;
                console.log(`Viewer (Control) connected for: ${currentId}`);
            }
            // 5. Text Commands Forwarding (READY, FILE_START, FILE_END)
            else if (role === 'viewer_control' && currentId) {
                const room = rooms.get(currentId);
                if (room && room.hostControlWs && room.hostControlWs.readyState === WebSocket.OPEN) {
                    room.hostControlWs.send(message.toString()); 
                    console.log(`Forwarded to Host Control: ${currentId}`);
                } else {
                    if (room && room.viewerControlWs) {
                        room.viewerControlWs.send("ERROR:HOST_OFFLINE");
                    }
                    console.log(`Cannot forward to Host: ${currentId}`);
                }
            }
            else if (role === 'host_control' && currentId) {
                const room = rooms.get(currentId);
                if (room && room.viewerControlWs && room.viewerControlWs.readyState === WebSocket.OPEN) {
                    room.viewerControlWs.send(message.toString()); 
                    console.log(`Forwarded to Viewer Control: ${currentId}`);
                } else {
                    if (room && room.hostControlWs) {
                        room.hostControlWs.send("ERROR:VIEWER_OFFLINE");
                    }
                    console.log(`Cannot forward to Viewer: ${currentId}`);
                }
            }
        } else {
            // Binary Data Relay (Screen Frames & File Chunks)
            if (role === 'host' && currentId) {
                const room = rooms.get(currentId);
                if (room && room.viewerWs && room.viewerWs.readyState === WebSocket.OPEN) {
                    room.viewerWs.send(message, { binary: true });
                }
            }
            else if (role === 'host_control' && currentId) {
                const room = rooms.get(currentId);
                if (room && room.viewerControlWs && room.viewerControlWs.readyState === WebSocket.OPEN) {
                    room.viewerControlWs.send(message, { binary: true });
                }
            }
            else if (role === 'viewer_control' && currentId) {
                const room = rooms.get(currentId);
                if (room && room.hostControlWs && room.hostControlWs.readyState === WebSocket.OPEN) {
                    room.hostControlWs.send(message, { binary: true });
                }
            }
        }
    });

    ws.on('close', () => {
        if (currentId && rooms.has(currentId)) {
            const room = rooms.get(currentId);
            if (role === 'host') rooms.delete(currentId);
            else if (role === 'viewer') room.viewerWs = null;
            else if (role === 'viewer_control') room.viewerControlWs = null;
            else if (role === 'host_control') room.hostControlWs = null;
            console.log(`Connection closed for ${role}: ${currentId}`);
        }
    });
});
