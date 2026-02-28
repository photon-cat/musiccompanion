import { createServer } from 'http';
import { readFileSync } from 'fs';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

// HTTP server on 8080
const http = createServer((req, res) => {
  const file = req.url === '/' || req.url === '/index.html' ? 'index.html' : req.url.slice(1);
  try {
    const data = readFileSync(join(__dir, file));
    const ext = file.split('.').pop();
    const types = { html: 'text/html', js: 'application/javascript', css: 'text/css' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});
http.listen(8080, () => console.log('[HTTP] http://localhost:8080'));

// WebSocket server on 8765
const wss = new WebSocketServer({ port: 8765 });
wss.on('listening', () => console.log('[WS] ws://localhost:8765'));
let count = 0;
wss.on('connection', (ws) => {
  console.log('[WS] Browser connected!');
  ws.on('message', (msg) => {
    count++;
    if (count % 30 === 0) {
      const d = JSON.parse(msg);
      const h = d.head || {};
      console.log(`  pitch:${h.pitch?.toFixed(2)} yaw:${h.yaw?.toFixed(2)} mouth:${d.mouth_open?.toFixed(2)}`);
    }
  });
  ws.on('close', () => console.log('[WS] Disconnected'));
});
