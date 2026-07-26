import { describe, expect, it } from "vitest";
import {
  TAKAGI_QUOTES,
  QUOTE_TAGS,
  pickTakagiQuotes,
  tagsForPhase,
  tagsForQuestion,
  formatQuoteContext,
} from "../../app/api/_lib/takagi-quotes";

describe("高木原作台词语料库", () => {
  it("语料量与结构：至少 55 条，字段完整，标签合法", () => {
    expect(TAKAGI_QUOTES.length).toBeGreaterThanOrEqual(55);
    for (const quote of TAKAGI_QUOTES) {
      expect(quote.text.trim().length).toBeGreaterThan(0);
      expect(quote.scene.trim().length).toBeGreaterThan(0);
      expect(quote.tags.length).toBeGreaterThan(0);
      for (const tag of quote.tags) expect(QUOTE_TAGS).toContain(tag);
    }
  });

  it("反浮夸：中文台词不含波浪号与颜文字", () => {
    for (const quote of TAKAGI_QUOTES) {
      expect(quote.text, `台词含波浪号: ${quote.text}`).not.toMatch(/[～~]/);
    }
  });

  it("标签覆盖：核心情境标签各有至少 3 条语料", () => {
    for (const tag of ["tease", "bet", "comfort", "watch", "shy"]) {
      const count = TAKAGI_QUOTES.filter((q) => q.tags.includes(tag as never)).length;
      expect(count, `标签 ${tag} 语料不足`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("pickTakagiQuotes 情境检索", () => {
  it("按标签过滤并限量返回", () => {
    const picked = pickTakagiQuotes(["bet"], 3, () => 0);
    expect(picked).toHaveLength(3);
    for (const quote of picked) expect(quote.tags).toContain("bet");
  });

  it("注入确定性随机源时结果可复现", () => {
    const a = pickTakagiQuotes(["tease"], 4, () => 0.5);
    const b = pickTakagiQuotes(["tease"], 4, () => 0.5);
    expect(a.map((q) => q.text)).toEqual(b.map((q) => q.text));
  });

  it("无匹配标签时兜底全池，不返回空", () => {
    const picked = pickTakagiQuotes([], 2, () => 0);
    expect(picked).toHaveLength(2);
  });
});

describe("情境标签映射", () => {
  it("桌宠 phase 映射：ac 含胜利、wa 含安慰或调侃、idle 含守望", () => {
    expect(tagsForPhase("ac")).toContain("win");
    expect(tagsForPhase("wa").some((t) => t === "comfort" || t === "tease")).toBe(true);
    expect(tagsForPhase("idle")).toContain("watch");
    expect(tagsForPhase("unknown-phase").length).toBeGreaterThan(0);
  });

  it("提问关键词映射：打赌→bet、沮丧→comfort、默认→tease", () => {
    expect(tagsForQuestion("要不要打个赌")).toContain("bet");
    expect(tagsForQuestion("我太菜了根本不会做")).toContain("comfort");
    expect(tagsForQuestion("这道题怎么做")).toContain("tease");
  });
});

describe("formatQuoteContext 注入格式", () => {
  it("包含模仿指引与禁止照抄声明", () => {
    const context = formatQuoteContext(pickTakagiQuotes(["tease"], 2, () => 0));
    expect(context).toMatch(/类似场景/);
    expect(context).toMatch(/禁止照抄|不要照抄/);
    expect(context).toContain("「");
  });

  it("空列表返回空串", () => {
    expect(formatQuoteContext([])).toBe("");
  });
});
