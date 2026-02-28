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
import type { FaceState } from "@/hooks/useFaceTrack";

interface AvatarPanelProps {
  controlsRef: MutableRefObject<AvatarControls | null>;
  musicScript: MusicScript | null;
  musicActive: boolean;
  audioRef: MutableRefObject<HTMLAudioElement | null>;
  faceState: FaceState | null;
  faceActive: boolean;
  onStartFaceTrack: () => void;
  onStopFaceTrack: () => void;
}

export default function AvatarPanel({ controlsRef, musicScript, musicActive, audioRef, faceState, faceActive, onStartFaceTrack, onStopFaceTrack }: AvatarPanelProps) {
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
  const [beatPulse, setBeatPulse] = useState(true);
  const baseCameraZRef = useRef(3.5);

  // Rest pose for procedural dance (captured after model load)
  const restPoseRef = useRef<Record<string, { rx: number; ry: number; rz: number; py?: number }>>({});

  // Scripted choreography cues for music playback
  interface MusicCue {
    t: number;
    anim?: string;
    expression?: string;
    expressionIntensity?: number;
    expressionDuration?: number;
  }
  const musicCuesRef = useRef<MusicCue[]>([]);
  const nextCueRef = useRef(0);
  const switchAnimRef = useRef<(name: string) => void>(() => {});
  const beatPulseRef = useRef(true);

  // Expression override state
  const expressionOverrideRef = useRef<{ expression: string; intensity: number } | null>(null);
  const expressionOverrideUntilRef = useRef(0);
  const talkingUntilRef = useRef(0);

  // Wink cue state
  const winkPhaseRef = useRef(-1);

  // Stable refs for face track callbacks
  const faceTrackStartRef = useRef(onStartFaceTrack);
  const faceTrackStopRef = useRef(onStopFaceTrack);
  useEffect(() => { faceTrackStartRef.current = onStartFaceTrack; }, [onStartFaceTrack]);
  useEffect(() => { faceTrackStopRef.current = onStopFaceTrack; }, [onStopFaceTrack]);

  // Face tracking ref (kept fresh for render loop)
  const faceStateRef = useRef<FaceState | null>(null);
  const faceActiveRef = useRef(false);
  useEffect(() => { faceStateRef.current = faceState; }, [faceState]);
  useEffect(() => { faceActiveRef.current = faceActive; }, [faceActive]);

  // Idle expression system — subtle ambient emotes to stay natural
  const idleExprTimerRef = useRef(0);
  const nextIdleExprRef = useRef(3 + Math.random() * 4);
  const idleExprRef = useRef<{ name: string; intensity: number; duration: number; elapsed: number } | null>(null);
  const IDLE_EXPRESSIONS = [
    { name: "happy", intensity: 0.15, duration: 3.0 },
    { name: "happy", intensity: 0.25, duration: 2.5 },
    { name: "relaxed", intensity: 0.3, duration: 4.0 },
    { name: "relaxed", intensity: 0.2, duration: 3.0 },
    { name: "surprised", intensity: 0.08, duration: 1.2 },
  ];

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
    console.log(`[anim] playVRMAnim("${animName}") vrm=${!!vrm} mixer=${!!mixerRef.current}`);
    if (!vrm) { console.warn("[anim] No VRM loaded, skipping"); return; }
    const animDef = VRMA_ANIMS[animName];
    if (!animDef) { console.warn(`[anim] Unknown anim: ${animName}`); return; }

    try {
      const vrmAnim = await loadVRMA(animDef.url);
      const clip = createVRMAnimationClip(vrmAnim, vrm);
      if (!mixerRef.current) mixerRef.current = new THREE.AnimationMixer(vrm.scene);

      // Stop all current actions to avoid conflicts
      const prevAction = currentActionRef.current;
      if (prevAction) {
        prevAction.fadeOut(0.35);
      }

      const newAction = mixerRef.current.clipAction(clip);
      newAction.setLoop(animDef.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      if (!animDef.loop) newAction.clampWhenFinished = true;
      newAction.reset().fadeIn(0.35).play();

      if (!animDef.loop) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const onFinished = (e: any) => {
          if (e.action === newAction) {
            mixerRef.current?.removeEventListener("finished", onFinished);
            // Play idle directly via ref to avoid stale closure
            playIdleRef.current();
          }
        };
        mixerRef.current.addEventListener("finished", onFinished);
      }

      currentActionRef.current = newAction;
      console.log(`[anim] Playing ${animName} (loop=${animDef.loop})`);
    } catch (err) {
      console.error("[anim] Load failed:", animName, err);
    }
  }, [loadVRMA]);

  const switchAnim = useCallback((name: string) => {
    console.log(`[anim] switchAnim("${name}")`);
    setActiveAnim(name);
    playVRMAnim(name);
  }, [playVRMAnim]);

  // Stable ref for idle callback to avoid stale closures in onFinished
  const playIdleRef = useRef(() => {});
  useEffect(() => {
    playIdleRef.current = () => switchAnim("idle_loop");
    switchAnimRef.current = switchAnim;
  }, [switchAnim]);

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

          // Capture rest pose for procedural dance
          if (vrm.humanoid) {
            const boneNames = ["head", "spine", "chest", "hips", "leftUpperArm", "rightUpperArm", "leftLowerArm", "rightLowerArm", "leftShoulder", "rightShoulder"];
            const rest: Record<string, { rx: number; ry: number; rz: number; py?: number }> = {};
            for (const name of boneNames) {
              const bone = vrm.humanoid.getRawBoneNode(name as any);
              if (bone) {
                rest[name] = { rx: bone.rotation.x, ry: bone.rotation.y, rz: bone.rotation.z };
                if (name === "hips") rest[name].py = bone.position.y;
              }
            }
            restPoseRef.current = rest;
          }

          await new Promise(r => setTimeout(r, 100));
          const box = new THREE.Box3().setFromObject(vrm.scene);
          const center = box.getCenter(new THREE.Vector3());
          orbitRef.current!.target.set(center.x, center.y + 0.1, center.z);
          cameraRef.current!.position.set(center.x, center.y + 0.1, center.z + 3.5);
          baseCameraZRef.current = center.z + 3.5;
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
    console.log("[avatar] Registering controls, switchAnim ref updated");
    controlsRef.current = {
      switchAnim,
      setExpression: (expression: string, intensity = 0.6) => {
        expressionOverrideRef.current = { expression, intensity };
        expressionOverrideUntilRef.current = performance.now() + 4000;
      },
      triggerTalking: () => { talkingUntilRef.current = performance.now() + 4000; },
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
      const audio = audioRef.current;
      const mActive = musicActiveRef.current;
      const isPlaying = mActive && audio && !audio.paused;

      if (vrm) {
        if (isPlaying) {
          const t = audio!.currentTime;
          // Fire scripted choreography cues
          const cues = musicCuesRef.current;
          while (nextCueRef.current < cues.length && cues[nextCueRef.current].t <= t) {
            const cue = cues[nextCueRef.current];
            if (cue.anim) switchAnimRef.current(cue.anim);
            if (cue.expression) {
              expressionOverrideRef.current = { expression: cue.expression, intensity: cue.expressionIntensity ?? 0.7 };
              expressionOverrideUntilRef.current = performance.now() + (cue.expressionDuration ?? 4) * 1000;
            }
            nextCueRef.current++;
          }
          // Beat-synced camera pulse (zoom in/out)
          if (beatPulseRef.current && cameraRef.current) {
            const mScript = musicScriptRef.current;
            const bpm = mScript ? getTempoAt(mScript, t) : 120;
            const beatFreq = bpm / 60;
            const beat = t * beatFreq;
            const pulse = Math.pow(Math.abs(Math.sin(beat * Math.PI)), 2.0);
            const baseZ = baseCameraZRef.current;
            cameraRef.current.position.z = baseZ - pulse * 0.15;
          }
        } else {
          // Reset camera when not playing
          if (cameraRef.current) {
            cameraRef.current.position.z = baseCameraZRef.current;
          }
          const fs = faceStateRef.current;
          const ftActive = faceActiveRef.current && fs;

          if (ftActive) {
            // --- Face tracking drives avatar expressions ---
            trySetExpression("blink", (fs.blinkL + fs.blinkR) / 2);
            trySetExpression("happy", Math.max(0, fs.smile * 1.5));
            trySetExpression("aa", fs.jawOpen);
            trySetExpression("surprised", fs.browUp > 0.3 ? fs.browUp * 0.8 : 0);
            trySetExpression("ee", fs.mouthPucker * 0.6);

            // Drive head rotation from face tracking
            if (vrm.humanoid) {
              const head = vrm.humanoid.getRawBoneNode("head");
              if (head) {
                // Map tracked head pose to avatar (subtle, scaled down)
                head.rotation.x += fs.headPitch * 0.008;
                head.rotation.y += -fs.headYaw * 0.008;
                head.rotation.z += fs.headRoll * 0.005;
              }
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

            // Idle expressions — subtle ambient emotes every few seconds
            if (!expressionOverrideRef.current) {
              idleExprTimerRef.current += delta;
              const ie = idleExprRef.current;
              if (ie) {
                ie.elapsed += delta;
                const fadeIn = Math.min(ie.elapsed / 0.5, 1);
                const fadeOut = Math.max(1 - (ie.elapsed - ie.duration + 0.5) / 0.5, 0);
                const envelope = Math.min(fadeIn, fadeOut);
                trySetExpression(ie.name, ie.intensity * Math.max(0, envelope));
                if (ie.elapsed >= ie.duration) {
                  trySetExpression(ie.name, 0);
                  idleExprRef.current = null;
                  nextIdleExprRef.current = 3 + Math.random() * 5;
                  idleExprTimerRef.current = 0;
                }
              } else if (idleExprTimerRef.current > nextIdleExprRef.current) {
                const pick = IDLE_EXPRESSIONS[Math.floor(Math.random() * IDLE_EXPRESSIONS.length)];
                idleExprRef.current = { ...pick, elapsed: 0 };
                idleExprTimerRef.current = 0;
              }
            }
          }

          // Talking — varied mouth open/close (works in both modes)
          if (performance.now() < talkingUntilRef.current) {
            const tp = performance.now() * 0.01;
            const base = Math.abs(Math.sin(tp)) * 0.5;
            const variation = Math.abs(Math.sin(tp * 2.7)) * 0.2;
            trySetExpression("aa", base + variation);
          } else if (!ftActive) {
            trySetExpression("aa", 0);
          }

          // Expression override (from model tool calls)
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

          // Wink cue — override left eye blink for a clean wink
          if (winkPhaseRef.current >= 0) {
            winkPhaseRef.current += delta;
            const WINK_CLOSE = 0.08;
            const WINK_HOLD = 0.25;
            const WINK_OPEN = 0.15;
            const WINK_TOTAL = WINK_CLOSE + WINK_HOLD + WINK_OPEN;
            if (winkPhaseRef.current >= WINK_TOTAL) {
              winkPhaseRef.current = -1;
              trySetExpression("blink", 0);
              trySetExpression("happy", 0);
            } else {
              let winkVal: number;
              const p = winkPhaseRef.current;
              if (p < WINK_CLOSE) winkVal = (p / WINK_CLOSE) ** 2;
              else if (p < WINK_CLOSE + WINK_HOLD) winkVal = 1;
              else { const t = (p - WINK_CLOSE - WINK_HOLD) / WINK_OPEN; winkVal = (1 - t) ** 2; }
              // Use full blink (most VRM models don't have separate L/R)
              trySetExpression("blink", winkVal);
              trySetExpression("happy", winkVal * 0.3);
            }
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
  useEffect(() => { beatPulseRef.current = beatPulse; }, [beatPulse]);
  useEffect(() => {
    musicActiveRef.current = musicActive;
    if (musicActive && musicScript) {
      // Build choreography cues based on song (identified by duration)
      const dur = musicScript.duration;
      let cues: MusicCue[] = [];

      if (dur > 250) {
      // Faded (4:29 / 269s) — choreographed VRMA animation sequence
      cues = [
        // Intro — gentle sway
        { t: 0,   anim: "waiting",  expression: "relaxed", expressionIntensity: 0.4, expressionDuration: 8 },
        { t: 8,   anim: "idle_loop", expression: "relaxed", expressionIntensity: 0.5 },
        // Build-up
        { t: 16,  anim: "VRMA_01", expression: "happy", expressionIntensity: 0.4 },
        { t: 20,  anim: "idle_loop" },
        { t: 24,  anim: "VRMA_06", expression: "happy", expressionIntensity: 0.5 },
        { t: 28,  anim: "idle_loop" },
        // Verse 1 — "You were the shadow to my light"
        { t: 32,  anim: "VRMA_03", expression: "happy", expressionIntensity: 0.6 },
        { t: 36,  anim: "VRMA_01" },
        { t: 40,  anim: "idle_loop", expression: "relaxed", expressionIntensity: 0.5 },
        { t: 44,  anim: "VRMA_06" },
        { t: 48,  anim: "VRMA_03", expression: "happy", expressionIntensity: 0.5 },
        { t: 52,  anim: "idle_loop" },
        // Pre-chorus build
        { t: 56,  anim: "VRMA_05", expression: "happy", expressionIntensity: 0.7 },
        { t: 60,  anim: "VRMA_01" },
        // Chorus 1 — "Where are you now" — big energy
        { t: 64,  anim: "VRMA_05", expression: "happy", expressionIntensity: 0.9 },
        { t: 68,  anim: "VRMA_02", expression: "happy", expressionIntensity: 0.8 },
        { t: 72,  anim: "VRMA_04", expression: "happy", expressionIntensity: 0.9 },
        { t: 76,  anim: "VRMA_05" },
        { t: 80,  anim: "liked",   expression: "happy", expressionIntensity: 1.0 },
        { t: 84,  anim: "VRMA_07", expression: "happy", expressionIntensity: 0.8 },
        { t: 88,  anim: "VRMA_05" },
        { t: 92,  anim: "VRMA_04" },
        // Post-chorus drop
        { t: 96,  anim: "VRMA_06", expression: "relaxed", expressionIntensity: 0.6 },
        { t: 100, anim: "idle_loop", expression: "relaxed", expressionIntensity: 0.4 },
        { t: 104, anim: "VRMA_01" },
        // Verse 2
        { t: 108, anim: "VRMA_03", expression: "happy", expressionIntensity: 0.5 },
        { t: 112, anim: "idle_loop" },
        { t: 116, anim: "VRMA_06", expression: "relaxed", expressionIntensity: 0.5 },
        { t: 120, anim: "VRMA_01", expression: "happy", expressionIntensity: 0.5 },
        { t: 124, anim: "idle_loop" },
        // Pre-chorus 2
        { t: 128, anim: "VRMA_05", expression: "happy", expressionIntensity: 0.7 },
        { t: 132, anim: "VRMA_03" },
        // Chorus 2 — peak energy
        { t: 136, anim: "VRMA_05", expression: "happy", expressionIntensity: 1.0 },
        { t: 140, anim: "VRMA_04", expression: "happy", expressionIntensity: 0.9 },
        { t: 144, anim: "liked",   expression: "happy", expressionIntensity: 1.0 },
        { t: 148, anim: "VRMA_02" },
        { t: 152, anim: "VRMA_05", expression: "happy", expressionIntensity: 0.9 },
        { t: 156, anim: "VRMA_07" },
        { t: 160, anim: "VRMA_04", expression: "happy", expressionIntensity: 0.8 },
        { t: 164, anim: "VRMA_05" },
        // Bridge — calm down
        { t: 168, anim: "VRMA_06", expression: "relaxed", expressionIntensity: 0.6 },
        { t: 172, anim: "waiting", expression: "relaxed", expressionIntensity: 0.5 },
        { t: 180, anim: "VRMA_01", expression: "relaxed", expressionIntensity: 0.4 },
        { t: 188, anim: "idle_loop" },
        // Final chorus — biggest energy
        { t: 196, anim: "VRMA_05", expression: "happy", expressionIntensity: 1.0 },
        { t: 200, anim: "VRMA_04", expression: "happy", expressionIntensity: 1.0 },
        { t: 204, anim: "liked",   expression: "happy", expressionIntensity: 1.0 },
        { t: 208, anim: "VRMA_02" },
        { t: 212, anim: "VRMA_05" },
        { t: 216, anim: "VRMA_07", expression: "happy", expressionIntensity: 0.9 },
        { t: 220, anim: "VRMA_04" },
        { t: 224, anim: "VRMA_05" },
        // Outro — wind down
        { t: 228, anim: "VRMA_06", expression: "relaxed", expressionIntensity: 0.5 },
        { t: 236, anim: "VRMA_01", expression: "relaxed", expressionIntensity: 0.4 },
        { t: 244, anim: "waiting", expression: "relaxed", expressionIntensity: 0.3 },
        { t: 256, anim: "idle_loop", expression: "relaxed", expressionIntensity: 0.2 },
      ];

      } else if (dur < 200) {
      // All The Things She Said (3:02 / 182s) — hypertechno remix, high energy throughout
      cues = [
        // Synth intro
        { t: 0,   anim: "waiting",  expression: "relaxed", expressionIntensity: 0.3, expressionDuration: 6 },
        { t: 6,   anim: "VRMA_01",  expression: "happy", expressionIntensity: 0.5 },
        // Beat drops in
        { t: 12,  anim: "VRMA_05",  expression: "happy", expressionIntensity: 0.7 },
        { t: 16,  anim: "VRMA_04" },
        { t: 20,  anim: "VRMA_02",  expression: "happy", expressionIntensity: 0.8 },
        { t: 24,  anim: "VRMA_05" },
        // Verse 1 — "All the things she said"
        { t: 28,  anim: "VRMA_03",  expression: "happy", expressionIntensity: 0.7 },
        { t: 32,  anim: "VRMA_05" },
        { t: 36,  anim: "VRMA_04",  expression: "happy", expressionIntensity: 0.8 },
        { t: 40,  anim: "VRMA_07" },
        { t: 44,  anim: "VRMA_05",  expression: "happy", expressionIntensity: 0.9 },
        { t: 48,  anim: "liked",    expression: "happy", expressionIntensity: 1.0 },
        // Chorus 1 — maximum energy
        { t: 52,  anim: "VRMA_05",  expression: "happy", expressionIntensity: 1.0 },
        { t: 55,  anim: "VRMA_04" },
        { t: 58,  anim: "VRMA_02" },
        { t: 61,  anim: "VRMA_05" },
        { t: 64,  anim: "liked",    expression: "happy", expressionIntensity: 1.0 },
        { t: 67,  anim: "VRMA_07" },
        { t: 70,  anim: "VRMA_05" },
        { t: 73,  anim: "VRMA_04" },
        // Break
        { t: 76,  anim: "VRMA_06",  expression: "relaxed", expressionIntensity: 0.5 },
        { t: 80,  anim: "VRMA_01",  expression: "happy", expressionIntensity: 0.5 },
        { t: 84,  anim: "VRMA_03" },
        // Verse 2
        { t: 88,  anim: "VRMA_05",  expression: "happy", expressionIntensity: 0.8 },
        { t: 92,  anim: "VRMA_04" },
        { t: 96,  anim: "VRMA_02",  expression: "happy", expressionIntensity: 0.9 },
        { t: 100, anim: "VRMA_07" },
        { t: 104, anim: "VRMA_05" },
        // Chorus 2 — peak
        { t: 108, anim: "liked",    expression: "happy", expressionIntensity: 1.0 },
        { t: 111, anim: "VRMA_05" },
        { t: 114, anim: "VRMA_04",  expression: "happy", expressionIntensity: 1.0 },
        { t: 117, anim: "VRMA_02" },
        { t: 120, anim: "VRMA_05" },
        { t: 123, anim: "VRMA_07" },
        { t: 126, anim: "liked" },
        { t: 129, anim: "VRMA_04" },
        // Bridge — brief calm
        { t: 132, anim: "VRMA_06",  expression: "relaxed", expressionIntensity: 0.5 },
        { t: 136, anim: "waiting",  expression: "relaxed", expressionIntensity: 0.4 },
        { t: 140, anim: "VRMA_01",  expression: "happy", expressionIntensity: 0.6 },
        // Final chorus — all out
        { t: 144, anim: "VRMA_05",  expression: "happy", expressionIntensity: 1.0 },
        { t: 147, anim: "VRMA_04" },
        { t: 150, anim: "liked",    expression: "happy", expressionIntensity: 1.0 },
        { t: 153, anim: "VRMA_02" },
        { t: 156, anim: "VRMA_05" },
        { t: 159, anim: "VRMA_07" },
        { t: 162, anim: "VRMA_04" },
        { t: 165, anim: "VRMA_05" },
        // Outro
        { t: 168, anim: "VRMA_06",  expression: "relaxed", expressionIntensity: 0.5 },
        { t: 172, anim: "VRMA_01",  expression: "relaxed", expressionIntensity: 0.4 },
        { t: 176, anim: "waiting",  expression: "relaxed", expressionIntensity: 0.3 },
        { t: 180, anim: "idle_loop", expression: "relaxed", expressionIntensity: 0.2 },
      ];

      } else {
      // Nostalgia Dreams (3:48 / 228s) — dreamy, moderate energy
      cues = [
        { t: 0,   anim: "waiting",  expression: "relaxed", expressionIntensity: 0.4 },
        { t: 10,  anim: "VRMA_01",  expression: "relaxed", expressionIntensity: 0.5 },
        { t: 20,  anim: "VRMA_06",  expression: "happy", expressionIntensity: 0.4 },
        { t: 30,  anim: "VRMA_03",  expression: "happy", expressionIntensity: 0.5 },
        { t: 40,  anim: "idle_loop" },
        { t: 50,  anim: "VRMA_05",  expression: "happy", expressionIntensity: 0.7 },
        { t: 58,  anim: "VRMA_01" },
        { t: 66,  anim: "VRMA_04",  expression: "happy", expressionIntensity: 0.8 },
        { t: 74,  anim: "VRMA_02" },
        { t: 82,  anim: "VRMA_05",  expression: "happy", expressionIntensity: 0.9 },
        { t: 90,  anim: "liked",    expression: "happy", expressionIntensity: 1.0 },
        { t: 98,  anim: "VRMA_06",  expression: "relaxed", expressionIntensity: 0.5 },
        { t: 106, anim: "VRMA_03",  expression: "happy", expressionIntensity: 0.6 },
        { t: 114, anim: "VRMA_05",  expression: "happy", expressionIntensity: 0.8 },
        { t: 122, anim: "VRMA_04" },
        { t: 130, anim: "liked",    expression: "happy", expressionIntensity: 1.0 },
        { t: 138, anim: "VRMA_07" },
        { t: 146, anim: "VRMA_05",  expression: "happy", expressionIntensity: 0.9 },
        { t: 154, anim: "VRMA_02" },
        { t: 162, anim: "VRMA_06",  expression: "relaxed", expressionIntensity: 0.5 },
        { t: 170, anim: "VRMA_01",  expression: "relaxed", expressionIntensity: 0.4 },
        { t: 180, anim: "waiting",  expression: "relaxed", expressionIntensity: 0.3 },
        { t: 200, anim: "idle_loop", expression: "relaxed", expressionIntensity: 0.2 },
      ];
      }

      musicCuesRef.current = cues;
      nextCueRef.current = 0;
    } else {
      musicCuesRef.current = [];
      nextCueRef.current = 0;
      // Return to idle when music stops
      switchAnimRef.current("idle_loop");
    }
  }, [musicActive, musicScript]);
  useEffect(() => { musicScriptRef.current = musicScript; }, [musicScript]);

  function applyMusicMotion(vrm: VRM, directive: { intensity: number; head_bob: number; sway_amount: number; pose: string }, t: number, script: MusicScript) {
    if (!vrm.humanoid) return;
    const { intensity, head_bob, sway_amount, pose } = directive;
    const bpm = getTempoAt(script, t);
    const beatFreq = bpm / 60;
    const beat = t * beatFreq; // continuous beat count

    const head = vrm.humanoid.getRawBoneNode("head");
    const spine = vrm.humanoid.getRawBoneNode("spine");
    const chest = vrm.humanoid.getRawBoneNode("chest");
    const hips = vrm.humanoid.getRawBoneNode("hips");
    const leftArm = vrm.humanoid.getRawBoneNode("leftUpperArm");
    const rightArm = vrm.humanoid.getRawBoneNode("rightUpperArm");
    const leftForearm = vrm.humanoid.getRawBoneNode("leftLowerArm");
    const rightForearm = vrm.humanoid.getRawBoneNode("rightLowerArm");
    const leftShoulder = vrm.humanoid.getRawBoneNode("leftShoulder");
    const rightShoulder = vrm.humanoid.getRawBoneNode("rightShoulder");

    // Reset bones to rest pose before applying procedural motion (mixer is paused during music)
    const rest = restPoseRef.current;
    const boneMap: [THREE.Object3D | null, string][] = [
      [head, "head"], [spine, "spine"], [chest, "chest"], [hips, "hips"],
      [leftArm, "leftUpperArm"], [rightArm, "rightUpperArm"],
      [leftForearm, "leftLowerArm"], [rightForearm, "rightLowerArm"],
      [leftShoulder, "leftShoulder"], [rightShoulder, "rightShoulder"],
    ];
    for (const [bone, name] of boneMap) {
      if (!bone) continue;
      const r = rest[name];
      if (r) {
        bone.rotation.set(r.rx, r.ry, r.rz);
        if (name === "hips" && r.py !== undefined) bone.position.y = r.py;
      } else {
        bone.rotation.set(0, 0, 0);
      }
    }

    // Base head movement — always present, scales with head_bob
    if (head) {
      head.rotation.x += Math.sin(beat * Math.PI * 2) * head_bob * 0.12;
      head.rotation.z += Math.sin(beat * Math.PI) * head_bob * 0.04;
    }
    // Base spine sway — always present
    if (spine) spine.rotation.z += Math.sin(beat * Math.PI) * sway_amount * 0.08;

    if (pose === "dancing") {
      // Hip bounce — sharp on-beat bounce (using abs(sin) for snappy feel)
      if (hips) {
        const bounce = Math.pow(Math.abs(Math.sin(beat * Math.PI)), 1.5);
        hips.position.y += bounce * intensity * 0.025;
      }
      // Alternating arm swings — left and right offset by half beat
      if (leftArm) {
        leftArm.rotation.z += Math.sin(beat * Math.PI) * intensity * 0.18;
        leftArm.rotation.x += Math.sin(beat * Math.PI * 0.5) * intensity * 0.06;
      }
      if (rightArm) {
        rightArm.rotation.z -= Math.sin(beat * Math.PI + Math.PI * 0.5) * intensity * 0.18;
        rightArm.rotation.x += Math.cos(beat * Math.PI * 0.5) * intensity * 0.06;
      }
      // Forearm pump on strong beats
      if (leftForearm) leftForearm.rotation.x += Math.sin(beat * Math.PI * 2) * intensity * 0.08;
      if (rightForearm) rightForearm.rotation.x += Math.cos(beat * Math.PI * 2) * intensity * 0.08;
      // Chest twist — slower groove, adds body rotation
      if (chest) {
        chest.rotation.y += Math.sin(beat * Math.PI * 0.5) * intensity * 0.06;
        chest.rotation.x += Math.sin(beat * Math.PI) * intensity * 0.02;
      }
      // Shoulder groove
      if (leftShoulder) leftShoulder.rotation.z += Math.sin(beat * Math.PI) * intensity * 0.04;
      if (rightShoulder) rightShoulder.rotation.z -= Math.sin(beat * Math.PI) * intensity * 0.04;
      // Extra head groove during dancing
      if (head) head.rotation.y += Math.sin(beat * Math.PI * 0.5) * intensity * 0.04;
    }

    if (pose === "energetic") {
      // Controlled bounce — less wild than dancing
      if (hips) hips.position.y += Math.abs(Math.sin(beat * Math.PI * 2)) * intensity * 0.015;
      // Arms pump rhythmically
      if (leftArm) leftArm.rotation.z += Math.sin(beat * Math.PI) * intensity * 0.12;
      if (rightArm) rightArm.rotation.z -= Math.sin(beat * Math.PI) * intensity * 0.12;
      // Chest engagement
      if (chest) chest.rotation.y += Math.sin(beat * Math.PI * 0.5) * intensity * 0.04;
    }

    if (pose === "dramatic") {
      // Wide, sweeping chest movements
      if (chest) {
        chest.rotation.z += Math.sin(beat * Math.PI * 0.5) * intensity * 0.08;
        chest.rotation.y += Math.sin(beat * Math.PI * 0.25) * intensity * 0.05;
      }
      // Slow dramatic head turns
      if (head) head.rotation.y += Math.sin(beat * Math.PI * 0.25) * intensity * 0.08;
      // Arms out slightly
      if (leftArm) leftArm.rotation.z += Math.sin(beat * Math.PI * 0.5) * intensity * 0.06;
      if (rightArm) rightArm.rotation.z -= Math.sin(beat * Math.PI * 0.5) * intensity * 0.06;
    }

    if (pose === "nodding" && head) {
      head.rotation.x += Math.sin(beat * Math.PI * 2) * head_bob * 0.08;
      // Subtle shoulder movement while nodding
      if (leftShoulder) leftShoulder.rotation.y += Math.sin(beat * Math.PI) * head_bob * 0.02;
      if (rightShoulder) rightShoulder.rotation.y -= Math.sin(beat * Math.PI) * head_bob * 0.02;
    }

    if (pose === "reflective") {
      // Very gentle, slow breathing-like motion
      if (chest) chest.rotation.x += Math.sin(t * 0.8) * 0.015;
      if (spine) spine.rotation.z += Math.sin(t * 0.4) * sway_amount * 0.03;
      if (head) head.rotation.x += Math.sin(t * 0.6) * 0.01;
    }

    if ((pose === "winding_down" || pose === "winding down")) {
      if (spine) spine.rotation.z += Math.sin(t * 0.5) * sway_amount * 0.04;
      if (head) head.rotation.x += Math.sin(t * 0.3) * 0.008;
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

      {/* Cue Controls */}
      <div className={styles.cueControls}>
        <button
          className={styles.cueBtn}
          onClick={() => { winkPhaseRef.current = 0; }}
        >
          Cue Wink
        </button>
        <button
          className={`${styles.cueBtn} ${faceActive ? styles.cueBtnActive : ""}`}
          onClick={() => {
            if (faceActive) faceTrackStopRef.current?.();
            else faceTrackStartRef.current?.();
          }}
        >
          {faceActive ? "FT: ON" : "FT: OFF"}
        </button>
        <button
          className={`${styles.cueBtn} ${beatPulse ? styles.cueBtnActive : ""}`}
          onClick={() => setBeatPulse(p => !p)}
          title="Toggle beat-synced camera pulse"
        >
          {beatPulse ? "Pulse: ON" : "Pulse: OFF"}
        </button>
      </div>

      {/* Avatar Label */}
      <div className={styles.avatarLabel}>{MODELS[activeModel].label}</div>
    </div>
  );
}
