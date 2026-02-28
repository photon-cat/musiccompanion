"""
Face Track Receiver for Blender
================================
Run this script from Blender's Text Editor (or Scripting tab).
It starts a WebSocket server on port 8765 that receives face tracking
data from the browser and applies it to the avatar's armature.

Usage:
  1. Open this file in Blender's Text Editor
  2. Click "Run Script" (or Alt+P)
  3. Open facetrack/index.html in your browser
  4. Click "Start Tracking" in the browser

To stop: run  stop_facetrack()  in Blender's Python console,
         or just close and reopen the .blend file.
"""

import bpy
import sys
import os

# Add user site-packages so we can find 'websockets'
user_site = os.path.expanduser("~/.local/lib/python3.11/site-packages")
if user_site not in sys.path:
    sys.path.insert(0, user_site)

import json
import asyncio
import threading
import math
from mathutils import Euler, Quaternion

# ── Config ──────────────────────────────────────────────────────────
WS_PORT = 8765
HEAD_BONE_NAMES = ["Head", "head", "DEF-spine.006", "mixamorig:Head"]
SMOOTHING = 0.4  # 0 = no smoothing, 1 = frozen (0.3-0.5 feels good)
HEAD_SCALE = 1.2  # multiplier for head rotation intensity

# ── State ───────────────────────────────────────────────────────────
_state = {
    "face_data": None,
    "server": None,
    "thread": None,
    "running": False,
    "prev_head": [0.0, 0.0, 0.0],
    "prev_expressions": {
        "mouth_open": 0.0, "smile": 0.0,
        "blink_l": 0.0, "blink_r": 0.0,
        "brow_l": 0.0, "brow_r": 0.0
    }
}


# ── WebSocket server (runs in background thread) ───────────────────
async def ws_handler(websocket):
    print(f"[FaceTrack] Browser connected from {websocket.remote_address}")
    try:
        async for message in websocket:
            try:
                _state["face_data"] = json.loads(message)
            except json.JSONDecodeError:
                pass
    except Exception as e:
        print(f"[FaceTrack] Connection closed: {e}")


async def run_server():
    try:
        import websockets
    except ImportError:
        print("[FaceTrack] ERROR: 'websockets' not installed.")
        print("[FaceTrack] In Blender's Python, run:")
        print("[FaceTrack]   import subprocess, sys")
        print("[FaceTrack]   subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'websockets'])")
        return

    _state["running"] = True
    server = await websockets.serve(ws_handler, "localhost", WS_PORT)
    _state["server"] = server
    print(f"[FaceTrack] WebSocket server listening on ws://localhost:{WS_PORT}")

    while _state["running"]:
        await asyncio.sleep(0.1)

    server.close()
    await server.wait_closed()
    print("[FaceTrack] Server stopped.")


def server_thread():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(run_server())
    loop.close()


# ── Find armature and bones ────────────────────────────────────────
def find_armature():
    """Find the first armature in the scene."""
    for obj in bpy.context.scene.objects:
        if obj.type == 'ARMATURE':
            return obj
    return None


def find_head_bone(armature):
    """Find the head bone by trying common names."""
    pose_bones = armature.pose.bones
    for name in HEAD_BONE_NAMES:
        if name in pose_bones:
            return pose_bones[name]
    # Fallback: search for any bone with 'head' in name
    for bone in pose_bones:
        if 'head' in bone.name.lower():
            return bone
    return None


def find_mesh_with_shape_keys(armature):
    """Find a mesh parented to this armature that has shape keys."""
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH' and obj.parent == armature:
            if obj.data.shape_keys:
                return obj
    # Fallback: any mesh with shape keys
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH' and obj.data.shape_keys:
            return obj
    return None


# ── Shape key mapping ──────────────────────────────────────────────
# Maps our face data keys to common shape key names
SHAPE_KEY_MAP = {
    "mouth_open": ["MouthOpen", "mouth_open", "jawOpen", "Jaw_Open", "A", "あ"],
    "smile":      ["Smile", "smile", "mouthSmile", "Happy", "Joy"],
    "blink_l":    ["BlinkLeft", "blink_l", "eyeBlinkLeft", "Blink_L", "EyeClose_L"],
    "blink_r":    ["BlinkRight", "blink_r", "eyeBlinkRight", "Blink_R", "EyeClose_R"],
    "brow_l":     ["BrowUpLeft", "brow_l", "browInnerUp", "Brow_Up_L"],
    "brow_r":     ["BrowUpRight", "brow_r", "browInnerUp", "Brow_Up_R"],
}


def find_shape_key(mesh_obj, candidates):
    """Find a matching shape key from a list of candidate names."""
    if not mesh_obj or not mesh_obj.data.shape_keys:
        return None
    keys = mesh_obj.data.shape_keys.key_blocks
    for name in candidates:
        if name in keys:
            return keys[name]
    # Fuzzy match
    for name in candidates:
        for key in keys:
            if name.lower() in key.name.lower():
                return key
    return None


# ── Smooth helper ──────────────────────────────────────────────────
def lerp(a, b, t):
    return a + (b - a) * t


# ── Blender timer callback (runs every frame in main thread) ──────
def update_avatar():
    if not _state["running"]:
        return None  # Unregister timer

    data = _state["face_data"]
    if data is None:
        return 1.0 / 30.0  # Check again in ~33ms

    armature = find_armature()
    if not armature:
        return 1.0 / 5.0  # Check less frequently

    head_bone = find_head_bone(armature)
    mesh_obj = find_mesh_with_shape_keys(armature)

    # ── Apply head rotation ──
    if head_bone and "head" in data:
        h = data["head"]
        target = [
            h.get("pitch", 0) * HEAD_SCALE,
            h.get("roll", 0) * HEAD_SCALE,
            h.get("yaw", 0) * HEAD_SCALE
        ]
        # Smooth
        prev = _state["prev_head"]
        smoothed = [lerp(target[i], prev[i], SMOOTHING) for i in range(3)]
        _state["prev_head"] = smoothed

        # Apply as Euler rotation (Blender uses XYZ)
        head_bone.rotation_mode = 'XYZ'
        head_bone.rotation_euler = Euler((smoothed[0], smoothed[1], smoothed[2]), 'XYZ')

    # ── Apply expressions via shape keys ──
    if mesh_obj:
        prev_expr = _state["prev_expressions"]
        for expr_name, sk_candidates in SHAPE_KEY_MAP.items():
            if expr_name in data:
                target_val = data[expr_name]
                prev_val = prev_expr.get(expr_name, 0.0)
                smoothed_val = lerp(target_val, prev_val, SMOOTHING)
                prev_expr[expr_name] = smoothed_val

                sk = find_shape_key(mesh_obj, sk_candidates)
                if sk:
                    sk.value = max(0.0, min(1.0, smoothed_val))

    # Force viewport update
    if bpy.context.view_layer:
        bpy.context.view_layer.update()

    return 1.0 / 30.0  # ~30 FPS updates


# ── Start / Stop ───────────────────────────────────────────────────
def start_facetrack():
    """Start the face tracking receiver."""
    if _state["running"]:
        print("[FaceTrack] Already running!")
        return

    # Validate scene
    armature = find_armature()
    if armature:
        print(f"[FaceTrack] Found armature: {armature.name}")
        head = find_head_bone(armature)
        if head:
            print(f"[FaceTrack] Found head bone: {head.name}")
        else:
            print("[FaceTrack] WARNING: No head bone found. Head rotation won't work.")
            print(f"[FaceTrack]   Available bones: {[b.name for b in armature.pose.bones[:10]]}...")

        mesh = find_mesh_with_shape_keys(armature)
        if mesh:
            keys = [k.name for k in mesh.data.shape_keys.key_blocks]
            print(f"[FaceTrack] Found shape keys on '{mesh.name}': {keys[:10]}...")
        else:
            print("[FaceTrack] No mesh with shape keys found. Expressions won't work.")
    else:
        print("[FaceTrack] WARNING: No armature found in scene!")

    # Start WebSocket server thread
    t = threading.Thread(target=server_thread, daemon=True)
    t.start()
    _state["thread"] = t

    # Register Blender timer for avatar updates
    bpy.app.timers.register(update_avatar, first_interval=0.5)

    print("[FaceTrack] Started! Open index.html in browser and click 'Start Tracking'.")


def stop_facetrack():
    """Stop the face tracking receiver."""
    _state["running"] = False
    _state["face_data"] = None
    _state["prev_head"] = [0.0, 0.0, 0.0]
    print("[FaceTrack] Stopping...")


# ── Auto-start when run as script ──────────────────────────────────
if __name__ == "__main__":
    start_facetrack()
