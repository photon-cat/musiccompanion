#!/usr/bin/env python3
"""
Webcam Face Tracking State Vector Test
=======================================
Captures webcam, runs MediaPipe FaceLandmarker, and prints a state vector
containing head pose (pitch/yaw/roll) and expression blendshapes.

Press Q to quit.

Usage:
    python facetrack/test_webcam_facetrack.py
"""

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision
import urllib.request
import os
import math
import time

# ── Model setup ──────────────────────────────────────────────────────
MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
MODEL_PATH = os.path.join(os.path.dirname(__file__), "face_landmarker.task")


def ensure_model():
    if not os.path.exists(MODEL_PATH):
        print(f"Downloading face landmarker model to {MODEL_PATH}...")
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        print("Done.")


# ── Extract head rotation from transformation matrix ─────────────────
def rotation_from_matrix(mat: np.ndarray):
    """Extract pitch, yaw, roll (radians) from a 4x4 transformation matrix."""
    # mat is row-major 4x4
    sy = math.sqrt(mat[0, 0] ** 2 + mat[1, 0] ** 2)
    singular = sy < 1e-6
    if not singular:
        pitch = math.atan2(mat[2, 1], mat[2, 2])
        yaw = math.atan2(-mat[2, 0], sy)
        roll = math.atan2(mat[1, 0], mat[0, 0])
    else:
        pitch = math.atan2(-mat[1, 2], mat[1, 1])
        yaw = math.atan2(-mat[2, 0], sy)
        roll = 0.0
    return pitch, yaw, roll


# ── Blendshape names we care about ──────────────────────────────────
TRACKED_BLENDSHAPES = [
    "jawOpen",
    "mouthSmileLeft",
    "mouthSmileRight",
    "eyeBlinkLeft",
    "eyeBlinkRight",
    "browInnerUp",
    "browDownLeft",
    "browDownRight",
    "mouthFunnel",
    "mouthPucker",
    "cheekPuff",
    "jawLeft",
    "jawRight",
]


def build_state_vector(detection_result) -> dict | None:
    """Build a flat state vector dict from a MediaPipe detection result."""
    if not detection_result.face_landmarks:
        return None

    state = {}

    # Head pose from facial transformation matrix
    if detection_result.facial_transformation_matrixes:
        mat = np.array(detection_result.facial_transformation_matrixes[0]).reshape(4, 4)
        pitch, yaw, roll = rotation_from_matrix(mat)
        state["head_pitch"] = pitch
        state["head_yaw"] = yaw
        state["head_roll"] = roll
    else:
        state["head_pitch"] = 0.0
        state["head_yaw"] = 0.0
        state["head_roll"] = 0.0

    # Blendshapes
    if detection_result.face_blendshapes:
        bs_map = {
            s.category_name: s.score
            for s in detection_result.face_blendshapes[0]
        }
        for name in TRACKED_BLENDSHAPES:
            state[name] = bs_map.get(name, 0.0)
    else:
        for name in TRACKED_BLENDSHAPES:
            state[name] = 0.0

    return state


# ── Draw overlay ─────────────────────────────────────────────────────
def draw_overlay(frame, state: dict):
    """Draw state vector values on the frame."""
    y = 24
    for key, val in state.items():
        if "head" in key:
            text = f"{key}: {math.degrees(val):+6.1f} deg"
        else:
            bar_len = int(val * 20)
            text = f"{key}: {val:.2f} {'█' * bar_len}"
        cv2.putText(frame, text, (10, y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 128), 1)
        y += 20


# ── Main ─────────────────────────────────────────────────────────────
def main():
    ensure_model()

    # Create face landmarker
    options = vision.FaceLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=MODEL_PATH),
        running_mode=vision.RunningMode.VIDEO,
        num_faces=1,
        output_face_blendshapes=True,
        output_facial_transformation_matrixes=True,
    )
    landmarker = vision.FaceLandmarker.create_from_options(options)

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("ERROR: Cannot open webcam")
        return

    print("Webcam opened. Press Q to quit.")
    print("-" * 60)

    frame_count = 0
    fps_time = time.time()

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            # Convert BGR -> RGB for MediaPipe
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

            # Timestamp in ms
            timestamp_ms = int(cap.get(cv2.CAP_PROP_POS_MSEC))
            if timestamp_ms <= 0:
                timestamp_ms = int((time.time() - fps_time) * 1000)

            result = landmarker.detect_for_video(mp_image, timestamp_ms)
            state = build_state_vector(result)

            if state:
                draw_overlay(frame, state)

                # Print to terminal every 15 frames
                frame_count += 1
                if frame_count % 15 == 0:
                    compact = {k: round(v, 3) for k, v in state.items()}
                    print(f"[{frame_count:>5}] {compact}")

            cv2.imshow("Face Track Test", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    finally:
        cap.release()
        cv2.destroyAllWindows()
        landmarker.close()
        print("Done.")


if __name__ == "__main__":
    main()
