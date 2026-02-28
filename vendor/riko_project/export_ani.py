import bpy
import os

output_path = os.path.join(os.path.dirname(bpy.data.filepath), "..", "..", "vendor", "riko_project", "server", "static", "ani_model.glb")
output_path = os.path.abspath(output_path)

# Select all mesh objects
bpy.ops.object.select_all(action='SELECT')

# Export as GLB
bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    export_texcoords=True,
    export_normals=True,
    export_materials='EXPORT',
    export_image_format='AUTO',
)

print(f"Exported to: {output_path}")
