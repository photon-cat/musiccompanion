"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import styles from "./AriaChat.module.css";
import { sendChat, clearChat as apiClearChat, getHistory, getMusicScripts, type SongInfo, type ChatMessage } from "@/lib/api";
import { VOICES } from "@/lib/constants";
import type { UseVoiceReturn } from "@/hooks/useVoice";
import type { UseFaceTrackReturn } from "@/hooks/useFaceTrack";

interface AriaChatProps {
  voice: UseVoiceReturn;
  onAvatarAction: (type: string, params: Record<string, unknown>) => void;
  onStartMusic: (song: SongInfo) => void;
  faceTrack: UseFaceTrackReturn;
  faceContextEnabled: boolean;
  onToggleFaceContext: (enabled: boolean) => void;
}

interface DisplayMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
}

let msgCounter = 0;
function nextId() { return `msg-${++msgCounter}`; }

export default function AriaChat({ voice, onAvatarAction, onStartMusic, faceTrack, faceContextEnabled, onToggleFaceContext }: AriaChatProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [songs, setSongs] = useState<SongInfo[]>([]);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // Load history and songs on mount
  useEffect(() => {
    getHistory().then((data) => {
      if (data.messages?.length) {
        setMessages(data.messages.map((m) => ({ id: nextId(), role: m.role, text: m.text })));
      }
    });
    getMusicScripts().then((data) => {
      setSongs(data.scripts || []);
    }).catch(() => {});
  }, []);

  const addMessage = useCallback((role: DisplayMessage["role"], text: string) => {
    const msg: DisplayMessage = { id: nextId(), role, text };
    setMessages((prev) => [...prev, msg]);
    return msg.id;
  }, []);

  const removeMessage = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const updateMessage = useCallback((id: string, text: string) => {
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, text } : m));
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setSending(true);

    addMessage("user", text);

    // If voice connected, send via WS
    if (voice.voiceConnected) {
      voice.sendText(text);
      setSending(false);
      inputRef.current?.focus();
      return;
    }

    // Text chat via REST — optionally prepend face context
    let messageToSend = text;
    if (faceContextEnabled && faceTrack.active) {
      const faceDesc = faceTrack.describeFace();
      if (faceDesc) messageToSend = `${faceDesc}\n${text}`;
    }
    const typingId = addMessage("assistant", "typing...");
    try {
      const data = await sendChat(messageToSend);
      removeMessage(typingId);
      if (data.reply) {
        addMessage("assistant", data.reply);
        voice.triggerTalkingAnimation();
      }
      if (data.actions?.length) {
        for (const action of data.actions) {
          if (action.type === "play_animation") {
            onAvatarAction("play_animation", { animation: action.animation });
          } else if (action.type === "set_expression") {
            onAvatarAction("set_expression", { expression: action.expression, intensity: action.intensity });
          } else if (action.type === "play_music") {
            const songName = (action.song || "").toLowerCase();
            const song = songs.find((s) => s.name.toLowerCase().includes(songName));
            if (song?.audio_url) {
              addMessage("system", `Playing ${song.name}...`);
              onStartMusic(song);
            }
          }
        }
      }
    } catch (e: unknown) {
      removeMessage(typingId);
      addMessage("assistant", "Error: " + (e instanceof Error ? e.message : String(e)));
    }

    setSending(false);
    inputRef.current?.focus();
  }, [input, voice, songs, addMessage, removeMessage, onAvatarAction, onStartMusic, faceTrack, faceContextEnabled]);

  const handleClear = useCallback(async () => {
    await apiClearChat();
    setMessages([]);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleSuggestion = useCallback((text: string) => {
    setInput(text);
    inputRef.current?.focus();
  }, []);

  const showWelcome = messages.length === 0;

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.title}>Aria</span>
          <span className={styles.voiceStatus}>{voice.voiceStatus}</span>
        </div>
        <div className={styles.headerRight}>
          <button
            className={`${styles.faceTrackBtn} ${faceTrack.active ? styles.faceTrackActive : ""}`}
            onClick={() => faceTrack.active ? faceTrack.stop() : faceTrack.start()}
            disabled={faceTrack.loading}
            title={faceTrack.active ? "Stop face tracking" : "Start face tracking"}
          >
            {faceTrack.loading ? "..." : "FT"}
          </button>
          {faceTrack.active && (
            <button
              className={`${styles.faceCtxBtn} ${faceContextEnabled ? styles.faceCtxActive : ""}`}
              onClick={() => onToggleFaceContext(!faceContextEnabled)}
              title={faceContextEnabled ? "Face context ON — model sees your expressions" : "Face context OFF — click to enable"}
            >
              CTX
            </button>
          )}
          <div className={styles.voicePicker}>
            <label htmlFor="voice-select">Voice:</label>
            <select
              id="voice-select"
              className={styles.voiceSelect}
              value={voice.selectedVoice}
              onChange={(e) => voice.setSelectedVoice(e.target.value)}
            >
              {VOICES.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} - {v.style}
                </option>
              ))}
            </select>
          </div>
          <button className={styles.clearBtn} onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={chatRef} className={styles.body}>
        {showWelcome ? (
          <div className={styles.welcome}>
            <h2 className={styles.greeting}>Hey there</h2>
            <p className={styles.subtitle}>What would you like to do?</p>
            <div className={styles.suggestions}>
              <button onClick={() => handleSuggestion("Play some music")}>Play some music</button>
              <button onClick={() => handleSuggestion("Tell me about yourself")}>Who are you?</button>
              <button onClick={() => handleSuggestion("Show me a dance")}>Show me a dance</button>
            </div>
          </div>
        ) : (
          <div className={styles.messages}>
            {messages.map((msg) => (
              <div key={msg.id} className={`${styles.message} ${styles[`message${capitalize(msg.role)}`]}`}>
                {msg.role !== "system" && (
                  <div className={styles.role}>{msg.role === "user" ? "You" : "Aria"}</div>
                )}
                <div className={styles.content}>{msg.text}</div>
                {/* Song list for system "playing" messages */}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className={styles.inputArea}>
        <div className={styles.inputBox}>
          <button
            className={`${styles.micBtn} ${voice.micActive ? styles.micActive : ""} ${voice.speaking ? styles.micSpeaking : ""}`}
            onClick={voice.toggleMic}
          >
            &#127908;
          </button>
          <textarea
            ref={inputRef}
            className={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Talk to Aria... ask her to play music, dance, or just chat"
            rows={1}
          />
          <button
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={sending || !input.trim()}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
