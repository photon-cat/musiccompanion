"""Standalone test: embed fadedwlyrics.mp3 in chunks and print results."""

import json
import librosa
import numpy as np
from embedder import embed_audio_chunk

AUDIO_PATH = "../fadedwlyrics.mp3"
CHUNK_SECONDS = 2.0
SR = 22050


def main():
    print(f"Loading {AUDIO_PATH} ...")
    audio, sr = librosa.load(AUDIO_PATH, sr=SR)
    duration = len(audio) / sr
    print(f"Loaded: {duration:.1f}s, sr={sr}\n")

    chunk_samples = int(SR * CHUNK_SECONDS)
    num_chunks = int(np.ceil(len(audio) / chunk_samples))

    for i in range(num_chunks):
        start = i * chunk_samples
        end = min(start + chunk_samples, len(audio))
        chunk = audio[start:end]
        t_start = start / sr
        t_end = end / sr

        emb = embed_audio_chunk(chunk, sr)
        print(f"--- [{t_start:6.1f}s - {t_end:6.1f}s] ---")
        print(f"  Summary : {emb['summary']}")
        print(f"  Tempo   : {emb['tempo_bpm']} BPM")
        print(f"  Energy  : {emb['energy_rms']}")
        print(f"  Bright  : {emb['brightness']}")
        print(f"  Valence : {emb['valence_proxy']}")
        print(f"  Onset   : {emb['onset_strength']}")
        print(f"  ZCR     : {emb['zero_crossing_rate']}")
        print(f"  Chroma  : {emb['chroma']}")
        print()

    # Also do a full-track embedding
    print("=== FULL TRACK EMBEDDING ===")
    full_emb = embed_audio_chunk(audio, sr)
    print(json.dumps(full_emb, indent=2))


if __name__ == "__main__":
    main()
