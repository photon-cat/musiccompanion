"""
Test server: HTTP on 8080, WebSocket on 8765.
Tests the browser face tracker without Blender.
"""
import asyncio
import json
import http.server
import socketserver
import threading
import os

# Ensure websockets is available
try:
    import websockets
except ImportError:
    import subprocess, sys
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'websockets'])
    import websockets

DIR = os.path.dirname(os.path.abspath(__file__))

# --- HTTP Server (port 8080) ---
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)
    def log_message(self, format, *args):
        pass  # Silence HTTP logs

def run_http():
    with socketserver.TCPServer(("127.0.0.1", 8080), Handler) as httpd:
        print("[HTTP] Serving http://localhost:8080/index.html")
        httpd.serve_forever()

# --- WebSocket Server (port 8765) ---
async def ws_handler(websocket):
    print("[WS] Browser connected!")
    count = 0
    try:
        async for message in websocket:
            data = json.loads(message)
            count += 1
            if count % 30 == 0:
                h = data.get('head', {})
                print(f"  pitch:{h.get('pitch',0):.2f} yaw:{h.get('yaw',0):.2f} "
                      f"mouth:{data.get('mouth_open',0):.2f} smile:{data.get('smile',0):.2f}")
    except websockets.exceptions.ConnectionClosed:
        print("[WS] Browser disconnected")

async def run_ws():
    async with websockets.serve(ws_handler, "127.0.0.1", 8765):
        print("[WS] WebSocket server on ws://localhost:8765")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    # HTTP in background thread
    t = threading.Thread(target=run_http, daemon=True)
    t.start()
    # WebSocket in main thread
    print("Test server starting...")
    asyncio.run(run_ws())
