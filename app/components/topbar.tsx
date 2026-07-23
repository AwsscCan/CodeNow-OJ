"use client";

import { useRouter, usePathname } from "next/navigation";
import { useThemeStore } from "../stores/theme-store";

export function Topbar({ onToast }: { onToast: (msg: string) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const { themeMode, setThemeMode } = useThemeStore();

  const isActive = (page: string) => {
    if (page === "library") return pathname === "/library" || pathname.startsWith("/library");
    if (page === "workspace") return pathname === "/" || pathname.startsWith("/problem");
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
        <button onClick={() => onToast("讨论区正在开发中，敬请期待")}>讨论</button>
      </nav>
      <div className="header-actions">
        <label className="theme-picker" title="切换网站主题">
          <span aria-hidden="true">✦</span>
          <select
            aria-label="网站主题"
            value={themeMode}
            onChange={(event) => setThemeMode(event.target.value as "light" | "dark" | "girl")}
          >
            <option value="light">亮色</option>
            <option value="dark">暗色</option>
            <option value="girl">少女</option>
          </select>
        </label>
        <span className="avatar">LR</span>
        <div className="user-copy"><b>LinR</b><small>Lv.12 · 1842</small></div>
      </div>
    </header>
  );
}
