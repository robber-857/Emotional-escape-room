import type { Metadata } from "next";
import "./globals.css";
import {ScoreInspector} from "../features/scoring/ScoreInspector";

export const metadata: Metadata = {
  title: "分离之河 · 情感密室",
  description: "第一幕：在河岸探索，找到属于你的过河方式。",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}<ScoreInspector/></body>
    </html>
  );
}
