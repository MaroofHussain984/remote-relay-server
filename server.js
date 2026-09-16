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

            if (msg.startsWith('REG:')) {
                const parts = msg.split(':');
                currentId = parts[1];
                role = 'host';
                if (!rooms.has(currentId)) rooms.set(currentId, {});
                rooms.get(currentId).hostWs = ws;
                rooms.get(currentId).password = parts[2];
                console.log(`Host Registered: ${currentId}`);
            }
            else if (msg.startsWith('HOST_CTRL:')) {
                const parts = msg.split(':');
                currentId = parts[1];
                role = 'host_control';
                if (!rooms.has(currentId)) rooms.set(currentId, {});
                rooms.get(currentId).hostControlWs = ws;
                console.log(`Host Control Connected: ${currentId}`);
            }
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
                    } else { ws.send('WRONG_PASSWORD'); }
                } else { ws.send('OFFLINE'); }
            }
            else if (msg.startsWith('VIEWER:')) {
                const parts = msg.split(':');
                currentId = parts[1];
                role = 'viewer_control';
                if (!rooms.has(currentId)) rooms.set(currentId, {});
                rooms.get(currentId).viewerControlWs = ws;
                console.log(`Viewer (Control) connected for: ${currentId}`);
            }
            // Control Commands Forwarding (Mouse/Keyboard/FileStart/FileEnd)
            else if (role === 'viewer_control' && currentId) {
                const room = rooms.get(currentId);
                if (room && room.hostControlWs && room.hostControlWs.readyState === WebSocket.OPEN) {
                    room.hostControlWs.send(message);
                }
            }
            else if (role === 'host_control' && currentId) {
                const room = rooms.get(currentId);
                if (room && room.viewerControlWs && room.viewerControlWs.readyState === WebSocket.OPEN) {
                    room.viewerControlWs.send(message);
                }
            }
        } else {
            // NAYA: Binary Data Relay (Files aur Screen Frames)
            if (role === 'host' && currentId) {
                // Screen Frames from Host to Viewer
                const room = rooms.get(currentId);
                if (room && room.viewerWs && room.viewerWs.readyState === WebSocket.OPEN) {
                    room.viewerWs.send(message, { binary: true });
                }
            }
            else if (role === 'host_control' && currentId) {
                // File data from Host to Viewer
                const room = rooms.get(currentId);
                if (room && room.viewerControlWs && room.viewerControlWs.readyState === WebSocket.OPEN) {
                    room.viewerControlWs.send(message, { binary: true });
                }
            }
            else if (role === 'viewer_control' && currentId) {
                // File data from Viewer to Host
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
        }
    });
});
