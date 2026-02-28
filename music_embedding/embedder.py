"""
Music Embedding Pipeline

Extracts real-time audio features from music:
- Tempo / BPM
- Energy (RMS)
- Spectral centroid (brightness)
- Chroma (key/harmony)
- Onset strength (beat intensity)
- Mood proxy (valence estimate from spectral + energy features)

Returns a compact embedding dict suitable for:
  Track A: driving avatar animation parameters
  Track B: feeding to Gemini companion as music context
"""

import numpy as np
import librosa


def embed_audio_chunk(audio: np.ndarray, sr: int = 22050) -> dict:
    """Extract music features from a short audio chunk (1-2 seconds).

    Args:
        audio: mono audio samples as float32 numpy array
        sr: sample rate

    Returns:
        dict with embedding features
    """
    if len(audio) == 0:
        return _empty_embedding()

    # Energy (RMS)
    rms = float(np.sqrt(np.mean(audio ** 2)))

    # Spectral centroid — perceptual brightness
    centroid = librosa.feature.spectral_centroid(y=audio, sr=sr)
    centroid_mean = float(np.mean(centroid))

    # Chroma — harmony / key information
    chroma = librosa.feature.chroma_stft(y=audio, sr=sr)
    chroma_mean = chroma.mean(axis=1).tolist()  # 12-dim vector

    # Onset strength — beat / percussive intensity
    onset_env = librosa.onset.onset_strength(y=audio, sr=sr)
    onset_mean = float(np.mean(onset_env))

    # Tempo estimate (needs enough audio — may be noisy on short chunks)
    try:
        tempo = float(librosa.beat.tempo(onset_envelope=onset_env, sr=sr)[0])
    except Exception:
        tempo = 0.0

    # Spectral rolloff — how much high-frequency content
    rolloff = librosa.feature.spectral_rolloff(y=audio, sr=sr)
    rolloff_mean = float(np.mean(rolloff))

    # Zero crossing rate — noisiness / percussiveness proxy
    zcr = librosa.feature.zero_crossing_rate(y=audio)
    zcr_mean = float(np.mean(zcr))

    # Mood proxy: simple valence heuristic
    # Higher centroid + higher energy + major-key chroma bias → more "positive"
    # This is a rough proxy — Gemini can do deeper semantic analysis
    energy_norm = min(rms / 0.1, 1.0)
    brightness_norm = min(centroid_mean / 4000.0, 1.0)
    valence_proxy = (energy_norm * 0.4 + brightness_norm * 0.3 +
                     (1.0 - zcr_mean / 0.2) * 0.3)
    valence_proxy = float(np.clip(valence_proxy, 0.0, 1.0))

    return {
        "tempo_bpm": round(tempo, 1),
        "energy_rms": round(rms, 4),
        "brightness": round(centroid_mean, 1),
        "chroma": [round(c, 3) for c in chroma_mean],
        "onset_strength": round(onset_mean, 3),
        "spectral_rolloff": round(rolloff_mean, 1),
        "zero_crossing_rate": round(zcr_mean, 4),
        "valence_proxy": round(valence_proxy, 3),
        # Summary string for LLM context
        "summary": _summarize(tempo, rms, centroid_mean, valence_proxy, onset_mean),
    }


def _summarize(tempo, rms, centroid, valence, onset) -> str:
    """Human-readable summary for the companion LLM."""
    energy_label = "low" if rms < 0.03 else "medium" if rms < 0.08 else "high"
    brightness_label = "dark" if centroid < 1500 else "balanced" if centroid < 3000 else "bright"
    mood_label = "melancholic" if valence < 0.35 else "neutral" if valence < 0.65 else "upbeat"
    intensity_label = "gentle" if onset < 1.0 else "moderate" if onset < 3.0 else "intense"

    return (
        f"Tempo ~{tempo:.0f} BPM, {energy_label} energy, "
        f"{brightness_label} tone, {mood_label} mood, {intensity_label} rhythm"
    )


def _empty_embedding() -> dict:
    return {
        "tempo_bpm": 0.0,
        "energy_rms": 0.0,
        "brightness": 0.0,
        "chroma": [0.0] * 12,
        "onset_strength": 0.0,
        "spectral_rolloff": 0.0,
        "zero_crossing_rate": 0.0,
        "valence_proxy": 0.0,
        "summary": "No audio detected",
    }
