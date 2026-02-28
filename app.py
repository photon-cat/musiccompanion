import yaml
import json
import os
import asyncio
from pathlib import Path
from dotenv import load_dotenv

# Load .env before anything reads env vars
load_dotenv(Path(__file__).resolve().parent / ".env", override=True)

# Also set GOOGLE_API_KEY which genai reads natively
if os.environ.get("VITE_GEMINI_API_KEY") and not os.environ.get("GOOGLE_API_KEY"):
    os.environ["GOOGLE_API_KEY"] = os.environ["VITE_GEMINI_API_KEY"]

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import google.generativeai as genai
import websockets

# Load config relative to project root
CONFIG_PATH = Path(__file__).resolve().parent / "character_config.yaml"

with open(CONFIG_PATH, "r") as f:
    char_config = yaml.safe_load(f)

# Configure Gemini
GEMINI_API_KEY = os.environ.get("VITE_GEMINI_API_KEY", "")
genai.configure(api_key=GEMINI_API_KEY)

MODEL = "gemini-2.5-flash"
VOICE_MODEL = "models/gemini-2.5-flash-native-audio-latest"
GEMINI_WS_URL = (
    "wss://generativelanguage.googleapis.com/ws/"
    "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
    f"?key={GEMINI_API_KEY}"
)
DEFAULT_VOICE = "Leda"

HISTORY_FILE = Path(__file__).resolve().parent / char_config["history_file"]
SYSTEM_PROMPT = char_config["presets"]["default"]["system_prompt"]

app = FastAPI()

STATIC_DIR = Path(__file__).resolve().parent / "static"
PUBLIC_DIR = Path(__file__).resolve().parent / "public"
MUSIC_DIR = PUBLIC_DIR / "music"


# --- Avatar tool definitions for Gemini function calling ---

AVATAR_TOOLS = [
    genai.protos.Tool(function_declarations=[
        genai.protos.FunctionDeclaration(
            name="play_animation",
            description=(
                "Move your avatar body. Use this constantly to express yourself physically. "
                "Combine with set_expression for full emotional range."
            ),
            parameters=genai.protos.Schema(
                type=genai.protos.Type.OBJECT,
                properties={
                    "animation": genai.protos.Schema(
                        type=genai.protos.Type.STRING,
                        description=(
                            "Which animation to play. Use these friendly names: "
                            "'wave' (greet/hello), 'show_off' (confident pose), "
                            "'peace' (peace sign), 'finger_guns' (playful), "
                            "'spin' (excited spin/dance), 'pose' (cool pose), "
                            "'squat' (funny squat), 'entrance' (dramatic appear), "
                            "'sway' (gentle idle sway), 'heart' (love reaction), "
                            "'idle' (default standing)"
                        ),
                    ),
                },
                required=["animation"],
            ),
        ),
        genai.protos.FunctionDeclaration(
            name="set_expression",
            description=(
                "Change your avatar's facial expression to show emotion. "
                "Use alongside play_animation for richer reactions. "
                "Call this in almost every response — you should always be emoting."
            ),
            parameters=genai.protos.Schema(
                type=genai.protos.Type.OBJECT,
                properties={
                    "expression": genai.protos.Schema(
                        type=genai.protos.Type.STRING,
                        description=(
                            "Expression: 'happy' (smiling), 'sad' (melancholy), "
                            "'angry' (rare, dramatic emphasis), 'surprised' (wide-eyed), "
                            "'relaxed' (calm/serene), 'neutral' (resets face)"
                        ),
                    ),
                    "intensity": genai.protos.Schema(
                        type=genai.protos.Type.NUMBER,
                        description=(
                            "Strength from 0.0 (subtle) to 1.0 (full). "
                            "Use 0.6 for natural, 0.8-1.0 for big reactions."
                        ),
                    ),
                },
                required=["expression"],
            ),
        ),
        genai.protos.FunctionDeclaration(
            name="play_music",
            description=(
                "Start a music session. A player UI appears with play/pause and scrubber. "
                "Your avatar automatically dances to the beat — choreographed to the song's BPM, "
                "energy, and mood. Your expressions shift with the music. "
                "Just play it when the user asks, don't make them confirm."
            ),
            parameters=genai.protos.Schema(
                type=genai.protos.Type.OBJECT,
                properties={
                    "song": genai.protos.Schema(
                        type=genai.protos.Type.STRING,
                        description="Song name. Available: 'faded' (Alan Walker - Faded)",
                    ),
                },
                required=["song"],
            ),
        ),
    ])
]


class ChatMessage(BaseModel):
    message: str


def load_history():
    if HISTORY_FILE.exists():
        with open(HISTORY_FILE, "r") as f:
            return json.load(f)
    return []


def save_history(history):
    with open(HISTORY_FILE, "w") as f:
        json.dump(history, f, indent=2)


ANIM_ALIASES = {
    "wave": "VRMA_02",
    "greet": "VRMA_02",
    "show": "VRMA_01",
    "show_off": "VRMA_01",
    "peace": "VRMA_03",
    "peace_sign": "VRMA_03",
    "finger_guns": "VRMA_04",
    "shoot": "VRMA_04",
    "spin": "VRMA_05",
    "pose": "VRMA_06",
    "cool_pose": "VRMA_06",
    "squat": "VRMA_07",
    "dance": "VRMA_05",
    "idle": "idle_loop",
    "wait": "waiting",
    "sway": "waiting",
    "appear": "appearing",
    "entrance": "appearing",
    "heart": "liked",
    "like": "liked",
}


def resolve_tool_call(fn_name, fn_args):
    """Process a tool call and return the result + action for the frontend."""
    if fn_name == "play_animation":
        anim = fn_args.get("animation", "idle_loop")
        anim = ANIM_ALIASES.get(anim.lower().replace(" ", "_"), anim)
        return {
            "result": f"Playing animation: {anim}",
            "action": {"type": "play_animation", "animation": anim},
        }
    elif fn_name == "set_expression":
        expr = fn_args.get("expression", "neutral")
        intensity = fn_args.get("intensity", 0.6)
        return {
            "result": f"Set expression to {expr} at intensity {intensity}",
            "action": {"type": "set_expression", "expression": expr, "intensity": intensity},
        }
    elif fn_name == "play_music":
        song = fn_args.get("song", "faded")
        return {
            "result": f"Starting music session: {song}",
            "action": {"type": "play_music", "song": song},
        }
    return {"result": "Unknown tool", "action": None}


@app.post("/api/chat")
async def chat(body: ChatMessage):
    user_input = body.message
    if not user_input.strip():
        return JSONResponse({"error": "Empty message"}, status_code=400)

    history = load_history()

    # Build Gemini conversation history
    gemini_history = []
    for m in history:
        gemini_history.append({
            "role": m["role"],
            "parts": [m["text"]]
        })

    model = genai.GenerativeModel(
        model_name=MODEL,
        system_instruction=SYSTEM_PROMPT,
        tools=AVATAR_TOOLS,
    )

    chat_session = model.start_chat(history=gemini_history)

    actions = []
    reply_text = ""

    def extract_parts(response):
        """Extract text and function calls from a Gemini response."""
        texts = []
        fn_calls = []
        for candidate in response.candidates:
            for part in candidate.content.parts:
                # Check for text
                if hasattr(part, 'text') and part.text:
                    texts.append(part.text)
                # Check for function call
                if hasattr(part, 'function_call') and part.function_call.name:
                    fn_name = part.function_call.name
                    fn_args = dict(part.function_call.args) if part.function_call.args else {}
                    fn_calls.append((fn_name, fn_args))
        return texts, fn_calls

    try:
        response = chat_session.send_message(user_input)
        print(f"[chat] user: {user_input!r}", flush=True)

        # Handle function calls in a loop (Gemini may chain multiple)
        max_rounds = 5
        for round_num in range(max_rounds):
            texts, function_calls = extract_parts(response)

            for t in texts:
                reply_text += (" " + t if reply_text else t)
                print(f"[chat] text: {t[:100]!r}", flush=True)

            for fn_name, fn_args in function_calls:
                print(f"[chat] tool: {fn_name}({fn_args})", flush=True)

            if not function_calls:
                break

            # Process all function calls and send results back together
            result_parts = []
            for fn_name, fn_args in function_calls:
                tool_result = resolve_tool_call(fn_name, fn_args)
                if tool_result["action"]:
                    actions.append(tool_result["action"])
                result_parts.append(
                    genai.protos.Part(function_response=genai.protos.FunctionResponse(
                        name=fn_name,
                        response={"result": tool_result["result"]},
                    ))
                )

            response = chat_session.send_message(
                genai.protos.Content(parts=result_parts)
            )

        # After the loop, extract any remaining text from the final response
        # (only if we broke out of the loop after tool calls)
        if function_calls:
            final_texts, _ = extract_parts(response)
            for t in final_texts:
                if t not in reply_text:
                    reply_text += (" " + t if reply_text else t)
                    print(f"[chat] final-text: {t[:100]!r}", flush=True)

    except Exception as e:
        print(f"[chat] ERROR: {type(e).__name__}: {e}", flush=True)
        import traceback
        traceback.print_exc()
        if not reply_text:
            reply_text = "Sorry, I had a little glitch. Try again?"

    reply_text = reply_text.strip()

    # Save history (just the text parts)
    history.append({"role": "user", "text": user_input})
    if reply_text:
        history.append({"role": "model", "text": reply_text})
    save_history(history)

    return {
        "reply": reply_text,
        "actions": actions,
    }


@app.post("/api/clear")
async def clear_history():
    if HISTORY_FILE.exists():
        HISTORY_FILE.unlink()
    return {"status": "ok"}


@app.get("/api/history")
async def get_history():
    history = load_history()
    chat_messages = []
    for m in history:
        role = "assistant" if m["role"] == "model" else m["role"]
        chat_messages.append({"role": role, "text": m["text"]})
    return {"messages": chat_messages}


@app.get("/api/music/scripts")
async def list_music_scripts():
    """List available pre-processed music scripts."""
    if not MUSIC_DIR.exists():
        return {"scripts": []}
    scripts = []
    for f in sorted(MUSIC_DIR.glob("*_script.json")):
        name = f.stem.replace("_script", "")
        audio_file = None
        for ext in [".mp3", ".ogg", ".wav"]:
            candidate = MUSIC_DIR / (name + ext)
            if candidate.exists():
                audio_file = f"/music/{name}{ext}"
                break
        scripts.append({
            "name": name.replace("_", " ").title(),
            "script_url": f"/music/{f.name}",
            "audio_url": audio_file,
        })
    return {"scripts": scripts}


# --- Voice WebSocket proxy (Gemini Live API) ---

@app.websocket("/ws/voice")
async def voice_websocket(websocket: WebSocket):
    await websocket.accept()
    print("[voice] Browser connected")

    gemini_ws = None
    try:
        voice_name = DEFAULT_VOICE
        init_data = await websocket.receive_json()
        if init_data.get("type") == "set_voice":
            voice_name = init_data.get("voice", DEFAULT_VOICE)
        print(f"[voice] Using voice: {voice_name}")

        gemini_ws = await websockets.connect(GEMINI_WS_URL, max_size=None)
        print("[voice] Connected to Gemini Live API")

        setup_msg = {
            "setup": {
                "model": VOICE_MODEL,
                "generation_config": {
                    "response_modalities": ["AUDIO"],
                    "speech_config": {
                        "voice_config": {
                            "prebuilt_voice_config": {"voice_name": voice_name}
                        }
                    },
                },
                "system_instruction": {
                    "parts": [{"text": SYSTEM_PROMPT}]
                },
            }
        }
        await gemini_ws.send(json.dumps(setup_msg))
        await gemini_ws.recv()
        print("[voice] Gemini setup complete")
        await websocket.send_json({"type": "ready"})

        async def browser_to_gemini():
            try:
                while True:
                    data = await websocket.receive_json()
                    if data.get("type") == "audio":
                        gemini_msg = {
                            "realtime_input": {
                                "media_chunks": [{
                                    "mime_type": "audio/pcm;rate=16000",
                                    "data": data["data"],
                                }]
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
            except WebSocketDisconnect:
                pass
            except Exception as e:
                print(f"[voice] browser->gemini error: {e}")

        async def gemini_to_browser():
            try:
                async for message in gemini_ws:
                    resp = json.loads(message if isinstance(message, str) else message.decode())
                    server_content = resp.get("serverContent", {})
                    model_turn = server_content.get("modelTurn", {})
                    parts = model_turn.get("parts", [])

                    for part in parts:
                        if "inlineData" in part:
                            await websocket.send_json({
                                "type": "audio",
                                "data": part["inlineData"]["data"],
                            })

                    if server_content.get("turnComplete"):
                        await websocket.send_json({"type": "turn_complete"})

            except websockets.ConnectionClosed:
                print("[voice] Gemini connection closed")
            except Exception as e:
                print(f"[voice] gemini->browser error: {e}")

        await asyncio.gather(browser_to_gemini(), gemini_to_browser())

    except WebSocketDisconnect:
        print("[voice] Browser disconnected")
    except Exception as e:
        print(f"[voice] Error: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        if gemini_ws and gemini_ws.close_code is None:
            await gemini_ws.close()
        print("[voice] Session ended")


@app.get("/", response_class=HTMLResponse)
async def index():
    html_path = Path(__file__).resolve().parent / "static" / "index.html"
    return html_path.read_text()


# Mount static AFTER all routes so /api/* and /ws/* are matched first
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
