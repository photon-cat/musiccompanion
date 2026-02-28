"""
Gemini Live Native Audio - Bidirectional Voice Chat Server
Proxies browser WebSocket <-> Gemini Live API WebSocket
"""

import asyncio
import json
import os
import sys

import aiohttp
from aiohttp import web
import websockets

API_KEY = os.environ.get("VITE_GEMINI_API_KEY", os.environ.get("GEMINI_API_KEY", ""))
GEMINI_WS_URL = (
    "wss://generativelanguage.googleapis.com/ws/"
    "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
    f"?key={API_KEY}"
)
MODEL = "models/gemini-2.5-flash-native-audio-latest"
DEFAULT_VOICE = "Leda"

STATIC_DIR = os.path.dirname(os.path.abspath(__file__))


async def index_handler(request):
    return web.FileResponse(os.path.join(STATIC_DIR, "index.html"))


async def websocket_handler(request):
    browser_ws = web.WebSocketResponse()
    await browser_ws.prepare(request)
    print("[server] Browser connected")

    gemini_ws = None
    try:
        # Wait for voice selection from browser before setting up Gemini
        voice_name = DEFAULT_VOICE
        init_msg = await browser_ws.receive()
        if init_msg.type == aiohttp.WSMsgType.TEXT:
            data = json.loads(init_msg.data)
            if data.get("type") == "set_voice":
                voice_name = data.get("voice", DEFAULT_VOICE)
        print(f"[server] Using voice: {voice_name}")

        gemini_ws = await websockets.connect(GEMINI_WS_URL, max_size=None)
        print("[server] Connected to Gemini Live API")

        setup_msg = {
            "setup": {
                "model": MODEL,
                "generation_config": {
                    "response_modalities": ["AUDIO"],
                    "speech_config": {
                        "voice_config": {
                            "prebuilt_voice_config": {"voice_name": voice_name}
                        }
                    },
                },
            }
        }
        await gemini_ws.send(json.dumps(setup_msg))
        await gemini_ws.recv()
        print("[server] Gemini setup complete")
        await browser_ws.send_json({"type": "ready"})

        async def browser_to_gemini():
            try:
                async for msg in browser_ws:
                    if msg.type == aiohttp.WSMsgType.TEXT:
                        data = json.loads(msg.data)
                        if data.get("type") == "audio":
                            gemini_msg = {
                                "realtime_input": {
                                    "media_chunks": [
                                        {
                                            "mime_type": "audio/pcm;rate=16000",
                                            "data": data["data"],
                                        }
                                    ]
                                }
                            }
                            await gemini_ws.send(json.dumps(gemini_msg))
                        elif data.get("type") == "text":
                            gemini_msg = {
                                "client_content": {
                                    "turns": [
                                        {"role": "user", "parts": [{"text": data["text"]}]}
                                    ],
                                    "turn_complete": True,
                                }
                            }
                            await gemini_ws.send(json.dumps(gemini_msg))
                    elif msg.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.ERROR):
                        break
            except Exception as e:
                print(f"[server] browser->gemini error: {e}")

        async def gemini_to_browser():
            try:
                async for message in gemini_ws:
                    resp = json.loads(message if isinstance(message, str) else message.decode())

                    server_content = resp.get("serverContent", {})
                    model_turn = server_content.get("modelTurn", {})
                    parts = model_turn.get("parts", [])

                    for part in parts:
                        if "inlineData" in part:
                            await browser_ws.send_json({
                                "type": "audio",
                                "data": part["inlineData"]["data"],
                            })

                    if server_content.get("turnComplete"):
                        await browser_ws.send_json({"type": "turn_complete"})

            except websockets.ConnectionClosed:
                print("[server] Gemini connection closed")
            except Exception as e:
                print(f"[server] gemini->browser error: {e}")

        await asyncio.gather(browser_to_gemini(), gemini_to_browser())

    except Exception as e:
        print(f"[server] Error: {e}")
        if not browser_ws.closed:
            await browser_ws.send_json({"type": "error", "message": str(e)})
    finally:
        if gemini_ws and not gemini_ws.closed:
            await gemini_ws.close()
        print("[server] Session ended")

    return browser_ws


def main():
    if not API_KEY:
        print("ERROR: Set VITE_GEMINI_API_KEY or GEMINI_API_KEY environment variable")
        sys.exit(1)

    app = web.Application()
    app.router.add_get("/", index_handler)
    app.router.add_get("/ws", websocket_handler)

    port = int(os.environ.get("PORT", 8765))
    print(f"Starting voice chat server on http://localhost:{port}")
    web.run_app(app, host="0.0.0.0", port=port)


if __name__ == "__main__":
    main()
