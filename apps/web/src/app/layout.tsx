import type { Metadata } from "next";
import "./globals.css";
import { GameShell } from "../features/cover/GameShell";

export const metadata: Metadata = {
  title: "情感密室 · The Emotional Room",
  description: "一个关于你与爱的探索之旅。每一次选择，都是一次靠近真实的自己。",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body><GameShell>{children}</GameShell></body>
    </html>
  );
}
