import bpy

# Collect which objects to keep (Outfit_05 tree + hair)
KEEP_NAMES = set()

def collect_children(obj):
    KEEP_NAMES.add(obj.name)
    for child in obj.children:
        collect_children(child)

for obj in bpy.data.objects:
    if obj.name == 'Outfit_05':
        collect_children(obj)
    if obj.name in ('Ani_hair_01.001', 'Ani_hair_02.001', 'MC_hair_01'):
        collect_children(obj)
    if obj.name in ('Root_M', 'Root_M.001', 'Spine1_M', 'Spine1_M.001',
                     'Spine2_M', 'Spine2_M.001', 'Spine3_M', 'Spine3_M.001',
                     'Chest_M', 'Chest_M.001', 'HeadEnd_M', 'HeadEnd_M.001'):
        collect_children(obj)

# Delete objects NOT in keep list
to_delete = [obj for obj in bpy.data.objects if obj.name not in KEEP_NAMES]

# Remove in reverse dependency order (children first)
for obj in reversed(to_delete):
    bpy.data.objects.remove(obj, do_unlink=True)

print(f"Kept {len(bpy.data.objects)} objects")
for obj in bpy.data.objects:
    print(f"  {obj.name:40s} type={obj.type}")

# Export
bpy.ops.object.select_all(action='SELECT')

output_path = "/Users/delta/claudehack/musiccompanion/vendor/riko_project/server/static/ani_model.glb"

bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    export_texcoords=True,
    export_normals=True,
    export_materials='EXPORT',
    export_image_format='AUTO',
)

print(f"\nExported to: {output_path}")
