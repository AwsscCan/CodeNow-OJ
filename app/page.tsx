"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Toast } from "./components/toast";
import { Topbar } from "./components/topbar";
import { useToast } from "./hooks/use-toast";
import { getAcwingProblems, loadAcwingCatalog, loadBundledSamples, useLibraryStore } from "./stores/library-store";
import { INITIAL_PROBLEM, useProblemStore, type Problem } from "./stores/problem-store";
import { useThemeStore } from "./stores/theme-store";

export default function Home() {
  const router = useRouter();
  const theme = useThemeStore();
  const { notice, toast } = useToast();
  const problem = useProblemStore((s) => s.problem);
  const loadLocalProblem = useProblemStore((s) => s.loadLocalProblem);

  // 订阅 catalogVersion：题源异步加载完成后刷新精选题
  useLibraryStore((s) => s.catalogVersion);
  useEffect(() => { loadAcwingCatalog(); }, []);

  const picks = getAcwingProblems().slice(0, 3);

  /**
   * 装载题目到工作区并进入做题页
   */
  async function openProblem(item: Problem) {
    // 索引精选题 samples 为空，按需拉取完整测试点再进入做题页
    const samples = item.samples.length ? item.samples : await loadBundledSamples(item.id);
    loadLocalProblem({ ...item, samples });
    router.push(`/problem/${item.id}`);
  }

  return (
    <main className={`app-shell theme-${theme.themeMode}`}>
      <Topbar onToast={toast} />

      <section className="hero-section" aria-label="CodeNow 在线判题平台">
        <div className="hero-copy">
          <span className="hero-eyebrow">CODENOW ONLINE JUDGE</span>
          <h1 className="hero-title">CodeNow OJ</h1>
          <p className="hero-tagline">
            GNU C++17 在线编程平台。<br />
            粘贴题面 AI 生成练习与测试点，在线编译提交判题。
          </p>
          <div className="hero-cta-group">
            <button className="hero-cta-primary" aria-label="开始做题" onClick={() => router.push(`/problem/${problem.id}`)}>
              开始做题 <span className="hero-cta-arrow" aria-hidden="true">→</span>
            </button>
            <button className="hero-cta-secondary" aria-label="进入题库" onClick={() => router.push("/library")}>
              进入题库 <span className="hero-cta-arrow" aria-hidden="true">▸</span>
            </button>
          </div>
          <p className="hero-current">工作区当前题目 <code>{problem.id}</code> · {problem.title}，点「开始做题」直接继续</p>
        </div>

        <aside className="quick-start" aria-label="快速开始做题">
          {theme.themeMode === "girl" && (
            <div className="quick-start-companion" aria-hidden="true">
              <img src="/codenow/study-smile.jpg" alt="" loading="lazy" decoding="async" />
              <span>一起刷题吧 · 一緒にやろ？</span>
            </div>
          )}
          <header>
            <span className="quick-start-kicker">QUICK START</span>
            <h2>快速开始</h2>
            <p>选一道题，立刻进入编程与判题工作区</p>
          </header>
          <button type="button" className="quick-start-item" onClick={() => openProblem(INITIAL_PROBLEM)}>
            <code>{INITIAL_PROBLEM.id}</code>
            <span><b>{INITIAL_PROBLEM.title}</b><small>经典入门 · 内置题目</small></span>
            <i aria-hidden="true">→</i>
          </button>
          {picks.map((item) => (
            <button type="button" className="quick-start-item" key={item.id} onClick={() => openProblem(item)}>
              <code>{item.id}</code>
              <span><b>{item.title}</b><small>{item.difficulty} · AcWing 精选</small></span>
              <i aria-hidden="true">→</i>
            </button>
          ))}
          <button type="button" className="quick-start-more" onClick={() => router.push("/library")}>
            浏览全部题目 <span aria-hidden="true">→</span>
          </button>
        </aside>
      </section>

      <Toast message={notice} />
    </main>
  );
}
