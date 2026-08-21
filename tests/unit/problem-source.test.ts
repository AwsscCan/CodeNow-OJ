import { describe, expect, it } from "vitest";
import { getProblemSourceLabel } from "../../app/lib/problem-source";

describe("内置题来源标签", () => {
  it("曙梦 OJ 的 CSP 页面显示真实 CSP 来源", () => {
    expect(getProblemSourceLabel({ id: "CS0331", sourceUrl: "https://oj.shumeng.tech/p/CSP202403A" }))
      .toBe("CSP 认证真题 · 曙梦 OJ");
  });

  it("AcWing 博客整理题显示题源与整理站点", () => {
    expect(getProblemSourceLabel({ id: "AW791", sourceUrl: "https://www.cnblogs.com/example" }))
      .toBe("AcWing 题面 · 博客园整理");
  });

  it("没有外部 URL 的经典题显示 CodeNow 内置来源", () => {
    expect(getProblemSourceLabel({ id: "CL001", sourceUrl: "" }))
      .toBe("CodeNow 内置题库");
  });
});
