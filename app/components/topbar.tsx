"use client";

import { useRouter, usePathname } from "next/navigation";
import { useThemeStore } from "../stores/theme-store";
import { AuthStatus } from "./auth-status";

const THEME_OPTIONS = [
  { value: "light", label: "亮色", icon: "☀" },
  { value: "dark", label: "暗色", icon: "☾" },
  { value: "girl", label: "少女", icon: "❀" },
] as const;

export function Topbar({ onToast, onSignedOut = () => {} }: { onToast: (msg: string) => void; onSignedOut?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const { themeMode, setThemeMode } = useThemeStore();

  const isActive = (page: string) => {
    if (page === "library") return pathname === "/library" || pathname.startsWith("/library");
    if (page === "workspace") return pathname === "/" || pathname.startsWith("/problem");
    if (page === "notes") return pathname === "/notes" || pathname.startsWith("/notes");
    return false;
  };

  return (
    <header className="topbar">
      <div className="brand">
        <img className="brand-mark" src="/codenow/icon.jpg" alt="CodeNow 图标" />
        <span>CodeNow</span><em>OJ</em>
      </div>
      <nav>
        <button className={isActive("library") ? "nav-active" : ""} onClick={() => router.push("/library")}>
          题库
        </button>
        <button className={isActive("workspace") ? "nav-active" : ""} onClick={() => router.push("/")}>
          做题
        </button>
        <button onClick={() => onToast("比赛功能正在开发中，敬请期待")}>比赛</button>
        <button className={isActive("notes") ? "nav-active" : ""} onClick={() => router.push("/notes")}>讨论</button>
      </nav>
      <div className="header-actions">
        <div className="theme-switch" role="radiogroup" aria-label="网站主题" title="切换网站主题">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={themeMode === option.value}
              className={themeMode === option.value ? "active" : ""}
              onClick={() => setThemeMode(option.value)}
            >
              <span aria-hidden="true">{option.icon}</span>{option.label}
            </button>
          ))}
        </div>
        <AuthStatus onSignedOut={onSignedOut} />
      </div>
    </header>
  );
}
