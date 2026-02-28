"use client";

import { useEffect, useRef, useCallback, useState, MutableRefObject } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from "@pixiv/three-vrm-animation";
import type { VRM } from "@pixiv/three-vrm";
import type { VRMAnimation } from "@pixiv/three-vrm-animation";
import styles from "./AvatarPanel.module.css";
import { MODELS, VRMA_ANIMS, ANIM_LABELS, type ModelName } from "@/lib/constants";
import { getInterpolatedDirective, getTempoAt, getMusicExpressionValues, type MusicScript } from "@/lib/music";
import type { AvatarControls } from "./Workbench";

interface AvatarPanelProps {
  controlsRef: MutableRefObject<AvatarControls | null>;
  musicScript: MusicScript | null;
  musicActive: boolean;
  audioRef: MutableRefObject<HTMLAudioElement | null>;
}

export default function AvatarPanel({ controlsRef, musicScript, musicActive, audioRef }: AvatarPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orbitRef = useRef<OrbitControls | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);
  const activeModelRef = useRef<string | null>(null);
  const animCacheRef = useRef<Record<string, VRMAnimation>>({});
  const ambientRef = useRef<THREE.AmbientLight | null>(null);
  const mainLightRef = useRef<THREE.DirectionalLight | null>(null);

  const [activeModel, setActiveModel] = useState<ModelName>("urusa");
  const [activeAnim, setActiveAnim] = useState("idle_loop");
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState("Loading model...");
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Expression override state
  const expressionOverrideRef = useRef<{ expression: string; intensity: number } | null>(null);
  const expressionOverrideUntilRef = useRef(0);
  const talkingUntilRef = useRef(0);

  // Blink state
  const blinkTimerRef = useRef(0);
  const nextBlinkRef = useRef(2 + Math.random() * 3);
  const blinkPhaseRef = useRef(-1);

  const BLINK_CLOSE = 0.06;
  const BLINK_HOLD = 0.04;
  const BLINK_OPEN = 0.12;
  const BLINK_TOTAL = BLINK_CLOSE + BLINK_HOLD + BLINK_OPEN;

  function getBlinkValue(phase: number): number {
    if (phase < 0) return 0;
    if (phase < BLINK_CLOSE) { const t = phase / BLINK_CLOSE; return t * t; }
    if (phase < BLINK_CLOSE + BLINK_HOLD) return 1;
    const t = (phase - BLINK_CLOSE - BLINK_HOLD) / BLINK_OPEN;
    const inv = 1 - t;
    return inv * inv;
  }

  function trySetExpression(name: string, value: number) {
    const vrm = vrmRef.current;
    if (!vrm?.expressionManager) return;
    try { vrm.expressionManager.setValue(name, value); } catch {}
  }

  // Load VRMA animation
  const loadVRMA = useCallback(async (url: string): Promise<VRMAnimation> => {
    if (animCacheRef.current[url]) return animCacheRef.current[url];
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
    return new Promise((resolve, reject) => {
      loader.load(url, (gltf) => {
        const anim = gltf.userData.vrmAnimations?.[0];
        if (anim) { animCacheRef.current[url] = anim; resolve(anim); }
        else reject(new Error("No VRMAnimation in " + url));
      }, undefined, reject);
    });
  }, []);

  // Play VRMA animation
  const playVRMAnim = useCallback(async (animName: string) => {
    const vrm = vrmRef.current;
    if (!vrm) return;
    const animDef = VRMA_ANIMS[animName];
    if (!animDef) return;

    try {
      const vrmAnim = await loadVRMA(animDef.url);
      const clip = createVRMAnimationClip(vrmAnim, vrm);
      if (!mixerRef.current) mixerRef.current = new THREE.AnimationMixer(vrm.scene);

      const newAction = mixerRef.current.clipAction(clip);
      newAction.setLoop(animDef.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      if (!animDef.loop) newAction.clampWhenFinished = true;

      if (currentActionRef.current) {
        newAction.reset().play();
        currentActionRef.current.crossFadeTo(newAction, 0.35, true);
      } else {
        newAction.reset().play();
      }

      if (!animDef.loop) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const onFinished = (e: any) => {
          if (e.action === newAction) {
            mixerRef.current?.removeEventListener("finished", onFinished);
            switchAnim("idle_loop");
          }
        };
        mixerRef.current.addEventListener("finished", onFinished);
      }

      currentActionRef.current = newAction;
    } catch (err) {
      console.error("Anim load failed:", animName, err);
    }
  }, [loadVRMA]);

  const switchAnim = useCallback((name: string) => {
    setActiveAnim(name);
    playVRMAnim(name);
  }, [playVRMAnim]);

  // Load model
  const loadModel = useCallback((name: ModelName) => {
    if (activeModelRef.current === name) return;
    activeModelRef.current = name;
    const modelDef = MODELS[name];

    // Clear current
    if (modelRef.current && sceneRef.current) sceneRef.current.remove(modelRef.current);
    if (mixerRef.current) { mixerRef.current.stopAllAction(); mixerRef.current = null; }
    vrmRef.current = null;
    currentActionRef.current = null;

    setLoading(true);
    setLoadingText(`Loading ${modelDef.label}...`);
    setActiveModel(name);

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      modelDef.url,
      async (gltf) => {
        if (activeModelRef.current !== name) return;
        const vrm = gltf.userData.vrm as VRM | undefined;

        if (vrm) {
          VRMUtils.removeUnnecessaryVertices(gltf.scene);
          VRMUtils.combineSkeletons(gltf.scene);
          VRMUtils.combineMorphs(vrm);
          vrm.scene.traverse((obj) => { obj.frustumCulled = false; });
          vrm.scene.rotation.y = Math.PI;

          vrmRef.current = vrm;
          modelRef.current = vrm.scene;
          sceneRef.current!.add(vrm.scene);

          await new Promise(r => setTimeout(r, 100));
          const box = new THREE.Box3().setFromObject(vrm.scene);
          const center = box.getCenter(new THREE.Vector3());
          orbitRef.current!.target.set(center.x, center.y + 0.1, center.z);
          cameraRef.current!.position.set(center.x, center.y + 0.1, center.z + 3.5);
          orbitRef.current!.update();

          await playVRMAnim("idle_loop");
        } else {
          modelRef.current = gltf.scene;
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const size = box.getSize(new THREE.Vector3());
          const scale = 2.0 / size.y;
          gltf.scene.scale.setScalar(scale);
          const scaledBox = new THREE.Box3().setFromObject(gltf.scene);
          const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
          gltf.scene.position.x -= scaledCenter.x;
          gltf.scene.position.z -= scaledCenter.z;
          gltf.scene.position.y -= scaledBox.min.y;
          gltf.scene.traverse((obj) => { obj.frustumCulled = false; });
          sceneRef.current!.add(gltf.scene);

          const fc = new THREE.Box3().setFromObject(gltf.scene).getCenter(new THREE.Vector3());
          orbitRef.current!.target.copy(fc);
          cameraRef.current!.position.set(0, fc.y, 3.5);
          orbitRef.current!.update();

          if (gltf.animations?.length) {
            mixerRef.current = new THREE.AnimationMixer(gltf.scene);
            mixerRef.current.clipAction(gltf.animations[0]).play();
          }
        }
        setLoading(false);
      },
      (progress) => {
        if (progress.total > 0) {
          const pct = Math.round(100 * (progress.loaded / progress.total));
          setLoadingText(`Loading ${modelDef.label}... ${pct}%`);
        }
      },
      (error) => {
        console.error("Model load error:", error);
        setLoadingText("Failed to load model");
      }
    );
  }, [playVRMAnim]);

  // Register controls for parent
  useEffect(() => {
    controlsRef.current = {
      switchAnim,
      setExpression: (expression: string, intensity = 0.6) => {
        expressionOverrideRef.current = { expression, intensity };
        expressionOverrideUntilRef.current = performance.now() + 4000;
      },
      triggerTalking: () => { talkingUntilRef.current = performance.now() + 2000; },
    };
  }, [controlsRef, switchAnim]);

  // Initialize Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setClearColor(0x151515);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMappingExposure = 0.9;
    container.insertBefore(renderer.domElement, container.firstChild);
    rendererRef.current = renderer;

    const camera = new THREE.PerspectiveCamera(25, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 1.3, 3.5);
    cameraRef.current = camera;

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.screenSpacePanning = true;
    orbit.target.set(0, 1, 0);
    orbit.enablePan = false;
    orbit.minDistance = 1;
    orbit.maxDistance = 10;
    orbit.update();
    orbitRef.current = orbit;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const ambient = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambient);
    ambientRef.current = ambient;

    const directional = new THREE.DirectionalLight(0xffffff, 1.0);
    directional.position.set(0, 1, 2);
    scene.add(directional);
    mainLightRef.current = directional;

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(0.8, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.01;
    scene.add(ground);

    // Load default model
    loadModel("urusa");

    // Render loop
    const clock = new THREE.Clock();
    let animId: number;

    function animate() {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      if (mixerRef.current) mixerRef.current.update(delta);

      const vrm = vrmRef.current;
      if (vrm) {
        const audio = audioRef.current;
        const isPlaying = musicActive && musicScript && audio && !audio.paused;

        if (isPlaying) {
          const t = audio!.currentTime;
          const directive = getInterpolatedDirective(musicScript!, t);
          if (directive) {
            // Apply procedural motion
            applyMusicMotion(vrm, directive, t, musicScript!);
            // Apply expression
            const expVals = getMusicExpressionValues(directive.expression, directive.intensity);
            for (const [name, val] of Object.entries(expVals)) trySetExpression(name, val);
            if (directive.eye_state === "half_closed") trySetExpression("blink", 0.3);
            else if (directive.eye_state === "wide") { trySetExpression("blink", 0); trySetExpression("surprised", 0.25); }
          }
        } else {
          // Normal blink
          blinkTimerRef.current += delta;
          if (blinkPhaseRef.current >= 0) {
            blinkPhaseRef.current += delta;
            if (blinkPhaseRef.current >= BLINK_TOTAL) {
              blinkPhaseRef.current = -1;
              trySetExpression("blink", 0);
            } else {
              trySetExpression("blink", getBlinkValue(blinkPhaseRef.current));
            }
          } else if (blinkTimerRef.current > nextBlinkRef.current) {
            blinkTimerRef.current = 0;
            nextBlinkRef.current = 2.5 + Math.random() * 4;
            blinkPhaseRef.current = 0;
            if (Math.random() < 0.2) nextBlinkRef.current = 0.3;
          }

          // Talking
          if (performance.now() < talkingUntilRef.current) {
            const tp = performance.now() * 0.008;
            trySetExpression("aa", Math.abs(Math.sin(tp)) * 0.4);
          } else {
            trySetExpression("aa", 0);
          }

          // Expression override
          const eo = expressionOverrideRef.current;
          if (eo && performance.now() < expressionOverrideUntilRef.current) {
            const exprMap: Record<string, Record<string, number>> = {
              happy: { happy: 1 }, sad: { sad: 1 }, angry: { angry: 1 },
              surprised: { surprised: 1 }, relaxed: { relaxed: 1 }, neutral: {},
            };
            ["happy", "sad", "angry", "surprised", "relaxed"].forEach(e => trySetExpression(e, 0));
            const vals = exprMap[eo.expression] || {};
            for (const [n, v] of Object.entries(vals)) trySetExpression(n, v * eo.intensity);
          } else if (eo && performance.now() >= expressionOverrideUntilRef.current) {
            ["happy", "sad", "angry", "surprised", "relaxed"].forEach(e => trySetExpression(e, 0));
            expressionOverrideRef.current = null;
          }
        }

        vrm.update(delta);
      }

      renderer.render(scene, camera);
    }

    animate();

    // Resize
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      renderer.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-apply music state changes to the render loop via refs (musicActive/musicScript)
  // The render loop reads these from the closure via the props passed in.
  // We need to keep fresh refs for the animate loop.
  const musicActiveRef = useRef(musicActive);
  const musicScriptRef = useRef(musicScript);
  useEffect(() => { musicActiveRef.current = musicActive; }, [musicActive]);
  useEffect(() => { musicScriptRef.current = musicScript; }, [musicScript]);

  function applyMusicMotion(vrm: VRM, directive: { intensity: number; head_bob: number; sway_amount: number; pose: string }, t: number, script: MusicScript) {
    if (!vrm.humanoid) return;
    const { intensity, head_bob, sway_amount, pose } = directive;
    const bpm = getTempoAt(script, t);
    const beatFreq = bpm / 60;

    const head = vrm.humanoid.getRawBoneNode("head");
    const spine = vrm.humanoid.getRawBoneNode("spine");
    const chest = vrm.humanoid.getRawBoneNode("chest");
    const hips = vrm.humanoid.getRawBoneNode("hips");
    const leftArm = vrm.humanoid.getRawBoneNode("leftUpperArm");
    const rightArm = vrm.humanoid.getRawBoneNode("rightUpperArm");

    if (head) {
      head.rotation.x += Math.sin(t * beatFreq * Math.PI * 2) * head_bob * 0.12;
      head.rotation.z += Math.sin(t * beatFreq * Math.PI) * head_bob * 0.03;
    }
    if (spine) spine.rotation.z += Math.sin(t * beatFreq * Math.PI) * sway_amount * 0.08;

    if (pose === "dancing" || pose === "energetic") {
      if (hips) hips.position.y += Math.abs(Math.sin(t * beatFreq * Math.PI * 2)) * intensity * 0.02;
      if (leftArm) leftArm.rotation.z += Math.sin(t * beatFreq * Math.PI) * intensity * 0.12;
      if (rightArm) rightArm.rotation.z -= Math.sin(t * beatFreq * Math.PI) * intensity * 0.12;
      if (chest) chest.rotation.y += Math.sin(t * beatFreq * Math.PI * 0.5) * intensity * 0.04;
    }
    if (pose === "dramatic") {
      if (chest) chest.rotation.z += Math.sin(t * beatFreq * Math.PI * 0.5) * intensity * 0.06;
      if (head) head.rotation.y += Math.sin(t * beatFreq * Math.PI * 0.25) * intensity * 0.06;
    }
    if (pose === "nodding" && head) {
      head.rotation.x += Math.sin(t * beatFreq * Math.PI * 2) * head_bob * 0.06;
    }
    if ((pose === "winding_down" || pose === "winding down") && spine) {
      spine.rotation.z += Math.sin(t * 0.5) * sway_amount * 0.04;
    }
  }

  const handleSettingChange = useCallback((id: string, value: number) => {
    if (id === "s-ambient" && ambientRef.current) ambientRef.current.intensity = value;
    if (id === "s-direct" && mainLightRef.current) mainLightRef.current.intensity = value;
    if (id === "s-exposure" && rendererRef.current) rendererRef.current.toneMappingExposure = value;
  }, []);

  return (
    <div ref={containerRef} className={styles.container}>
      {/* Model Switcher */}
      <div className={styles.modelSwitcher}>
        {(Object.keys(MODELS) as ModelName[]).map((key) => (
          <button
            key={key}
            className={activeModel === key ? styles.active : ""}
            onClick={() => loadModel(key)}
          >
            {MODELS[key].label}
          </button>
        ))}
      </div>

      {/* Loading Overlay */}
      {loading && (
        <div className={styles.loadingOverlay}>
          <div className={styles.spinner} />
          <div>{loadingText}</div>
        </div>
      )}

      {/* Animation Switcher */}
      <div className={styles.animSwitcher} style={musicActive ? { opacity: 0.2, pointerEvents: "none" } : undefined}>
        {ANIM_LABELS.map(({ key, label }) => (
          <button
            key={key}
            className={activeAnim === key ? styles.active : ""}
            onClick={() => switchAnim(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Settings */}
      <button className={styles.settingsToggle} onClick={() => setSettingsOpen(!settingsOpen)}>
        &#9881;
      </button>
      {settingsOpen && (
        <div className={styles.settingsPanel}>
          {[
            { id: "s-ambient", label: "Ambient", min: 0, max: 3, step: 0.1, def: 1.0 },
            { id: "s-direct", label: "Direct", min: 0, max: 3, step: 0.1, def: 1.0 },
            { id: "s-exposure", label: "Exposure", min: 0.5, max: 2, step: 0.05, def: 0.9 },
          ].map(({ id, label, min, max, step, def }) => (
            <label key={id}>
              {label}
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                defaultValue={def}
                onChange={(e) => handleSettingChange(id, parseFloat(e.target.value))}
              />
            </label>
          ))}
        </div>
      )}

      {/* Avatar Label */}
      <div className={styles.avatarLabel}>{MODELS[activeModel].label}</div>
    </div>
  );
}
