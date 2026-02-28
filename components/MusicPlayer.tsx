"use client";

import { useState, useEffect, useCallback, MutableRefObject } from "react";
import styles from "./MusicPlayer.module.css";
import { formatTime, getInterpolatedDirective, type MusicScript } from "@/lib/music";

interface MusicPlayerProps {
  script: MusicScript;
  audioRef: MutableRefObject<HTMLAudioElement | null>;
  onStop: () => void;
}

export default function MusicPlayer({ script, audioRef, onStop }: MusicPlayerProps) {
  const [playing, setPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [directiveText, setDirectiveText] = useState("");

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      const t = audio.currentTime;
      setCurrentTime(t);
      const d = getInterpolatedDirective(script, t);
      if (d) setDirectiveText(d.description || "");
    };

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [audioRef, script]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play();
    else audio.pause();
  }, [audioRef]);

  const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (audio) audio.currentTime = parseFloat(e.target.value);
  }, [audioRef]);

  return (
    <div className={styles.player}>
      <div className={styles.top}>
        <button className={styles.closeBtn} onClick={onStop} title="End music session">
          &times;
        </button>
        <div className={styles.songTitle}>{script.duration ? "Now Playing" : "-"}</div>
        <button className={styles.playBtn} onClick={togglePlay} title="Play/Pause">
          {playing ? "\u23F8" : "\u25B6"}
        </button>
        <div className={styles.time}>
          {formatTime(currentTime)} / {formatTime(script.duration)}
        </div>
      </div>
      <input
        type="range"
        className={styles.scrubber}
        min={0}
        max={script.duration}
        value={currentTime}
        step={0.1}
        onChange={handleScrub}
      />
      <div className={styles.directiveLabel}>{directiveText}</div>
    </div>
  );
}
