import yaml
import json
import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import google.generativeai as genai

# Load config relative to project root
CONFIG_PATH = Path(__file__).resolve().parent.parent / "character_config.yaml"

with open(CONFIG_PATH, "r") as f:
    char_config = yaml.safe_load(f)

# Configure Gemini
GEMINI_API_KEY = os.environ.get("VITE_GEMINI_API_KEY", "")
genai.configure(api_key=GEMINI_API_KEY)

MODEL = "gemini-2.5-flash"
HISTORY_FILE = Path(__file__).resolve().parent.parent / char_config["history_file"]
SYSTEM_PROMPT = char_config["presets"]["default"]["system_prompt"]

app = FastAPI()

STATIC_DIR = Path(__file__).resolve().parent / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


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
    )

    chat_session = model.start_chat(history=gemini_history)
    response = chat_session.send_message(user_input)
    reply = response.text

    # Save in simple format
    history.append({"role": "user", "text": user_input})
    history.append({"role": "model", "text": reply})
    save_history(history)

    return {"reply": reply}


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


@app.get("/", response_class=HTMLResponse)
async def index():
    html_path = Path(__file__).resolve().parent / "static" / "index.html"
    return html_path.read_text()
