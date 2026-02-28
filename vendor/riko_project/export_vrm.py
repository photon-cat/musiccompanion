import bpy

# Enable VRM addon
bpy.ops.preferences.addon_enable(module='VRM_Addon_for_Blender-release')

# ---- Step 1: Clean up - keep only Outfit_05 variant + hair ----
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

to_delete = [obj for obj in bpy.data.objects if obj.name not in KEEP_NAMES]
for obj in reversed(to_delete):
    bpy.data.objects.remove(obj, do_unlink=True)

print(f"Kept {len(bpy.data.objects)} objects after cleanup")

# ---- Step 2: Find the armature ----
armature = None
for obj in bpy.data.objects:
    if obj.type == 'ARMATURE' and 'Ani_Rig' in obj.name:
        armature = obj
        print(f"Found armature: {obj.name}")
        break

if not armature:
    # Try any armature
    for obj in bpy.data.objects:
        if obj.type == 'ARMATURE':
            armature = obj
            print(f"Using armature: {obj.name}")
            break

if not armature:
    print("ERROR: No armature found")
    import sys
    sys.exit(1)

# Ensure armature is linked to scene collection
found_in_scene = False
for col in bpy.data.collections:
    if armature.name in [o.name for o in col.objects]:
        found_in_scene = True
        break

if not found_in_scene:
    bpy.context.scene.collection.objects.link(armature)

# Make sure it's in view layer
bpy.context.view_layer.update()

# Select armature
bpy.ops.object.select_all(action='DESELECT')
armature.select_set(True)
bpy.context.view_layer.objects.active = armature

# ---- Step 3: VRM humanoid bone mapping ----
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
vrm_ext.spec_version = 'VRM_SPEC_VERSION_1_0'

humanoid = vrm_ext.vrm1.humanoid
human_bones = humanoid.human_bones

mapped = 0
for bone_name, vrm_bone_name in BONE_MAP.items():
    if bone_name not in armature.data.bones:
        print(f"  SKIP: bone '{bone_name}' not in armature")
        continue
    if hasattr(human_bones, vrm_bone_name):
        bone_prop = getattr(human_bones, vrm_bone_name)
        bone_prop.node.bone_name = bone_name
        mapped += 1
    else:
        print(f"  SKIP: VRM bone '{vrm_bone_name}' not in addon schema")

print(f"Mapped {mapped} bones")

# ---- Step 4: Set up VRM expressions ----
expressions = vrm_ext.vrm1.expressions

def add_bind(expr_name, mesh_name, shape_key_name, weight=1.0):
    preset_dict = expressions.preset.name_to_expression_dict()
    if expr_name not in preset_dict:
        return
    expr = preset_dict[expr_name]
    bind = expr.morph_target_binds.add()
    bind.node.mesh_object_name = mesh_name
    bind.index = shape_key_name
    bind.weight = weight

# Blink
add_bind('blink', 'Head', 'eyeBlinkLeft')
add_bind('blink', 'Head', 'eyeBlinkRight')
add_bind('blinkLeft', 'Head', 'eyeBlinkLeft')
add_bind('blinkRight', 'Head', 'eyeBlinkRight')

# Mouth for talking
add_bind('aa', 'Head', 'jawOpen')
add_bind('ih', 'Head', 'mouthSmileLeft', 0.5)
add_bind('ih', 'Head', 'mouthSmileRight', 0.5)
add_bind('ou', 'Head', 'mouthPucker')
add_bind('ee', 'Head', 'mouthSmileLeft', 0.7)
add_bind('ee', 'Head', 'mouthSmileRight', 0.7)
add_bind('oh', 'Head', 'mouthFunnel')

# Emotions
add_bind('happy', 'Head', 'mouthSmileLeft')
add_bind('happy', 'Head', 'mouthSmileRight')
add_bind('angry', 'Head', 'browDownLeft')
add_bind('angry', 'Head', 'browDownRight')
add_bind('sad', 'Head', 'mouthFrownLeft')
add_bind('sad', 'Head', 'mouthFrownRight')
add_bind('surprised', 'Head', 'eyeWideLeft')
add_bind('surprised', 'Head', 'eyeWideRight')
add_bind('surprised', 'Head', 'jawOpen', 0.5)

# Look directions
add_bind('lookUp', 'Head', 'eyeLookUpLeft')
add_bind('lookUp', 'Head', 'eyeLookUpRight')
add_bind('lookDown', 'Head', 'eyeLookDownLeft')
add_bind('lookDown', 'Head', 'eyeLookDownRight')
add_bind('lookLeft', 'Head', 'eyeLookOutLeft')
add_bind('lookLeft', 'Head', 'eyeLookInRight')
add_bind('lookRight', 'Head', 'eyeLookInLeft')
add_bind('lookRight', 'Head', 'eyeLookOutRight')

print("Expressions configured")

# ---- Step 5: VRM metadata ----
meta = vrm_ext.vrm1.meta
meta.vrm_name = "Ani"
meta.authors.clear()
author = meta.authors.add()
author.value = "Grok"

# ---- Step 6: Export VRM ----
output_path = "/Users/delta/claudehack/musiccompanion/vendor/riko_project/server/static/ani.vrm"

bpy.ops.export_scene.vrm(filepath=output_path)

print(f"\nExported VRM to: {output_path}")
