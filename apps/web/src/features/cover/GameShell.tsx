"use client";

import { useCallback, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ScoreInspector } from "../scoring/ScoreInspector";
import { GameCover } from "./GameCover";
import styles from "./cover.module.css";

function GameEntry({ children }: { children: ReactNode }) {
  const [entered, setEntered] = useState(false);
  const enter = useCallback(() => setEntered(true), []);

  // Do not mount the game or its server inspector behind the cover. In
  // particular, L1's explicit restart flow must wait until the cover finishes.
  if (!entered) return <GameCover onEnter={enter} />;

  return (
    <>
      <div className={styles.sceneEntrance}>{children}</div>
      <ScoreInspector />
    </>
  );
}

export function GameShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/") return <GameEntry>{children}</GameEntry>;
  return <>{children}<ScoreInspector /></>;
}
