import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';

const container = document.getElementById('avatar-panel');
const loadingOverlay = document.getElementById('loading-overlay');
const avatarLabel = document.getElementById('avatar-label');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.insertBefore(renderer.domElement, container.firstChild);

const camera = new THREE.PerspectiveCamera(25, container.clientWidth / container.clientHeight, 0.1, 100.0);
camera.position.set(0.0, 1.3, 3.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.screenSpacePanning = true;
controls.target.set(0.0, 1.0, 0.0);
controls.enablePan = false;
controls.minDistance = 1.0;
controls.maxDistance = 10;
controls.update();

const scene = new THREE.Scene();

const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
scene.add(ambientLight);
const mainLight = new THREE.DirectionalLight(0xffffff, 1.0);
mainLight.position.set(0, 1, 2);
scene.add(mainLight);
renderer.toneMappingExposure = 0.9;

// Settings controls
document.querySelectorAll('#settings-panel input').forEach(input => {
  const valSpan = input.parentElement.querySelector('.val');
  input.addEventListener('input', () => {
    valSpan.textContent = parseFloat(input.value).toFixed(1);
    const id = input.id;
    if (id === 's-ambient') ambientLight.intensity = parseFloat(input.value);
    if (id === 's-direct') mainLight.intensity = parseFloat(input.value);
    if (id === 's-exposure') renderer.toneMappingExposure = parseFloat(input.value);
  });
});

const groundGeo = new THREE.CircleGeometry(0.8, 32);
const groundMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0.01;
scene.add(ground);

// ---- State ----
let currentModel = null;
let currentVrm = null;
let mixer = null;
let activeModelName = null;
let currentAction = null;
let currentAnimName = 'idle_loop';
let idleTime = 0;

const MODELS = {
  urusa: { url: '/static/models/urusa.glb', type: 'vrm', label: 'Urusa' },
};

const VRMA_ANIMS = {
  idle_loop: { url: '/static/vrma/idle_loop.vrma',           loop: true },
  VRMA_01:   { url: '/static/vrma/VRMA_01.vrma',             loop: false },
  VRMA_02:   { url: '/static/vrma/VRMA_02.vrma',             loop: false },
  VRMA_03:   { url: '/static/vrma/VRMA_03.vrma',             loop: false },
  VRMA_04:   { url: '/static/vrma/VRMA_04.vrma',             loop: false },
  VRMA_05:   { url: '/static/vrma/VRMA_05.vrma',             loop: false },
  VRMA_06:   { url: '/static/vrma/VRMA_06.vrma',             loop: false },
  VRMA_07:   { url: '/static/vrma/VRMA_07.vrma',             loop: false },
  appearing: { url: '/static/vrma/appearing-7KKFBBJ2.vrma',  loop: false },
  waiting:   { url: '/static/vrma/waiting-I3CZ3FBD.vrma',    loop: true },
  liked:     { url: '/static/vrma/liked-JMZZ3B47.vrma',      loop: false },
};

const animCache = {};

async function loadVRMA(url) {
  if (animCache[url]) return animCache[url];
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => {
      const vrmAnim = gltf.userData.vrmAnimations?.[0];
      if (vrmAnim) {
        animCache[url] = vrmAnim;
        resolve(vrmAnim);
      } else {
        reject(new Error('No VRMAnimation in ' + url));
      }
    }, undefined, reject);
  });
}

async function playVRMAnim(animName) {
  if (!currentVrm) return;
  const animDef = VRMA_ANIMS[animName];
  if (!animDef) { console.warn('Unknown anim:', animName); return; }

  try {
    const vrmAnim = await loadVRMA(animDef.url);
    const clip = createVRMAnimationClip(vrmAnim, currentVrm);

    if (!mixer) mixer = new THREE.AnimationMixer(currentVrm.scene);

    const newAction = mixer.clipAction(clip);
    newAction.setLoop(animDef.loop ? THREE.LoopRepeat : THREE.LoopOnce);
    if (!animDef.loop) newAction.clampWhenFinished = true;

    if (currentAction) {
      newAction.reset().play();
      currentAction.crossFadeTo(newAction, 0.35, true);
    } else {
      newAction.reset().play();
    }

    if (!animDef.loop) {
      const onFinished = (e) => {
        if (e.action === newAction) {
          mixer.removeEventListener('finished', onFinished);
          window.switchAnim('idle_loop');
        }
      };
      mixer.addEventListener('finished', onFinished);
    }

    currentAction = newAction;
    currentAnimName = animName;
  } catch (err) {
    console.error('Anim load failed:', animName, err);
  }
}

// ---- Model loading ----
function clearCurrentModel() {
  if (currentModel) {
    scene.remove(currentModel);
    currentModel = null;
  }
  if (mixer) {
    mixer.stopAllAction();
    mixer = null;
  }
  currentVrm = null;
  currentAction = null;
  idleTime = 0;
}

function loadModel(name) {
  if (activeModelName === name) return;
  activeModelName = name;
  const modelDef = MODELS[name];

  clearCurrentModel();
  loadingOverlay.style.display = 'flex';
  loadingOverlay.querySelector('div:last-child').textContent = `Loading ${modelDef.label}...`;
  avatarLabel.textContent = modelDef.label;

  document.querySelectorAll('#model-switcher button').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.toLowerCase() === name);
  });

  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));

  loader.load(
    modelDef.url,
    async (gltf) => {
      if (activeModelName !== name) return;

      const vrm = gltf.userData.vrm;

      if (vrm) {
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.combineMorphs(vrm);
        vrm.scene.traverse((obj) => { obj.frustumCulled = false; });
        vrm.scene.rotation.y = Math.PI;

        currentVrm = vrm;
        currentModel = vrm.scene;
        scene.add(currentModel);

        await new Promise(r => setTimeout(r, 100));
        const posedBox = new THREE.Box3().setFromObject(currentModel);
        const posedCenter = posedBox.getCenter(new THREE.Vector3());
        controls.target.set(posedCenter.x, posedCenter.y + 0.1, posedCenter.z);
        camera.position.set(posedCenter.x, posedCenter.y + 0.1, posedCenter.z + 3.5);
        controls.update();

        await playVRMAnim('idle_loop');
      } else {
        currentModel = gltf.scene;
        const box = new THREE.Box3().setFromObject(currentModel);
        const size = box.getSize(new THREE.Vector3());
        const scale = 2.0 / size.y;
        currentModel.scale.setScalar(scale);

        const scaledBox = new THREE.Box3().setFromObject(currentModel);
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        currentModel.position.x -= scaledCenter.x;
        currentModel.position.z -= scaledCenter.z;
        currentModel.position.y -= scaledBox.min.y;

        const finalBox = new THREE.Box3().setFromObject(currentModel);
        const finalCenter = finalBox.getCenter(new THREE.Vector3());
        controls.target.copy(finalCenter);
        camera.position.set(0, finalCenter.y, 3.5);
        controls.update();

        currentModel.traverse((obj) => { obj.frustumCulled = false; });
        scene.add(currentModel);

        if (gltf.animations?.length > 0) {
          mixer = new THREE.AnimationMixer(currentModel);
          mixer.clipAction(gltf.animations[0]).play();
        }
      }

      loadingOverlay.style.display = 'none';
    },
    (progress) => {
      if (progress.total > 0) {
        const pct = Math.round(100 * (progress.loaded / progress.total));
        loadingOverlay.querySelector('div:last-child').textContent = `Loading ${modelDef.label}... ${pct}%`;
      }
    },
    (error) => {
      console.error('Model load error:', error);
      loadingOverlay.querySelector('div:last-child').textContent = 'Failed to load model';
    }
  );
}

// ---- Global API ----
window.switchModel = function(name) { loadModel(name); };

window.switchAnim = function(name) {
  currentAnimName = name;
  document.querySelectorAll('#anim-switcher button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.anim === name);
  });
  playVRMAnim(name);
};

let talkingUntil = 0;
window.triggerTalkingAnimation = function() {
  talkingUntil = performance.now() + 2000;
};

// Expression control for tool calling
let expressionOverride = null;
let expressionOverrideUntil = 0;

window.setAvatarExpression = function(expression, intensity = 0.6) {
  expressionOverride = { expression, intensity };
  expressionOverrideUntil = performance.now() + 4000;
};

function trySetExpression(name, value) {
  if (!currentVrm?.expressionManager) return;
  try { currentVrm.expressionManager.setValue(name, value); } catch(e) {}
}

// ---- Export for music module ----
export function getCurrentVrm() { return currentVrm; }
export { trySetExpression };

// ---- Render loop ----
let blinkTimer = 0;
let nextBlink = 2 + Math.random() * 3;
let blinkPhase = -1;
const BLINK_CLOSE_DUR = 0.06;
const BLINK_HOLD_DUR  = 0.04;
const BLINK_OPEN_DUR  = 0.12;
const BLINK_TOTAL = BLINK_CLOSE_DUR + BLINK_HOLD_DUR + BLINK_OPEN_DUR;

function getBlinkValue(phase) {
  if (phase < 0) return 0;
  if (phase < BLINK_CLOSE_DUR) {
    const t = phase / BLINK_CLOSE_DUR;
    return t * t;
  }
  if (phase < BLINK_CLOSE_DUR + BLINK_HOLD_DUR) return 1;
  const t = (phase - BLINK_CLOSE_DUR - BLINK_HOLD_DUR) / BLINK_OPEN_DUR;
  const inv = 1 - t;
  return inv * inv;
}

const clock = new THREE.Clock();
clock.start();

// Import music state checker (set by music module)
let getMusicState = () => ({ active: false });
export function setMusicStateGetter(fn) { getMusicState = fn; }

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  idleTime += delta;

  if (mixer) mixer.update(delta);

  if (currentVrm) {
    const musicState = getMusicState();

    if (musicState.active && musicState.script && !musicState.paused) {
      const t = musicState.currentTime;
      const directive = musicState.getDirective(t);

      if (directive) {
        musicState.applyDirective(directive, t, currentVrm);
        musicState.applyExpression(directive, currentVrm, trySetExpression);
        musicState.updateUI(t);
      }

      currentVrm.update(delta);
    } else {
      // NORMAL MODE — blinking + talking
      blinkTimer += delta;
      if (blinkPhase >= 0) {
        blinkPhase += delta;
        if (blinkPhase >= BLINK_TOTAL) {
          blinkPhase = -1;
          trySetExpression('blink', 0);
        } else {
          trySetExpression('blink', getBlinkValue(blinkPhase));
        }
      } else if (blinkTimer > nextBlink) {
        blinkTimer = 0;
        nextBlink = 2.5 + Math.random() * 4;
        blinkPhase = 0;
        if (Math.random() < 0.2) nextBlink = 0.3;
      }

      if (performance.now() < talkingUntil) {
        const talkPhase = performance.now() * 0.008;
        trySetExpression('aa', Math.abs(Math.sin(talkPhase)) * 0.4);
      } else {
        trySetExpression('aa', 0);
      }

      // Expression override from tool calls
      if (expressionOverride && performance.now() < expressionOverrideUntil) {
        const { expression, intensity } = expressionOverride;
        const exprMap = {
          'happy':     { happy: 1.0 },
          'sad':       { sad: 1.0 },
          'angry':     { angry: 1.0 },
          'surprised': { surprised: 1.0 },
          'relaxed':   { relaxed: 1.0 },
          'neutral':   {},
        };
        ['happy', 'sad', 'angry', 'surprised', 'relaxed'].forEach(e => trySetExpression(e, 0));
        const vals = exprMap[expression] || {};
        for (const [name, val] of Object.entries(vals)) {
          trySetExpression(name, val * intensity);
        }
      } else if (expressionOverride && performance.now() >= expressionOverrideUntil) {
        ['happy', 'sad', 'angry', 'surprised', 'relaxed'].forEach(e => trySetExpression(e, 0));
        expressionOverride = null;
      }

      // Update scrubber if music paused but session still active
      if (musicState.active && musicState.paused) {
        musicState.updateUI(musicState.currentTime);
      }

      currentVrm.update(delta);
    }
  }

  renderer.render(scene, camera);
}

animate();

// Resize
window.addEventListener('resize', () => {
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

// Load default model
loadModel('urusa');
