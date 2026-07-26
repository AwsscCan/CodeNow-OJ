"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AuthStatus } from "./components/auth-status";
import { Toast } from "./components/toast";
import { useToast } from "./hooks/use-toast";
import { loadAcwingCatalog } from "./stores/library-store";
import { useThemeStore } from "./stores/theme-store";

export default function Home() {
  const router = useRouter();
  const theme = useThemeStore();
  const { notice, toast } = useToast();

  useEffect(() => { loadAcwingCatalog(); }, []);

  return (
    <main className={`app-shell theme-${theme.themeMode}`}>
      <header className="topbar">
        <div className="brand"><img className="brand-mark" src="/codenow/icon.jpg" alt="CodeNow 图标" /><span>CodeNow</span><em>OJ</em></div>
        <nav>
          <button onClick={() => router.push("/library")}>题库</button>
          <button className="nav-active">做题</button>
          <button onClick={() => toast("比赛功能正在开发中，敬请期待")}>比赛</button>
          <button onClick={() => router.push("/notes")}>讨论</button>
        </nav>
        <div className="header-actions">
          <label className="theme-picker" title="切换网站主题">
            <span aria-hidden="true">✦</span>
            <select aria-label="网站主题" value={theme.themeMode} onChange={(e) => theme.setThemeMode(e.target.value as "light"|"dark"|"girl")}>
              <option value="light">亮色</option><option value="dark">暗色</option><option value="girl">少女</option>
            </select>
          </label>
          <AuthStatus onSignedOut={() => {}} />
        </div>
      </header>

      <section className="hero-section" aria-label="CodeNow 在线判题平台">
        <div className="hero-copy">
          <span className="hero-eyebrow">CODENOW ONLINE JUDGE</span>
          <h1 className="hero-title">CodeNow OJ</h1>
          <p className="hero-tagline">
            GNU C++17 在线编程平台。<br />
            粘贴题面 AI 生成练习与测试点，在线编译提交判题。
          </p>
        </div>
        <div className="hero-cta-group">
          <button className="hero-cta-primary" onClick={() => router.push("/library")}>
            进入题库 <span className="hero-cta-arrow" aria-hidden="true">▸</span>
          </button>
          <button className="hero-cta-secondary" onClick={() => router.push("/problem/P1001")}>
            开始做题 <span className="hero-cta-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </section>

      <Toast message={notice} />
    </main>
  );
}
