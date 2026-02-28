import { useState, useRef, useCallback, useEffect } from "react";
import { PLAYBACK_RATE, CAPTURE_RATE } from "@/lib/constants";
import { arrayBufferToBase64, base64ToArrayBuffer, pcm16ToFloat32 } from "@/lib/audio-utils";

export interface UseVoiceReturn {
  voiceConnected: boolean;
  micActive: boolean;
  speaking: boolean;
  voiceStatus: string;
  selectedVoice: string;
  setSelectedVoice: (voice: string) => void;
  toggleMic: () => void;
  sendText: (text: string) => void;
  triggerTalkingAnimation: () => void;
  talkingUntil: number;
}

interface UseVoiceOptions {
  onAction?: (action: { type: string; [key: string]: unknown }) => void;
  onLog?: (type: "user" | "gemini" | "tool_call" | "tool_result" | "action" | "error", content: string) => void;
}

export function useVoice(options?: UseVoiceOptions): UseVoiceReturn {
  const onActionRef = useRef(options?.onAction);
  onActionRef.current = options?.onAction;
  const onLogRef = useRef(options?.onLog);
  onLogRef.current = options?.onLog;
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("Not connected");
  const [selectedVoice, setSelectedVoiceState] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("gemini_voice") || "Leda";
    }
    return "Leda";
  });

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);
  const talkingUntilRef = useRef(0);
  const speakingRef = useRef(false);
  // Guard against reconnection after intentional teardown
  const disposedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedVoiceRef = useRef(selectedVoice);
  selectedVoiceRef.current = selectedVoice;

  const closeWs = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      // Remove onclose to prevent reconnection loop
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setVoiceConnected(false);
  }, []);

  const connectVoice = useCallback(() => {
    if (disposedRef.current) return;

    // Close any existing connection first
    closeWs();

    setVoiceStatus("Connecting voice...");
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const host = location.hostname + ":8000";
    const ws = new WebSocket(`${proto}//${host}/ws/voice`);
    wsRef.current = ws;

    ws.onopen = () => {
      setVoiceStatus("Setting up voice...");
      ws.send(JSON.stringify({ type: "set_voice", voice: selectedVoiceRef.current }));
      onLogRef.current?.("action", `[voice] connecting with voice: ${selectedVoiceRef.current}`);
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "ready") {
        setVoiceConnected(true);
        setVoiceStatus(`Voice: ${selectedVoiceRef.current}`);
        onLogRef.current?.("action", `[voice] connected`);
      } else if (msg.type === "audio") {
        setSpeaking(true);
        speakingRef.current = true;
        queueAudio(msg.data);
        talkingUntilRef.current = performance.now() + 2000;
      } else if (msg.type === "text") {
        onLogRef.current?.("gemini", `[voice] ${msg.text}`);
      } else if (msg.type === "action") {
        console.log("[voice] action from Gemini:", msg.action);
        onLogRef.current?.("tool_call", `[voice] ${msg.action?.type}(${JSON.stringify(msg.action)})`);
        if (onActionRef.current && msg.action) {
          onActionRef.current(msg.action);
        }
      } else if (msg.type === "turn_complete") {
        nextPlayTimeRef.current = 0;
        setTimeout(() => { setSpeaking(false); speakingRef.current = false; }, 300);
        onLogRef.current?.("action", `[voice] turn complete`);
      } else if (msg.type === "error") {
        setVoiceStatus("Voice error: " + msg.message);
        onLogRef.current?.("error", `[voice] ${msg.message}`);
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      setVoiceConnected(false);
      onLogRef.current?.("action", `[voice] disconnected`);
      if (!disposedRef.current && !document.hidden) {
        setVoiceStatus("Voice disconnected - reconnecting...");
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          connectVoice();
        }, 3000);
      }
    };

    ws.onerror = () => {
      setVoiceStatus("Voice connection error");
      onLogRef.current?.("error", `[voice] connection error`);
    };
  }, [closeWs]); // eslint-disable-line react-hooks/exhaustive-deps

  const queueAudio = useCallback((b64data: string) => {
    const bytes = base64ToArrayBuffer(b64data);
    const pcm16 = new Int16Array(bytes);
    const float32 = pcm16ToFloat32(pcm16);

    if (!playbackCtxRef.current) {
      playbackCtxRef.current = new AudioContext({ sampleRate: PLAYBACK_RATE });
    }
    const ctx = playbackCtxRef.current;

    const now = ctx.currentTime;
    if (nextPlayTimeRef.current < now) nextPlayTimeRef.current = now + 0.05;

    const buffer = ctx.createBuffer(1, float32.length, PLAYBACK_RATE);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += buffer.duration;
  }, []);

  const stopMic = useCallback(() => {
    setMicActive(false);
    setSpeaking(false);
    if (workletNodeRef.current) { workletNodeRef.current.disconnect(); workletNodeRef.current = null; }
    if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach(t => t.stop()); mediaStreamRef.current = null; }
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
  }, []);

  const startMic = useCallback(async () => {
    if (!voiceConnected) { setVoiceStatus("Voice not connected yet"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: CAPTURE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      mediaStreamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: CAPTURE_RATE });
      audioCtxRef.current = ctx;

      const workletCode = `
        class PCMProcessor extends AudioWorkletProcessor {
          process(inputs) {
            const input = inputs[0];
            if (input.length > 0) {
              const samples = input[0];
              const pcm16 = new Int16Array(samples.length);
              for (let i = 0; i < samples.length; i++) {
                const s = Math.max(-1, Math.min(1, samples[i]));
                pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
              }
              this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
            }
            return true;
          }
        }
        registerProcessor('pcm-processor', PCMProcessor);
      `;
      const blob = new Blob([workletCode], { type: "application/javascript" });
      const workletUrl = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl);

      const source = ctx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(ctx, "pcm-processor");
      workletNodeRef.current = worklet;

      let sendBuffer = new Int16Array(0);
      const CHUNK_SAMPLES = 2048;

      worklet.port.onmessage = (e) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        // Don't send mic audio while Aria is speaking to prevent echo loop
        if (speakingRef.current) return;
        const newData = new Int16Array(e.data);
        const merged = new Int16Array(sendBuffer.length + newData.length);
        merged.set(sendBuffer);
        merged.set(newData, sendBuffer.length);
        sendBuffer = merged;

        while (sendBuffer.length >= CHUNK_SAMPLES) {
          const chunk = sendBuffer.slice(0, CHUNK_SAMPLES);
          sendBuffer = sendBuffer.slice(CHUNK_SAMPLES);
          const b64 = arrayBufferToBase64(chunk.buffer);
          ws.send(JSON.stringify({ type: "audio", data: b64 }));
        }
      };

      source.connect(worklet);
      worklet.connect(ctx.destination);

      setMicActive(true);
      setVoiceStatus(`Mic on - ${selectedVoice}`);
      onLogRef.current?.("user", `[voice] mic on`);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setVoiceStatus("Mic error: " + errMsg);
      onLogRef.current?.("error", `[voice] mic error: ${errMsg}`);
    }
  }, [voiceConnected, selectedVoice]);

  const toggleMic = useCallback(() => {
    if (micActive) {
      stopMic();
      if (voiceConnected) setVoiceStatus(`Voice: ${selectedVoice}`);
      onLogRef.current?.("user", `[voice] mic off`);
    } else {
      startMic();
    }
  }, [micActive, voiceConnected, selectedVoice, startMic, stopMic]);

  const setSelectedVoice = useCallback((voice: string) => {
    setSelectedVoiceState(voice);
    localStorage.setItem("gemini_voice", voice);
    if (voiceConnected) {
      stopMic();
      closeWs();
      setTimeout(() => connectVoice(), 500);
    }
  }, [voiceConnected, stopMic, closeWs, connectVoice]);

  const sendText = useCallback((text: string) => {
    const ws = wsRef.current;
    if (voiceConnected && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "text", text }));
      onLogRef.current?.("user", `[voice] ${text}`);
    }
  }, [voiceConnected]);

  const triggerTalkingAnimation = useCallback(() => {
    talkingUntilRef.current = performance.now() + 2000;
  }, []);

  useEffect(() => {
    disposedRef.current = false;
    connectVoice();
    return () => {
      disposedRef.current = true;
      stopMic();
      closeWs();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    voiceConnected,
    micActive,
    speaking,
    voiceStatus,
    selectedVoice,
    setSelectedVoice,
    toggleMic,
    sendText,
    triggerTalkingAnimation,
    talkingUntil: talkingUntilRef.current,
  };
}
