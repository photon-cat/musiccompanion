"""
Real-time audio capture and embedding.

Captures system/mic audio in chunks and produces continuous music embeddings.
Designed to feed both Track A (avatar) and Track B (companion).

Usage:
    python realtime_capture.py
    python realtime_capture.py --device 2 --chunk-seconds 1.5
"""

import argparse
import json
import sys
import time
import threading
from collections import deque

import numpy as np
import sounddevice as sd

from embedder import embed_audio_chunk


class RealtimeEmbedder:
    """Captures audio and produces embeddings at regular intervals."""

    def __init__(self, device=None, sr=22050, chunk_seconds=1.5):
        self.sr = sr
        self.chunk_seconds = chunk_seconds
        self.device = device
        self.chunk_samples = int(sr * chunk_seconds)
        self.buffer = deque(maxlen=self.chunk_samples)
        self.latest_embedding = None
        self._running = False

    def _audio_callback(self, indata, frames, time_info, status):
        if status:
            print(f"[audio] {status}", file=sys.stderr)
        # Take mono channel
        mono = indata[:, 0]
        self.buffer.extend(mono.tolist())

    def _embed_loop(self):
        while self._running:
            time.sleep(self.chunk_seconds)
            if len(self.buffer) < self.chunk_samples // 2:
                continue
            audio = np.array(list(self.buffer), dtype=np.float32)
            embedding = embed_audio_chunk(audio, self.sr)
            self.latest_embedding = embedding
            # Print as JSON line for downstream consumers
            print(json.dumps(embedding), flush=True)

    def start(self):
        """Start capturing and embedding."""
        self._running = True
        print(f"[realtime] Starting capture: sr={self.sr}, "
              f"chunk={self.chunk_seconds}s, device={self.device}",
              file=sys.stderr)

        embed_thread = threading.Thread(target=self._embed_loop, daemon=True)
        embed_thread.start()

        with sd.InputStream(
            device=self.device,
            samplerate=self.sr,
            channels=1,
            callback=self._audio_callback,
            blocksize=1024,
        ):
            try:
                while self._running:
                    time.sleep(0.1)
            except KeyboardInterrupt:
                self._running = False
                print("\n[realtime] Stopped.", file=sys.stderr)

    def stop(self):
        self._running = False


def list_devices():
    print(sd.query_devices())


def main():
    parser = argparse.ArgumentParser(description="Real-time music embedding")
    parser.add_argument("--device", type=int, default=None,
                        help="Audio input device index (use --list-devices to see)")
    parser.add_argument("--list-devices", action="store_true",
                        help="List available audio devices and exit")
    parser.add_argument("--chunk-seconds", type=float, default=1.5,
                        help="Embedding interval in seconds")
    parser.add_argument("--sr", type=int, default=22050,
                        help="Sample rate")
    args = parser.parse_args()

    if args.list_devices:
        list_devices()
        return

    embedder = RealtimeEmbedder(
        device=args.device,
        sr=args.sr,
        chunk_seconds=args.chunk_seconds,
    )
    embedder.start()


if __name__ == "__main__":
    main()
