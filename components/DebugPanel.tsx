"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "./DebugPanel.module.css";
import { getDebugInfo, type DebugInfo } from "@/lib/api";

interface DebugPanelProps {
  lastActions: { type: string; [key: string]: unknown }[];
}

export default function DebugPanel({ lastActions }: DebugPanelProps) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<DebugInfo | null>(null);
  const [tab, setTab] = useState<"context" | "prompt" | "history">("context");

  const refresh = useCallback(() => {
    getDebugInfo().then(setInfo).catch(() => {});
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  // Auto-refresh when new actions come in
  useEffect(() => {
    if (open && lastActions.length) refresh();
  }, [lastActions, open, refresh]);

  if (!open) {
    return (
      <button className={styles.toggle} onClick={() => setOpen(true)} title="Debug">
        &#9881; Debug
      </button>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Debug</span>
        <div className={styles.tabs}>
          <button className={tab === "context" ? styles.activeTab : ""} onClick={() => setTab("context")}>Context</button>
          <button className={tab === "prompt" ? styles.activeTab : ""} onClick={() => setTab("prompt")}>Prompt</button>
          <button className={tab === "history" ? styles.activeTab : ""} onClick={() => setTab("history")}>History</button>
        </div>
        <button className={styles.refreshBtn} onClick={refresh}>&#8635;</button>
        <button className={styles.closeBtn} onClick={() => setOpen(false)}>&times;</button>
      </div>

      <div className={styles.body}>
        {!info ? (
          <div className={styles.loading}>Loading...</div>
        ) : tab === "context" ? (
          <div className={styles.section}>
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
              <span className={styles.label}>Animations</span>
              <span className={styles.value}>{Object.keys(info.anim_aliases).length} aliases</span>
            </div>
            {lastActions.length > 0 && (
              <>
                <div className={styles.subheader}>Recent Actions</div>
                {lastActions.slice(-5).reverse().map((a, i) => (
                  <div key={i} className={styles.actionRow}>
                    <span className={styles.actionType}>{a.type}</span>
                    <span className={styles.actionDetail}>
                      {a.type === "play_animation" ? String(a.animation) :
                       a.type === "set_expression" ? `${a.expression} @ ${a.intensity}` :
                       a.type === "play_music" ? String(a.song) : JSON.stringify(a)}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        ) : tab === "prompt" ? (
          <pre className={styles.pre}>{info.system_prompt_full}</pre>
        ) : (
          <div className={styles.section}>
            {info.history_last_5.length === 0 ? (
              <div className={styles.empty}>No history yet</div>
            ) : (
              info.history_last_5.map((m, i) => (
                <div key={i} className={`${styles.historyMsg} ${styles[m.role]}`}>
                  <span className={styles.historyRole}>{m.role}</span>
                  <span className={styles.historyText}>{m.text.slice(0, 200)}{m.text.length > 200 ? "..." : ""}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
