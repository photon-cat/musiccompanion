"""
Pre-process a song: extract full embedding timeline + generate Gemini avatar directives.

Flow:
  1. Load entire song → extract embeddings every N seconds
  2. Send full timeline to Gemini → get back timestamped avatar directives
  3. Output a JSON "script" that the browser can follow synchronously during playback

Usage:
    python preprocess_song.py ../fadedwlyrics.mp3
    python preprocess_song.py ../fadedwlyrics.mp3 --output script.json
"""

import argparse
import json
import os
import sys

import librosa
import numpy as np

try:
    import google.generativeai as genai
except ImportError:
    print("pip install google-generativeai")
    sys.exit(1)

from embedder import embed_audio_chunk

CHUNK_SECONDS = 4.0  # coarser chunks for LLM context (fewer tokens)
SR = 22050


def extract_timeline(audio_path, chunk_seconds=CHUNK_SECONDS, sr=SR):
    """Extract embedding timeline from a song."""
    print(f"Loading {audio_path}...")
    audio, sr = librosa.load(audio_path, sr=sr)
    duration = len(audio) / sr
    print(f"Loaded: {duration:.1f}s")

    chunk_samples = int(sr * chunk_seconds)
    timeline = []

    for i in range(0, len(audio), chunk_samples):
        chunk = audio[i:i + chunk_samples]
        t = i / sr
        emb = embed_audio_chunk(chunk, sr)
        timeline.append({
            "t": round(t, 1),
            "t_end": round(min(t + chunk_seconds, duration), 1),
            "summary": emb["summary"],
            "energy": emb["energy_rms"],
            "brightness": emb["brightness"],
            "valence": emb["valence_proxy"],
            "tempo": emb["tempo_bpm"],
            "onset": emb["onset_strength"],
            "chroma": emb["chroma"],
        })

    return timeline, duration


def generate_directives(timeline, duration, api_key):
    """Send full timeline to Gemini and get back avatar directives."""
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(model_name="gemini-2.5-flash")

    # Build a compact timeline summary for the prompt
    timeline_text = ""
    for entry in timeline:
        timeline_text += (
            f"  [{entry['t']:6.1f}s] "
            f"energy={entry['energy']:.3f} "
            f"bright={entry['brightness']:.0f} "
            f"valence={entry['valence']:.2f} "
            f"tempo={entry['tempo']:.0f} "
            f"onset={entry['onset']:.2f} "
            f"| {entry['summary']}\n"
        )

    prompt = f"""You are a music-reactive avatar director. You control a 3D anime avatar that reacts to music.

Here is the complete audio analysis timeline of a song ({duration:.0f} seconds long), with embeddings every {CHUNK_SECONDS:.0f} seconds:

{timeline_text}

Based on this data, generate a JSON array of timestamped avatar directives. Each directive controls the avatar's behavior for that time segment.

For EACH entry in the timeline, output a directive with these fields:
- "t": timestamp in seconds (match the timeline)
- "pose": one of ["idle", "gentle_sway", "nodding", "energetic", "dancing", "reflective", "dramatic", "winding_down"]
- "intensity": 0.0 to 1.0 (how much the avatar moves)
- "expression": one of ["neutral", "calm", "happy", "excited", "dreamy", "emotional", "serene"]
- "head_bob": 0.0 to 1.0 (how much the head bobs to the beat)
- "sway_amount": 0.0 to 1.0 (body sway amplitude)
- "eye_state": one of ["open", "half_closed", "closed", "wide"]
- "description": brief text describing what the avatar should be doing

Think about the musical journey: energy builds, drops hit, bridges are reflective, outros wind down.
Make the avatar feel like it's EXPERIENCING the music, not just reacting mechanically.

Respond ONLY with a valid JSON array. No markdown, no explanation."""

    print("Sending to Gemini for directive generation...")
    response = model.generate_content(prompt)

    # Parse the JSON response
    text = response.text.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        if text.endswith("```"):
            text = text.rsplit("```", 1)[0]
        text = text.strip()

    directives = json.loads(text)
    print(f"Got {len(directives)} directives from Gemini")
    return directives


def main():
    parser = argparse.ArgumentParser(description="Pre-process song for avatar sync")
    parser.add_argument("audio_path", help="Path to audio file")
    parser.add_argument("--output", "-o", default=None, help="Output JSON path")
    parser.add_argument("--chunk-seconds", type=float, default=CHUNK_SECONDS)
    args = parser.parse_args()

    api_key = os.environ.get("VITE_GEMINI_API_KEY", os.environ.get("GEMINI_API_KEY", ""))
    if not api_key:
        print("ERROR: Set VITE_GEMINI_API_KEY or GEMINI_API_KEY")
        sys.exit(1)

    # Extract embeddings
    timeline, duration = extract_timeline(args.audio_path, args.chunk_seconds)

    # Generate Gemini directives
    directives = generate_directives(timeline, duration, api_key)

    # Build the final script
    script = {
        "duration": round(duration, 1),
        "chunk_seconds": args.chunk_seconds,
        "embeddings": timeline,
        "directives": directives,
    }

    # Output
    output_path = args.output or args.audio_path.rsplit(".", 1)[0] + "_script.json"
    with open(output_path, "w") as f:
        json.dump(script, f, indent=2)
    print(f"\nScript saved to {output_path}")

    # Print a preview
    print("\n=== DIRECTIVE PREVIEW ===")
    for d in directives[:10]:
        print(f"  [{d.get('t', '?'):>6}s] {d.get('pose', '?'):15s} "
              f"int={d.get('intensity', '?')} "
              f"expr={d.get('expression', '?'):10s} "
              f"| {d.get('description', '')}")
    if len(directives) > 10:
        print(f"  ... and {len(directives) - 10} more")


if __name__ == "__main__":
    main()
