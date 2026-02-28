import bpy
import sys

# Step 1: Link Ani_Rig to scene collection so it's in ViewLayer
armature = bpy.data.objects.get('Ani_Rig')
if not armature:
    print("ERROR: Ani_Rig not found")
    sys.exit(1)

# Link to scene root collection
scene_col = bpy.context.scene.collection
if armature.name not in [o.name for o in scene_col.objects]:
    scene_col.objects.link(armature)
    print(f"Linked {armature.name} to scene collection")

# Also link its mesh children
for child in armature.children:
    if child.type == 'MESH':
        if child.name not in [o.name for o in scene_col.objects]:
            scene_col.objects.link(child)

# Link Head mesh specifically (has shape keys)
for obj in bpy.data.objects:
    if obj.name == 'Head' and obj.type == 'MESH':
        if obj.name not in [o.name for o in scene_col.objects]:
            scene_col.objects.link(obj)

# Link Hair
for obj in bpy.data.objects:
    if 'Hair' in obj.name and obj.type == 'MESH':
        if obj.name not in [o.name for o in scene_col.objects]:
            scene_col.objects.link(obj)

bpy.context.view_layer.update()

# Now enable VRM addon
bpy.ops.preferences.addon_enable(module='VRM_Addon_for_Blender-release')

print(f"Armature: {armature.name}")
bpy.context.view_layer.objects.active = armature
armature.select_set(True)

# Bone mapping
BONE_MAP = {
    'Root_M': 'hips',
    'Spine1_M': 'spine',
    'Spine3_M': 'chest',
    'Neck_M': 'neck',
    'Head_M': 'head',
    'Hip_L': 'leftUpperLeg',
    'Knee_L': 'leftLowerLeg',
    'Ankle_L': 'leftFoot',
    'Hip_R': 'rightUpperLeg',
    'Knee_R': 'rightLowerLeg',
    'Ankle_R': 'rightFoot',
    'Shoulder_L': 'leftUpperArm',
    'Elbow_L': 'leftLowerArm',
    'Wrist_L': 'leftHand',
    'Shoulder_R': 'rightUpperArm',
    'Elbow_R': 'rightLowerArm',
    'Wrist_R': 'rightHand',
}

vrm_ext = armature.data.vrm_addon_extension
vrm_ext.spec_version = '1.0'
human_bones = vrm_ext.vrm1.humanoid.human_bones

for bone_name, vrm_name in BONE_MAP.items():
    if bone_name in armature.data.bones and hasattr(human_bones, vrm_name):
        getattr(human_bones, vrm_name).node.bone_name = bone_name
        print(f"  {bone_name} -> {vrm_name}")

# Expressions
expressions = vrm_ext.vrm1.expressions
def add_bind(expr_name, mesh_name, sk_name, weight=1.0):
    d = expressions.preset.name_to_expression_dict()
    if expr_name not in d:
        return
    bind = d[expr_name].morph_target_binds.add()
    bind.node.mesh_object_name = mesh_name
    bind.index = sk_name
    bind.weight = weight

add_bind('blink', 'Head', 'eyeBlinkLeft')
add_bind('blink', 'Head', 'eyeBlinkRight')
add_bind('aa', 'Head', 'jawOpen')
add_bind('oh', 'Head', 'mouthFunnel')
add_bind('happy', 'Head', 'mouthSmileLeft')
add_bind('happy', 'Head', 'mouthSmileRight')

# Metadata
meta = vrm_ext.vrm1.meta
meta.vrm_name = "Ani"
meta.authors.clear()
a = meta.authors.add()
a.value = "Grok"

# Export
output = "/Users/delta/claudehack/musiccompanion/vendor/riko_project/server/static/ani.vrm"
print("Exporting VRM...")
try:
    result = bpy.ops.export_scene.vrm(filepath=output)
    print(f"Export result: {result}")
except Exception as e:
    print(f"Export error: {e}")

import os
if os.path.exists(output):
    print(f"SUCCESS: {output} ({os.path.getsize(output)} bytes)")
else:
    print("FAILED: no file created")
