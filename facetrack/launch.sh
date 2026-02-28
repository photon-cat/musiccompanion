#!/bin/bash
# Launch Blender with the Ani avatar + face tracking script auto-running
BLEND="/Users/delta/claudehack/musiccompanion/avatars/ani/ani.blend"
SCRIPT="/Users/delta/claudehack/musiccompanion/facetrack/blender_facetrack.py"
BLENDER="/Applications/Blender.app/Contents/MacOS/Blender"

echo "Starting Blender with face tracking..."
echo "Once Blender opens, open facetrack/index.html in your browser and click Start Tracking."

"$BLENDER" "$BLEND" --python "$SCRIPT"
