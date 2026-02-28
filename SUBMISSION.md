# Aria — Your AI Music Companion

## Team
**photoncats**
- Jacob Armstrong (@photoncat)

## What is Aria?

Aria is a music-reactive AI companion that vibes with both you and your music. She's a 3D avatar that listens to your music, watches your face, and reacts in real-time with dancing, emoting, chatting about what you're hearing.

**Core loop:**
- Drop a song → we run it through librosa to extract a full embedding timeline — BPM, energy (RMS), spectral centroid, chroma vectors, onset strength, valence proxy — chunked every 4 seconds. That embedding gets fed to Gemini 2.5 Flash which generates a timestamped choreography script: pose, intensity, expression, head bob, sway, eye state for each chunk. The browser plays these directives in sync with the music.
- During conversation, Gemini uses function calling (`play_animation`, `set_expression`) to trigger avatar reactions on the fly — she'll wave, dance, or change expression mid-sentence as tool calls.
- Webcam tracks your face via MediaPipe so she mirrors your energy — match your expressions, wink back, respond to your mood.
- Chat or voice-talk about the music — she actually understands what's playing because she has the full embedding context.

## Tech Stack

- **Gemini 2.5 Flash** (`gemini-2.5-flash`) — powers Aria's brain: chat, music understanding, avatar choreography generation
- **Gemini Native Audio** (`gemini-2.5-flash-native-audio-latest`) — real-time voice conversations via Gemini Live API
- **FastAPI** — backend server with WebSocket for real-time sync
- **Three.js + VRM** — 3D avatar rendering with blendshape expressions
- **MediaPipe** — browser-based face/hand tracking
- **Librosa** — audio feature extraction (BPM, energy, spectral analysis, mood)
- **YouTube Data API + yt-dlp** — song search and audio extraction, play anything

## Partner Technologies

| Tech | Used? | Notes |
|------|-------|-------|
| **Google (Gemini)** | Yes | The whole brain. `gemini-2.5-flash` for chat + directive generation, `gemini-2.5-flash-native-audio-latest` for real-time voice. Function calling drives avatar animations mid-conversation. |
| **LlamaIndex** | No | Didn't get to it this time — Gemini's native function calling handled our tool use needs. |
| **Agno** | No | Same deal — went direct with Gemini APIs. |
| **Antigravity** | No | i like tuis, gem 3.1 in opencode if we going gem |

## Links

- **GitHub:** https://github.com/photon-cat/musiccompanion
- **Demo Video:** *TBD*

## Feedback for CV

We went deep on Gemini — the voice API is genuinely impressive for real-time companion vibes. Being able to have Aria *talk* about the music while she's dancing to it? Chef's kiss. The function calling for triggering avatar animations mid-conversation just works. Good hackathon, would hack again.

Re Antigravity — i like tuis, gem 3.1 in opencode if we going gem.
