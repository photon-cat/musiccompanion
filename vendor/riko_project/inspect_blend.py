import bpy

print("\n=== ALL OBJECTS ===")
for obj in bpy.data.objects:
    print(f"  {obj.name:40s} type={obj.type:12s} visible={not obj.hide_viewport}  parent={obj.parent.name if obj.parent else 'None'}")

print("\n=== COLLECTIONS ===")
for col in bpy.data.collections:
    visible = any(
        lc.is_visible for lc in bpy.context.view_layer.layer_collection.children
        if lc.name == col.name
    ) if bpy.context.view_layer else 'unknown'
    print(f"  {col.name:40s} objects={[o.name for o in col.objects]}")

print("\n=== ARMATURES ===")
for arm in bpy.data.armatures:
    print(f"  {arm.name}: {len(arm.bones)} bones")
