Product Requirements Document (PRD)
Project: Music Companion — AI Cover Art + AI Listening Companion

---

## 1. Overview

Music Companion is a dual-track project combining **AI Live Cover Art** and an **AI Listening Companion** into one experience.

**Track A — AI Live Cover Art Mirror**
A real-time visual system that turns music playback into living, responsive cover art. A stylized avatar reacts to music embeddings and mirrors the user's face/hand movements through webcam tracking. A "smart mirror" that feels alive — half music visualization, half expressive digital self.

**Track B — AI Listening Companion**
An AI companion you can listen to music with. It understands the music playing (via embeddings of tempo, energy, mood, genre, instrumentation), retains face-tracking context of the user (emotional state, engagement, attention), and can converse about the music. You can ask it to play songs, explain what's happening musically, recommend similar tracks, or just vibe together.

The two tracks share core infrastructure: music embedding pipeline, face tracking, and avatar rendering.

---

## 2. Problem Statement Alignment

Primary alignment:
**Statement One** — Novel, interactive, and personalized music experiences using Google AI.

Why it fits:
- Music embeddings directly drive both avatar behavior and companion understanding
- Face tracking personalizes the experience (mirror mode) AND gives the companion emotional context
- The companion creates a conversational, social layer on top of music
- Visual output is dynamic and tightly coupled to the audio

---

## 3. Target User

- Hackathon judges / demo viewers
- Music listeners who want a social, interactive experience
- Streamers or artists interested in animated visuals
- Anyone who wants an AI that "gets" the music they're listening to

---

## 4. Core User Experience

### Track A — Cover Art Mirror
1. User opens the app and selects or plays a song
2. Webcam activates — face tracking (head pose, expression) + hand tracking
3. On-screen avatar mirrors user motion at low latency, auto-animates to music
4. AI director (Gemini) nudges avatar behavior based on music + avatar state
5. Result: living cover art, not a literal puppet

### Track B — Listening Companion
1. User plays music (or asks companion to play something)
2. System continuously embeds the audio — extracting tempo, energy, mood, instrumentation, genre
3. Face tracking provides user emotional context (are they vibing? distracted? sad?)
4. Companion can:
   - Chat about the current song ("this bridge modulates to a minor key — love that")
   - Respond to user mood ("you seem chill, want me to keep this vibe going?")
   - Take requests ("play something upbeat" / "play that song from yesterday")
   - Explain musical elements in plain language
   - Build and manage playlists based on conversation + mood
5. Companion retains session context — remembers what you listened to, how you reacted

---

## 5. Functional Requirements

### 5.1 Avatar Rendering (Track A)
- Prebuilt 3D avatar (VRM/GLTF)
- Rendered in browser via Three.js
- Supports: idle loops, canned expressive poses, blendable motion layers

### 5.2 Music Embedding Pipeline (Shared)
- Extract music embeddings from playing audio in real-time
- Features: tempo, energy, mood, spectral characteristics, beat positions
- Embeddings updated at coarse interval (1–2s)
- **Track A mapping**: animation intensity, pose selection, expression bias
- **Track B mapping**: semantic understanding passed to companion LLM as context
- Tech options: chromaprint/essentia for audio features, Gemini for semantic music understanding

### 5.3 User Motion Capture / Face Tracking (Shared)
- Webcam-based tracking only (no external hardware)
- Face: head orientation, expression proxy (mouth, smile, brow)
- Hands: position + simple gestures
- **Track A**: motion data drives direct avatar control
- **Track B**: emotional state summary sent to companion as context
  - e.g. "user is smiling, nodding to the beat" or "user looks away, disengaged"

### 5.4 AI Director Layer — Gemini (Track A)
- Asynchronous, not in the real-time loop
- Input: music embedding summary + avatar state summary
- Output: high-level commands ("switch to relaxed pose set", "increase expressiveness")
- Implemented via API calls, not continuous streaming

### 5.5 AI Companion Layer — Gemini (Track B)
- Conversational interface (text and/or voice)
- Context window includes:
  - Current music embedding summary
  - Recent listening history (songs, timestamps)
  - User emotional state from face tracking
  - Conversation history
- Capabilities:
  - Music playback control ("play", "skip", "queue")
  - Music understanding ("what key is this in?", "why does this part feel tense?")
  - Mood-aware recommendations
  - Memory across session (what user liked, skipped, reacted to)
- Gemini API with function calling for playback control + embedding retrieval

### 5.6 System Architecture

```
┌─────────────────────────────────────────────────┐
│                   Browser Client                 │
│                                                  │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐ │
│  │ Webcam   │  │ Audio     │  │ Three.js     │ │
│  │ Face/Hand│  │ Capture   │  │ Avatar       │ │
│  │ Tracking │  │ & Playback│  │ Renderer     │ │
│  └────┬─────┘  └─────┬─────┘  └──────▲───────┘ │
│       │               │               │         │
│       ▼               ▼               │         │
│  ┌─────────┐   ┌───────────┐   ┌─────┴──────┐  │
│  │ User    │   │ Music     │   │ Animation  │  │
│  │ State   │   │ Embedding │   │ Controller │  │
│  │ Summary │   │ Pipeline  │   └─────▲──────┘  │
│  └────┬────┘   └─────┬─────┘         │         │
│       │               │               │         │
└───────┼───────────────┼───────────────┼─────────┘
        │               │               │
        ▼               ▼               │
   ┌─────────────────────────────┐      │
   │        Backend Server       │      │
   │                             │      │
   │  ┌─────────┐ ┌──────────┐  │      │
   │  │ Track A │ │ Track B  │  │      │
   │  │ Gemini  │ │ Gemini   │  │      │
   │  │ Director│ │ Companion│  │      │
   │  └────┬────┘ └────┬─────┘  │      │
   │       │            │        │      │
   └───────┼────────────┼────────┘      │
           │            │               │
           └────────────┴───────────────┘
              avatar commands +
              playback control
```

---

## 6. Folder Structure

```
musiccompanion/
├── cover.md                 # This PRD
├── README.md
├── avatars/                 # Avatar assets
├── facetrack/               # Face/hand tracking (shared)
├── music_embedding/         # Audio embedding pipeline (shared)
│   ├── embedder.py          # Core embedding extraction
│   ├── realtime_capture.py  # Capture audio and embed in real-time
│   └── requirements.txt
├── vendor/
│   └── riko_project/        # Gemini web chat + VRM avatar
```
