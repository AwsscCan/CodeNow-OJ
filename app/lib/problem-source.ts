type ProblemSource = { id: string; sourceUrl?: string };

export function getProblemSourceLabel(problem: ProblemSource) {
  const url = problem.sourceUrl || "";
  if (url.includes("oj.shumeng.tech/p/CSP")) return "CSP 认证真题 · 曙梦 OJ";
  if (problem.id.startsWith("AW")) {
    return url.includes("cnblogs.com") ? "AcWing 题面 · 博客园整理" : "AcWing 题库";
  }
  if (!url) return "CodeNow 内置题库";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "外部题源";
  }
}
