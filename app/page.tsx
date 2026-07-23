"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useThemeStore } from "./stores/theme-store";
import { loadAcwingCatalog } from "./stores/library-store";
import { Toast } from "./components/toast";
import { useToast } from "./hooks/use-toast";

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
          <button onClick={() => toast("讨论区正在开发中，敬请期待")}>讨论</button>
        </nav>
        <div className="header-actions">
          <label className="theme-picker" title="切换网站主题">
            <span aria-hidden="true">✦</span>
            <select aria-label="网站主题" value={theme.themeMode} onChange={(e) => theme.setThemeMode(e.target.value as "light"|"dark"|"girl")}>
              <option value="light">亮色</option><option value="dark">暗色</option><option value="girl">少女</option>
            </select>
          </label>
          <span className="avatar">LR</span>
          <div className="user-copy"><b>LinR</b><small>Lv.12 · 1842</small></div>
        </div>
      </header>

      <section style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 58px)", gap: "24px", padding: "40px 24px" }}>
        <div style={{ textAlign: "center", maxWidth: "520px" }}>
          <span style={{ color: "#3478f6", fontSize: "10px", fontWeight: 800, letterSpacing: "1.4px" }}>CODENOW ONLINE JUDGE</span>
          <h1 style={{ fontSize: "36px", margin: "12px 0 8px", letterSpacing: "-0.8px" }}>CodeNow OJ</h1>
          <p style={{ color: "#7f8999", fontSize: "14px", lineHeight: 1.8 }}>
            GNU C++17 在线编程平台。<br />
            粘贴题面 AI 生成练习与测试点，在线编译提交判题。
          </p>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <button onClick={() => router.push("/library")} style={{ border: "0", borderRadius: "10px", padding: "14px 28px", color: "#fff", background: "linear-gradient(100deg,#6b46d9,#8a58df)", fontSize: "13px", fontWeight: 700, cursor: "pointer", boxShadow: "0 5px 16px #7045d747" }}>
            进入题库 ▸
          </button>
          <button onClick={() => router.push("/problem/P1001")} style={{ border: "1px solid #dfe3ea", borderRadius: "10px", padding: "14px 28px", color: "#3478f6", background: "#fff", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
            开始做题 →
          </button>
        </div>
      </section>

      <Toast message={notice} />
    </main>
  );
}
