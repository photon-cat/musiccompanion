import bpy
import os
import sys

output_path = "/Users/delta/claudehack/musiccompanion/vendor/riko_project/server/static/ani_model.glb"

bpy.ops.object.select_all(action='SELECT')

bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    export_texcoords=True,
    export_normals=True,
    export_materials='EXPORT',
    export_image_format='AUTO',
)

print(f"Exported to: {output_path}")
