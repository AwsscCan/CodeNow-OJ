import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LocalDataMigration } from "./components/local-data-migration";
import { InvitationPasswordGate } from "./components/invitation-password-gate";
import { MascotWrapper } from "./components/mascot-wrapper";
import { PreferenceSync } from "./components/preference-sync";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CodeNow OJ — 在线编程与 AI 解题平台",
  description: "CodeNow 是面向 GNU C++17 的在线编程平台：粘贴题面即可用 AI 生成练习与测试点，也可导入 JSON、生成解答、在线编译和提交。",
  icons: { icon: "/codenow/icon.jpg", shortcut: "/codenow/icon.jpg", apple: "/codenow/icon.jpg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}<InvitationPasswordGate /><PreferenceSync /><LocalDataMigration /><MascotWrapper /></body></html>;
}
