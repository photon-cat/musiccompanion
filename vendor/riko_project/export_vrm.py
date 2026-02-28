import bpy

# Enable VRM addon
bpy.ops.preferences.addon_enable(module='VRM_Addon_for_Blender-release')

# ---- Step 1: Identify what to keep ----
# We want Ani_Rig (the main character armature under Outfit_05)
# and its direct mesh children (body parts)
# plus hair meshes

# First, find the main rig
main_rig = bpy.data.objects.get('Ani_Rig')
print(f"Main rig: {main_rig.name}, parent: {main_rig.parent.name if main_rig.parent else 'None'}")

# Collect mesh children of main rig
KEEP = {main_rig.name}
for child in main_rig.children_recursive:
    if child.type in ('MESH', 'EMPTY', 'ARMATURE'):
        KEEP.add(child.name)

# Add hair
for obj in bpy.data.objects:
    if 'Hair' in obj.name and obj.type == 'MESH':
        KEEP.add(obj.name)
        # Also keep its parent chain
        p = obj.parent
        while p:
            KEEP.add(p.name)
            p = p.parent

# Keep the Outfit_05 parent chain
p = main_rig.parent
while p:
    KEEP.add(p.name)
    p = p.parent

print(f"Keeping {len(KEEP)} objects")

# ---- Step 2: Delete everything else ----
# Must handle carefully - delete leaf objects first
all_objs = list(bpy.data.objects)
to_delete = [o for o in all_objs if o.name not in KEEP]

# Sort by depth (deepest children first)
def depth(obj):
    d = 0
    p = obj.parent
    while p:
        d += 1
        p = p.parent
    return d

to_delete.sort(key=depth, reverse=True)

for obj in to_delete:
    try:
        bpy.data.objects.remove(obj, do_unlink=True)
    except:
        pass

remaining = list(bpy.data.objects)
print(f"\nRemaining {len(remaining)} objects:")
armature_count = 0
for obj in remaining:
    print(f"  {obj.name:40s} type={obj.type}")
    if obj.type == 'ARMATURE':
        armature_count += 1

print(f"\nArmature count: {armature_count}")

# ---- Step 3: Ensure only one armature ----
# If there are extra armatures (outfit sub-rigs), remove them
if armature_count > 1:
    for obj in list(bpy.data.objects):
        if obj.type == 'ARMATURE' and obj.name != main_rig.name:
            # Re-parent its mesh children to main rig
            for child in list(obj.children):
                if child.type == 'MESH':
                    child.parent = main_rig
            bpy.data.objects.remove(obj, do_unlink=True)
    print(f"Cleaned to 1 armature")

# ---- Step 4: Set up VRM bone mapping ----
armature = None
for obj in bpy.data.objects:
    if obj.type == 'ARMATURE':
        armature = obj
        break

print(f"\nUsing armature: {armature.name} with {len(armature.data.bones)} bones")

# Ensure armature and all remaining objects are linked to scene collection
for obj in bpy.data.objects:
    if obj.name not in bpy.context.scene.collection.objects:
        try:
            bpy.context.scene.collection.objects.link(obj)
        except:
            pass

bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
armature.select_set(True)
bpy.context.view_layer.objects.active = armature

BONE_MAP = {
    'Root_M': 'hips',
    'Spine1_M': 'spine',
    'Spine2_M': 'chest',
    'Spine3_M': 'upperChest',
    'Neck_M': 'neck',
    'Head_M': 'head',
    'Hip_L': 'leftUpperLeg',
    'Knee_L': 'leftLowerLeg',
    'Ankle_L': 'leftFoot',
    'Toes_L': 'leftToes',
    'Hip_R': 'rightUpperLeg',
    'Knee_R': 'rightLowerLeg',
    'Ankle_R': 'rightFoot',
    'Toes_R': 'rightToes',
    'Scapula_L': 'leftShoulder',
    'Shoulder_L': 'leftUpperArm',
    'Elbow_L': 'leftLowerArm',
    'Wrist_L': 'leftHand',
    'Scapula_R': 'rightShoulder',
    'Shoulder_R': 'rightUpperArm',
    'Elbow_R': 'rightLowerArm',
    'Wrist_R': 'rightHand',
    'ThumbFinger1_L': 'leftThumbMetacarpal',
    'ThumbFinger2_L': 'leftThumbProximal',
    'ThumbFinger3_L': 'leftThumbDistal',
    'IndexFinger1_L': 'leftIndexProximal',
    'IndexFinger2_L': 'leftIndexIntermediate',
    'IndexFinger3_L': 'leftIndexDistal',
    'MiddleFinger1_L': 'leftMiddleProximal',
    'MiddleFinger2_L': 'leftMiddleIntermediate',
    'MiddleFinger3_L': 'leftMiddleDistal',
    'RingFinger1_L': 'leftRingProximal',
    'RingFinger2_L': 'leftRingIntermediate',
    'RingFinger3_L': 'leftRingDistal',
    'PinkyFinger1_L': 'leftLittleProximal',
    'PinkyFinger2_L': 'leftLittleIntermediate',
    'PinkyFinger3_L': 'leftLittleDistal',
    'ThumbFinger1_R': 'rightThumbMetacarpal',
    'ThumbFinger2_R': 'rightThumbProximal',
    'ThumbFinger3_R': 'rightThumbDistal',
    'IndexFinger1_R': 'rightIndexProximal',
    'IndexFinger2_R': 'rightIndexIntermediate',
    'IndexFinger3_R': 'rightIndexDistal',
    'MiddleFinger1_R': 'rightMiddleProximal',
    'MiddleFinger2_R': 'rightMiddleIntermediate',
    'MiddleFinger3_R': 'rightMiddleDistal',
    'RingFinger1_R': 'rightRingProximal',
    'RingFinger2_R': 'rightRingIntermediate',
    'RingFinger3_R': 'rightRingDistal',
    'PinkyFinger1_R': 'rightLittleProximal',
    'PinkyFinger2_R': 'rightLittleIntermediate',
    'PinkyFinger3_R': 'rightLittleDistal',
    'Eye_L_parent': 'leftEye',
    'Eye_R_parent': 'rightEye',
    'Jaw': 'jaw',
}

vrm_ext = armature.data.vrm_addon_extension
vrm_ext.spec_version = '1.0'

human_bones = vrm_ext.vrm1.humanoid.human_bones
mapped = 0
for bone_name, vrm_name in BONE_MAP.items():
    if bone_name not in armature.data.bones:
        continue
    if hasattr(human_bones, vrm_name):
        getattr(human_bones, vrm_name).node.bone_name = bone_name
        mapped += 1

print(f"Mapped {mapped} bones to VRM humanoid")

# ---- Step 5: Expressions ----
expressions = vrm_ext.vrm1.expressions

def add_bind(expr_name, mesh_name, shape_key_name, weight=1.0):
    d = expressions.preset.name_to_expression_dict()
    if expr_name not in d:
        return
    bind = d[expr_name].morph_target_binds.add()
    bind.node.mesh_object_name = mesh_name
    bind.index = shape_key_name
    bind.weight = weight

add_bind('blink', 'Head', 'eyeBlinkLeft')
add_bind('blink', 'Head', 'eyeBlinkRight')
add_bind('blinkLeft', 'Head', 'eyeBlinkLeft')
add_bind('blinkRight', 'Head', 'eyeBlinkRight')
add_bind('aa', 'Head', 'jawOpen')
add_bind('ih', 'Head', 'mouthSmileLeft', 0.5)
add_bind('ih', 'Head', 'mouthSmileRight', 0.5)
add_bind('ou', 'Head', 'mouthPucker')
add_bind('ee', 'Head', 'mouthSmileLeft', 0.7)
add_bind('ee', 'Head', 'mouthSmileRight', 0.7)
add_bind('oh', 'Head', 'mouthFunnel')
add_bind('happy', 'Head', 'mouthSmileLeft')
add_bind('happy', 'Head', 'mouthSmileRight')
add_bind('angry', 'Head', 'browDownLeft')
add_bind('angry', 'Head', 'browDownRight')
add_bind('sad', 'Head', 'mouthFrownLeft')
add_bind('sad', 'Head', 'mouthFrownRight')
add_bind('surprised', 'Head', 'eyeWideLeft')
add_bind('surprised', 'Head', 'eyeWideRight')
add_bind('surprised', 'Head', 'jawOpen', 0.5)
print("Expressions configured")

# ---- Step 6: Metadata ----
meta = vrm_ext.vrm1.meta
meta.vrm_name = "Ani"
meta.authors.clear()
author = meta.authors.add()
author.value = "Grok"

# ---- Step 7: Export ----
output = "/Users/delta/claudehack/musiccompanion/vendor/riko_project/server/static/ani.vrm"
bpy.ops.export_scene.vrm(filepath=output)
print(f"\nExported VRM to: {output}")
