cover art thing 
Product Requirements Document (PRD)
Project: AI Live Cover Art Mirror
1. Overview

AI Live Cover Art Mirror is a real-time, interactive visual system that turns music playback into a living, responsive cover-art experience.
A stylized avatar (e.g., anime-style) reacts to music embeddings and mirrors the user’s face and hand movements through webcam-based tracking. The result is a “smart mirror” that feels alive—half music visualization, half expressive digital self.

The system prioritizes wow-factor, immediacy, and visual coherence, not perfect motion capture fidelity.

2. Problem Statement Alignment


Primary alignment:

Statement One – Novel, interactive, and personalized music experiences using Google AI.

Why it fits well:

Music embeddings directly drive avatar behavior.

User interaction (face + hands) personalizes the experience.

Visual output is dynamic and tightly coupled to the audio.

3. Target User

Hackathon judges / demo viewers

Music creators and listeners

Streamers or artists interested in animated visuals

Anyone who wants music to “look back” at them

4. Core User Experience

User opens the app and selects or plays a song.

Webcam activates:

Face tracking (head pose, expression proxy)

Hand tracking (basic gestures / position)

An on-screen avatar:

Mirrors user motion at low latency

Automatically animates to music (sway, idle motion)

AI layer (Gemini):

Receives periodic state summaries (music embedding + avatar state)

Nudges high-level avatar behavior (mood, pose set, expression)

The avatar behaves like living cover art, not a literal puppet.

5. Functional Requirements
5.1 Avatar Rendering

Prebuilt 3D avatar (Blender → GLTF)

Rendered in browser via Three.js

Supports:

Idle loop animations

Canned expressive poses

Blendable motion layers

5.2 Music Intelligence

Extract music embeddings (tempo, energy, mood)

Embeddings updated at a coarse interval (e.g., 1–2s)

Embeddings mapped to:

Animation intensity

Pose selection

Expression bias

5.3 User Motion Capture

Webcam-based tracking only (no external hardware)

Face:

Head orientation

Simple expression proxy (mouth open, smile)

Hands:

Position + simple gestures

Motion data drives direct control, not AI inference

5.4 AI “Director” Layer (Gemini)

Not in the real-time loop

Operates asynchronously

Input:

Current music embedding summary

Current avatar state summary

Output:

High-level commands:

“Switch to relaxed pose set”

“Increase expressiveness”

“Add eye contact”

Implemented via API calls, not continuous streaming

5.5 System Architecture

Real-time loop:

Webcam → motion mapping → Three.js

Slow loop:

Music embedding → Gemini → avatar nudges

Clear separation between:

Deterministic animation

AI-driven direction