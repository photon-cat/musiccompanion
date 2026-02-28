"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import styles from "./DebugPanel.module.css";
import { getDebugInfo, type DebugInfo } from "@/lib/api";
import type { FaceState } from "@/hooks/useFaceTrack";

interface LogEntry {
  id: number;
  time: string;
  type: "user" | "gemini" | "tool_call" | "tool_result" | "action" | "error";
  content: string;
}

let logId = 0;

interface DebugPanelProps {
  lastActions: { type: string; [key: string]: unknown }[];
  faceState: FaceState | null;
  faceActive: boolean;
  geminiLog: LogEntry[];
  onClose?: () => void;
}

export type { LogEntry };

export function createLogEntry(
  type: LogEntry["type"],
  content: string
): LogEntry {
  return {
    id: ++logId,
    time: new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    type,
    content,
  };
}

export default function DebugPanel({ lastActions, faceState, faceActive, geminiLog, onClose }: DebugPanelProps) {
  const [info, setInfo] = useState<DebugInfo | null>(null);
  const [tab, setTab] = useState<"log" | "info">("log");
  const logEndRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    getDebugInfo().then(setInfo).catch(() => {});
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (lastActions.length) refresh(); }, [lastActions, refresh]);

  useEffect(() => {
    if (tab === "log" && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [geminiLog, tab]);

  const typeColor: Record<string, string> = {
    user: "#6b9fff",
    gemini: "#f59e0b",
    tool_call: "#a78bfa",
    tool_result: "#34d399",
    action: "#f472b6",
    error: "#ef4444",
  };

  const typeLabel: Record<string, string> = {
    user: "USR",
    gemini: "GEM",
    tool_call: "CALL",
    tool_result: "RES",
    action: "ACT",
    error: "ERR",
  };

  const faceMeters: [string, number, string][] = faceState ? [
    ["Pitch", faceState.headPitch / 45, faceState.headPitch.toFixed(1) + "°"],
    ["Yaw", faceState.headYaw / 45, faceState.headYaw.toFixed(1) + "°"],
    ["Smile", faceState.smile, faceState.smile.toFixed(2)],
    ["Jaw", faceState.jawOpen, faceState.jawOpen.toFixed(2)],
    ["Blink L", faceState.blinkL, faceState.blinkL.toFixed(2)],
    ["Blink R", faceState.blinkR, faceState.blinkR.toFixed(2)],
    ["Brow Up", faceState.browUp, faceState.browUp.toFixed(2)],
    ["Pucker", faceState.mouthPucker, faceState.mouthPucker.toFixed(2)],
  ] : [];

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Debug</span>
        <div className={styles.tabs}>
          <button className={tab === "log" ? styles.activeTab : ""} onClick={() => setTab("log")}>Log</button>
          <button className={tab === "info" ? styles.activeTab : ""} onClick={() => setTab("info")}>Info</button>
        </div>
        {onClose && <button className={styles.closeBtn} onClick={onClose}>&times;</button>}
      </div>

      {tab === "log" ? (
        <div className={styles.body}>
          <div className={styles.logContainer}>
            {geminiLog.length === 0 && (
              <div className={styles.empty}>No activity yet. Send a message to see logs.</div>
            )}
            {geminiLog.map((entry) => (
              <div key={entry.id} className={styles.logEntry}>
                <span className={styles.logTime}>{entry.time}</span>
                <span className={styles.logType} style={{ color: typeColor[entry.type] }}>
                  {typeLabel[entry.type]}
                </span>
                <span className={styles.logContent}>{entry.content}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      ) : (
        <div className={styles.infoLayout}>
          {/* Top ~75%: Context */}
          <div className={styles.contextSection}>
            {!info ? (
              <div className={styles.empty}>Loading...</div>
            ) : (
              <>
                <div className={styles.row}>
                  <span className={styles.label}>Model</span>
                  <span className={styles.value}>{info.model}</span>
                </div>
                <div className={styles.row}>
                  <span className={styles.label}>Tools</span>
                  <span className={styles.value}>{info.tools.join(", ")}</span>
                </div>
                <div className={styles.row}>
                  <span className={styles.label}>History</span>
                  <span className={styles.value}>{info.history_length} messages</span>
                </div>
                <div className={styles.row}>
                  <span className={styles.label}>Anims</span>
                  <span className={styles.value}>{Object.keys(info.anim_aliases).length} aliases</span>
                </div>

                {lastActions.length > 0 && (
                  <>
                    <div className={styles.subheader}>Recent Actions</div>
                    {lastActions.slice(-10).reverse().map((a, i) => (
                      <div key={i} className={styles.logEntry}>
                        <span className={styles.logType} style={{ color: "#f472b6" }}>{a.type}</span>
                        <span className={styles.logContent}>
                          {a.type === "play_animation" ? String(a.animation) :
                           a.type === "set_expression" ? `${a.expression} @ ${a.intensity}` :
                           a.type === "play_music" ? String(a.song) : JSON.stringify(a)}
                        </span>
                      </div>
                    ))}
                  </>
                )}

                <div className={styles.subheader}>System Prompt</div>
                <pre className={styles.pre}>{info.system_prompt_full}</pre>
              </>
            )}
          </div>

          {/* Bottom ~25%: Face Tracking */}
          <div className={styles.faceSection}>
            <div className={styles.faceSectionHeader}>
              <span className={styles.subheader} style={{ margin: 0 }}>Face Tracking</span>
              <span className={faceActive ? styles.statusOn : styles.statusOff}>
                {faceActive ? "ON" : "OFF"}
              </span>
            </div>
            {faceState ? (
              <div className={styles.faceGrid}>
                {faceMeters.map(([name, val, display]) => (
                  <div key={name} className={styles.meterRow}>
                    <span className={styles.meterLabel}>{name}</span>
                    <div className={styles.meter}>
                      <div
                        className={styles.meterFill}
                        style={{
                          width: `${Math.min(100, Math.abs(val) * 100)}%`,
                          background: Math.abs(val) > 0.5 ? "#f59e0b" : "#444",
                        }}
                      />
                    </div>
                    <span className={styles.meterVal}>{display}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.faceEmpty}>
                {faceActive ? "Waiting..." : "Enable FT to see data"}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
