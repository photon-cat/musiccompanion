import bpy

# Find the main armature (Ani_Rig under Outfit_05)
for obj in bpy.data.objects:
    if obj.type == 'ARMATURE' and obj.name == 'Ani_Rig':
        arm = obj.data
        print(f"\n=== ARMATURE: {obj.name} ({len(arm.bones)} bones) ===")
        for bone in arm.bones:
            parent = bone.parent.name if bone.parent else 'ROOT'
            children = [c.name for c in bone.children]
            print(f"  {bone.name:40s} parent={parent:30s} children={children}")

# Also check for shape keys (blendshapes) on meshes
print("\n=== SHAPE KEYS ===")
for obj in bpy.data.objects:
    if obj.type == 'MESH' and obj.data.shape_keys:
        keys = [kb.name for kb in obj.data.shape_keys.key_blocks]
        print(f"  {obj.name}: {keys}")
