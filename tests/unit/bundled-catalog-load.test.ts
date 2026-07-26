// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetBundledCatalogForTests,
  getAcwingProblems,
  loadAcwingCatalog,
} from "../../app/stores/library-store";

afterEach(() => {
  __resetBundledCatalogForTests();
  vi.unstubAllGlobals();
});

describe("内置题源合并加载", () => {
  it("同时拉取 AcWing/经典/竞赛三个题源并合并", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const path = String(url);
      if (path.includes("acwing")) return new Response(JSON.stringify([{ id: "AW1", title: "a", folder: "acwing/x", samples: [] }]), { status: 200 });
      if (path.includes("classic")) return new Response(JSON.stringify([{ id: "CL1", title: "c", folder: "经典题库/x", samples: [] }]), { status: 200 });
      return new Response(JSON.stringify([{ id: "CS1", title: "s", folder: "CSP 历年真题/x", samples: [] }]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    __resetBundledCatalogForTests();
    await loadAcwingCatalog();
    const ids = getAcwingProblems().map((p) => p.id);
    expect(ids).toContain("AW1");
    expect(ids).toContain("CL1");
    expect(ids).toContain("CS1");
  });

  it("某一题源加载失败不拖垮其它题源", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const path = String(url);
      if (path.includes("classic")) return new Response(JSON.stringify([{ id: "CL1", title: "c", folder: "经典题库/x", samples: [] }]), { status: 200 });
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);
    __resetBundledCatalogForTests();
    await loadAcwingCatalog();
    expect(getAcwingProblems().map((p) => p.id)).toEqual(["CL1"]);
  });
});
