"use client";

import { useState, useCallback, useRef } from "react";
import styles from "./Workbench.module.css";
import AvatarPanel from "./AvatarPanel";
import AriaChat from "./AriaChat";
import MusicPlayer from "./MusicPlayer";
import DebugPanel, { createLogEntry, type LogEntry } from "./DebugPanel";
import { useVoice } from "@/hooks/useVoice";
import { useFaceTrack } from "@/hooks/useFaceTrack";
import type { MusicScript } from "@/lib/music";
import type { SongInfo } from "@/lib/api";

export interface AvatarControls {
  switchAnim: (name: string) => void;
  setExpression: (expression: string, intensity?: number) => void;
  triggerTalking: () => void;
}

export default function Workbench() {
  const [chatWidth, setChatWidth] = useState(550);
  const [debugOpen, setDebugOpen] = useState(true);
  const dividerRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const avatarControlsRef = useRef<AvatarControls | null>(null);

  // Music state (shared between AvatarPanel and MusicPlayer)
  const [musicScript, setMusicScript] = useState<MusicScript | null>(null);
  const [musicActive, setMusicActive] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Track actions and logs for debug panel
  const [lastActions, setLastActions] = useState<{ type: string; [key: string]: unknown }[]>([]);
  const [geminiLog, setGeminiLog] = useState<LogEntry[]>([]);

  const avatarActionRef = useRef<((type: string, params: Record<string, unknown>) => void) | null>(null);
  const chatAddMessageRef = useRef<((role: "user" | "assistant" | "system", text: string) => void) | null>(null);
  const playMusicByNameRef = useRef<((songName: string) => void) | null>(null);
  const voice = useVoice({
    onAction: (action) => avatarActionRef.current?.(action.type, action),
  });
  const faceTrack = useFaceTrack();
  const [faceContextEnabled, setFaceContextEnabled] = useState(false);

  const addLog = useCallback((type: LogEntry["type"], content: string) => {
    setGeminiLog(prev => [...prev.slice(-99), createLogEntry(type, content)]);
  }, []);

  const handleStartMusic = useCallback(async (song: SongInfo) => {
    const res = await fetch(song.script_url);
    const script: MusicScript = await res.json();
    setMusicScript(script);
    setMusicActive(true);
    if (audioRef.current) {
      audioRef.current.src = song.audio_url!;
      audioRef.current.play();
    }
    addLog("action", `Playing: ${song.name}`);
  }, [addLog]);

  const handleStopMusic = useCallback(() => {
    setMusicActive(false);
    setMusicScript(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

  const handleAvatarAction = useCallback((type: string, params: Record<string, unknown>) => {
    const ctrl = avatarControlsRef.current;
    console.log(`[workbench] handleAvatarAction type=${type}`, params, "ctrl=", !!ctrl);
    if (!ctrl) return;
    if (type === "play_animation") ctrl.switchAnim(params.animation as string);
    if (type === "set_expression") ctrl.setExpression(params.expression as string, (params.intensity as number) || 0.6);
    if (type === "trigger_talking") ctrl.triggerTalking();
    if (type === "play_music") playMusicByNameRef.current?.((params.song as string) || "");
    setLastActions(prev => [...prev.slice(-19), { type, ...params }]);
    addLog("action", `${type}: ${type === "play_animation" ? params.animation : type === "set_expression" ? `${params.expression} @ ${params.intensity}` : JSON.stringify(params)}`);
  }, [addLog]);
  avatarActionRef.current = handleAvatarAction;

  const handleDividerDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dividerRef.current = { startX: e.clientX, startWidth: chatWidth };

    const onMove = (ev: MouseEvent) => {
      if (!dividerRef.current) return;
      const delta = dividerRef.current.startX - ev.clientX;
      setChatWidth(Math.min(Math.max(dividerRef.current.startWidth + delta, 320), 800));
    };
    const onUp = () => {
      dividerRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [chatWidth]);

  return (
    <div className={styles.workbench}>
      <audio ref={audioRef} preload="auto" onEnded={handleStopMusic} />
      <div className={styles.mainRow}>
        {debugOpen ? (
          <div className={styles.debugSidePanel}>
            <DebugPanel
              lastActions={lastActions}
              faceState={faceTrack.faceState}
              faceActive={faceTrack.active}
              geminiLog={geminiLog}
              onClose={() => setDebugOpen(false)}
            />
          </div>
        ) : (
          <button className={styles.debugToggle} onClick={() => setDebugOpen(true)} title="Open Debug">
            &#9881;
          </button>
        )}
        <div className={styles.avatarContainer}>
          <AvatarPanel
            controlsRef={avatarControlsRef}
            musicScript={musicScript}
            musicActive={musicActive}
            audioRef={audioRef}
            faceState={faceTrack.faceState}
            faceActive={faceTrack.active}
            onStartFaceTrack={faceTrack.start}
            onStopFaceTrack={faceTrack.stop}
          />
          {musicActive && musicScript && (
            <MusicPlayer
              script={musicScript}
              audioRef={audioRef}
              onStop={handleStopMusic}
            />
          )}
        </div>
        <div className={styles.chatDivider} onMouseDown={handleDividerDown} />
        <div className={styles.chatSidePanel} style={{ width: chatWidth }}>
          <AriaChat
            voice={voice}
            onAvatarAction={handleAvatarAction}
            onStartMusic={handleStartMusic}
            faceTrack={faceTrack}
            faceContextEnabled={faceContextEnabled}
            onToggleFaceContext={setFaceContextEnabled}
            onLog={addLog}
            addMessageRef={chatAddMessageRef}
            playMusicByNameRef={playMusicByNameRef}
          />
        </div>
      </div>
    </div>
  );
}
