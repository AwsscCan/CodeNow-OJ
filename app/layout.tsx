import type { Metadata } from "next";
import { InvitationPasswordGate } from "./components/invitation-password-gate";
import { LocalDataMigration } from "./components/local-data-migration";
import { MascotWrapper } from "./components/mascot-wrapper";
import { PreferenceSync } from "./components/preference-sync";
import "./globals.css";

export const metadata: Metadata = {
  title: "CodeNow OJ — 在线编程与 AI 解题平台",
  description: "CodeNow 是面向 GNU C++17 的在线编程平台：粘贴题面即可用 AI 生成练习与测试点，也可导入 JSON、生成解答、在线编译和提交。",
  icons: { icon: "/codenow/icon.jpg", shortcut: "/codenow/icon.jpg", apple: "/codenow/icon.jpg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}<InvitationPasswordGate /><PreferenceSync /><LocalDataMigration /><MascotWrapper /></body></html>;
}
