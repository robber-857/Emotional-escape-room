"use client";

import { useEffect, useState } from "react";
import styles from "./cover.module.css";

// Use both dimensions so a phone remains a phone after rotating, including
// wide landscape devices. Fine-pointer desktop windows keep the Web entry.
const MOBILE_QUERY = "(pointer: coarse) and (max-width: 900px), (pointer: coarse) and (max-height: 600px)";

function RotationCue() {
  return (
    <svg className={styles.rotationIcon} viewBox="0 0 150 78" fill="none" aria-hidden="true">
      <g className={styles.rotatingPhone}>
        <rect x="28" y="22" width="28" height="49" rx="4" />
        <path d="M38 27h8M39 66h6" opacity=".55" />
      </g>
      <g opacity=".75">
        <rect x="92" y="37" width="49" height="28" rx="4" />
        <path d="M136 47v8" opacity=".55" />
      </g>
      <path className={styles.rotationArrow} d="M40 13C64-3 94 3 112 24m-2-13 3 14-14-2" />
    </svg>
  );
}

export function GameCover({ onEnter }: { onEnter: () => void }) {
  const [stage, setStage] = useState(0);
  const [mobile, setMobile] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [visible, setVisible] = useState(true);
  const [requestedEntry, setRequestedEntry] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const deviceQuery = window.matchMedia(MOBILE_QUERY);
    const orientationQuery = window.matchMedia("(orientation: portrait)");
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setMobile(deviceQuery.matches);
      setPortrait(deviceQuery.matches && orientationQuery.matches);
      setReducedMotion(motionQuery.matches);
    };
    const visibility = () => setVisible(document.visibilityState === "visible");
    update();
    visibility();
    deviceQuery.addEventListener("change", update);
    orientationQuery.addEventListener("change", update);
    motionQuery.addEventListener("change", update);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      deviceQuery.removeEventListener("change", update);
      orientationQuery.removeEventListener("change", update);
      motionQuery.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  useEffect(() => {
    // Reveal the supplied artwork, then enable entry after the opening pause.
    // Orientation guidance appears at 2s. No storage or game API calls here.
    const delays = reducedMotion ? [0, 100, 200] : [500, 1000, 2000];
    const timers = delays.map((delay, index) => window.setTimeout(() => setStage(current => Math.max(current, index + 1)), delay));
    return () => timers.forEach(window.clearTimeout);
  }, [reducedMotion]);

  useEffect(() => {
    const canEnter = stage === 3 && visible && (mobile ? !portrait : requestedEntry);
    if (!canEnter) {
      setExiting(false);
      return;
    }
    // Keep the landscape logo visible briefly before dissolving into L1.
    // A rotation back to portrait or a hidden tab cancels both timers.
    const hold = reducedMotion ? 180 : mobile ? 1200 : 0;
    const fade = reducedMotion ? 150 : 800;
    const fadeTimer = window.setTimeout(() => setExiting(true), hold);
    const enterTimer = window.setTimeout(onEnter, hold + fade);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(enterTimer);
    };
  }, [stage, mobile, portrait, visible, requestedEntry, reducedMotion, onEnter]);

  return (
    <main
      className={styles.cover}
      data-game-cover
      data-stage={stage}
      data-mobile={mobile}
      data-portrait={portrait}
      data-exiting={exiting}
      aria-label="情感密室游戏封面"
    >
      <div className={styles.pictureFrame}>
        <img
          className={styles.coverImage}
          src="/game/cover/emotional-room.jpg"
          alt="一个关于你与爱的探索之旅。情感密室 — THE EMOTIONAL ROOM"
          width="1552"
          height="1013"
          fetchPriority="high"
          draggable={false}
        />
        {!mobile && (
          <button
            className={styles.enterButton}
            aria-label="进入你的故事"
            onClick={() => setRequestedEntry(true)}
            disabled={stage < 3 || requestedEntry}
          />
        )}
      </div>
      {mobile && portrait && (
        <div className={styles.orientation} aria-hidden={stage < 3}>
          <RotationCue />
          <p>转动手机，进入你的故事</p>
          <span>为了保证用户体验请翻转手机为横屏</span>
        </div>
      )}
    </main>
  );
}
