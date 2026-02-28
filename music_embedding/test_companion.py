"""
Test: Feed Faded embeddings to Gemini companion and see how it interprets the music.

Loads fadedwlyrics.mp3, extracts embeddings at key moments (intro, build, drop, bridge, outro),
and sends them to Gemini as context for a music companion conversation.
"""

import json
import os
import sys

import librosa
import numpy as np

try:
    import google.generativeai as genai
except ImportError:
    print("Installing google-generativeai...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "google-generativeai"])
    import google.generativeai as genai

from embedder import embed_audio_chunk

AUDIO_PATH = "../fadedwlyrics.mp3"
SR = 22050

# Key moments to sample (seconds)
SAMPLE_POINTS = {
    "intro": (0, 4),
    "building": (30, 34),
    "pre_drop": (58, 62),
    "drop_peak": (90, 94),
    "vocal_chorus": (120, 124),
    "bridge": (170, 174),
    "final_chorus": (200, 204),
    "outro": (260, 264),
}


def get_embedding_at(audio, start_sec, end_sec, sr):
    start = int(start_sec * sr)
    end = int(end_sec * sr)
    chunk = audio[start:end]
    return embed_audio_chunk(chunk, sr)


def main():
    # Check for API key
    api_key = os.environ.get("VITE_GEMINI_API_KEY", "")
    if not api_key:
        api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        print("ERROR: Set VITE_GEMINI_API_KEY or GEMINI_API_KEY environment variable")
        sys.exit(1)

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(model_name="gemini-2.5-flash")

    # Load audio
    print(f"Loading {AUDIO_PATH}...")
    audio, sr = librosa.load(AUDIO_PATH, sr=SR)
    duration = len(audio) / sr
    print(f"Loaded: {duration:.1f}s\n")

    # Extract embeddings at key moments
    print("Extracting embeddings at key moments...")
    timeline = {}
    for label, (start, end) in SAMPLE_POINTS.items():
        emb = get_embedding_at(audio, start, end, sr)
        timeline[label] = {
            "time": f"{start}-{end}s",
            "summary": emb["summary"],
            "energy": emb["energy_rms"],
            "brightness": emb["brightness"],
            "valence": emb["valence_proxy"],
            "tempo": emb["tempo_bpm"],
            "chroma": emb["chroma"],
        }
        print(f"  {label:15s} [{start:3d}-{end:3d}s]: {emb['summary']}")

    # Full track embedding
    full_emb = embed_audio_chunk(audio, sr)
    print(f"\n  Full track: {full_emb['summary']}\n")

    # Build companion context
    context = f"""You are an AI music companion. You're listening to music together with the user.

Here is real-time audio analysis data from the song currently playing.
The song is approximately {duration:.0f} seconds long.

FULL TRACK EMBEDDING:
{json.dumps({k: v for k, v in full_emb.items() if k != 'chroma'}, indent=2)}

TIMELINE - Embeddings at key moments:
{json.dumps(timeline, indent=2)}

CHROMA KEY (12 values = C, C#, D, D#, E, F, F#, G, G#, A, A#, B):
The chroma shows which pitch classes are most active at each moment.

Use this data to understand the musical structure, mood, energy arc, and harmonic content.
Speak naturally about the music as if you're listening together with a friend.
"""

    # Test conversations
    test_prompts = [
        "Hey, what song do you think this is? What can you tell me about it from the audio?",
        "How does the energy change throughout the track? Walk me through the journey.",
        "What key is this in? Can you tell from the chroma data?",
        "The valence says upbeat but this song feels melancholic to me. What do you think?",
    ]

    print("=" * 60)
    print("COMPANION CONVERSATION TEST")
    print("=" * 60)

    chat = model.start_chat(history=[])

    # Send context as first message
    chat.send_message(context + "\nAcknowledge you've received the music data. Be brief.")
    print(f"\n[System context sent to companion]\n")

    for prompt in test_prompts:
        print(f"USER: {prompt}")
        print("-" * 40)
        response = chat.send_message(prompt)
        print(f"COMPANION: {response.text}")
        print()


if __name__ == "__main__":
    main()
