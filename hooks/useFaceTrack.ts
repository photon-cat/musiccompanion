"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export interface FaceState {
  headPitch: number;
  headYaw: number;
  headRoll: number;
  jawOpen: number;
  smile: number;
  blinkL: number;
  blinkR: number;
  browUp: number;
  browDownL: number;
  browDownR: number;
  mouthPucker: number;
}

export interface UseFaceTrackReturn {
  active: boolean;
  loading: boolean;
  faceState: FaceState | null;
  start: () => Promise<void>;
  stop: () => void;
  /** Human-readable summary for model context injection */
  describeFace: () => string;
}

export function useFaceTrack(): UseFaceTrackReturn {
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const faceStateRef = useRef<FaceState | null>(null);
  const [faceState, setFaceState] = useState<FaceState | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const updateCountRef = useRef(0);

  const stop = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = 0;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.remove();
      videoRef.current = null;
    }
    setActive(false);
    faceStateRef.current = null;
    setFaceState(null);
  }, []);

  const start = useCallback(async () => {
    if (active) return;
    setLoading(true);

    try {
      const fileset = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm"
      );

      const landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      });
      landmarkerRef.current = landmarker;

      // Get webcam
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: "user" },
      });
      streamRef.current = stream;

      const video = document.createElement("video");
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.style.display = "none";
      document.body.appendChild(video);
      videoRef.current = video;

      await new Promise<void>((resolve) => {
        video.onloadeddata = () => resolve();
      });

      setActive(true);
      setLoading(false);

      // Wait for video to actually be playing with valid frames
      await new Promise<void>((resolve) => {
        const check = () => {
          if (video.readyState >= 2 && video.videoWidth > 0) resolve();
          else requestAnimationFrame(check);
        };
        check();
      });

      let lastTimestamp = -1;

      // Detection loop
      function detect() {
        if (!videoRef.current || !landmarkerRef.current) return;
        const now = performance.now();

        // Skip if video isn't ready or timestamp hasn't advanced
        if (videoRef.current.readyState < 2 || videoRef.current.videoWidth === 0) {
          animFrameRef.current = requestAnimationFrame(detect);
          return;
        }
        if (now <= lastTimestamp) {
          animFrameRef.current = requestAnimationFrame(detect);
          return;
        }
        lastTimestamp = now;

        let result;
        try {
          result = landmarkerRef.current.detectForVideo(videoRef.current, now);
        } catch {
          animFrameRef.current = requestAnimationFrame(detect);
          return;
        }

        if (result.faceBlendshapes?.length && result.facialTransformationMatrixes?.length) {
          const bs = result.faceBlendshapes[0].categories;
          const matrix = result.facialTransformationMatrixes[0].data;

          // Extract head pose from 4x4 transformation matrix
          const m = matrix as unknown as number[];
          const pitch = Math.asin(-m[6]);
          const yaw = Math.atan2(m[2], m[10]);
          const roll = Math.atan2(m[4], m[5]);

          // Extract blendshapes by name
          const bsMap: Record<string, number> = {};
          for (const cat of bs) {
            bsMap[cat.categoryName] = cat.score;
          }

          const state: FaceState = {
            headPitch: pitch * 57.3,
            headYaw: yaw * 57.3,
            headRoll: roll * 57.3,
            jawOpen: bsMap["jawOpen"] || 0,
            smile: ((bsMap["mouthSmileLeft"] || 0) + (bsMap["mouthSmileRight"] || 0)) / 2,
            blinkL: bsMap["eyeBlinkLeft"] || 0,
            blinkR: bsMap["eyeBlinkRight"] || 0,
            browUp: bsMap["browInnerUp"] || 0,
            browDownL: bsMap["browDownLeft"] || 0,
            browDownR: bsMap["browDownRight"] || 0,
            mouthPucker: bsMap["mouthPucker"] || 0,
          };
          faceStateRef.current = state;

          // Update React state every 10 frames to avoid excessive rerenders
          updateCountRef.current++;
          if (updateCountRef.current % 10 === 0) {
            setFaceState({ ...state });
          }
        }

        animFrameRef.current = requestAnimationFrame(detect);
      }
      detect();
    } catch (err) {
      console.error("FaceTrack init failed:", err);
      setLoading(false);
      stop();
    }
  }, [active, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { stop(); };
  }, [stop]);

  const describeFace = useCallback((): string => {
    const s = faceStateRef.current;
    if (!s) return "";

    const parts: string[] = [];

    // Head direction
    if (Math.abs(s.headYaw) > 15) parts.push(s.headYaw > 0 ? "looking left" : "looking right");
    if (s.headPitch > 10) parts.push("looking down");
    else if (s.headPitch < -10) parts.push("looking up");
    if (Math.abs(s.headRoll) > 10) parts.push("head tilted");

    // Expression
    if (s.smile > 0.4) parts.push("smiling");
    else if (s.smile > 0.2) parts.push("slight smile");
    if (s.jawOpen > 0.3) parts.push("mouth open");
    if (s.browUp > 0.3) parts.push("eyebrows raised");
    if (s.browDownL > 0.3 || s.browDownR > 0.3) parts.push("brows furrowed");
    if (s.mouthPucker > 0.3) parts.push("lips pursed");
    if (s.blinkL > 0.5 && s.blinkR > 0.5) parts.push("eyes closed");
    else if (s.blinkL > 0.5 || s.blinkR > 0.5) parts.push("winking");

    if (parts.length === 0) parts.push("neutral expression");

    return `[User's face: ${parts.join(", ")}]`;
  }, []);

  return { active, loading, faceState, start, stop, describeFace };
}
