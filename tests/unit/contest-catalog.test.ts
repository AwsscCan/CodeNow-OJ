import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateCspCertificationSource } from "../../scripts/testgen/generate-bundled.mjs";

type Bundled = {
  id: string; title: string; folder: string; extractionStatus: string; sourceUrl: string;
  samples: Array<{ input: string; output: string; category?: string; scale?: number; targets?: string }>;
};

const filePath = resolve(import.meta.dirname, "../../public/contest-problems.json");
const catalog = existsSync(filePath) ? JSON.parse(readFileSync(filePath, "utf8")) as Bundled[] : [];
const catalogIndexPath = resolve(import.meta.dirname, "../../public/catalog-index.json");
const catalogIndex = existsSync(catalogIndexPath) ? JSON.parse(readFileSync(catalogIndexPath, "utf8")) as Array<{ id: string }> : [];
const cspSourcePath = resolve(import.meta.dirname, "../../scripts/testgen/csp-cert-source.json");
const cspSource = existsSync(cspSourcePath) ? JSON.parse(readFileSync(cspSourcePath, "utf8")) as Bundled[] : [];
const generatorPath = resolve(import.meta.dirname, "../../scripts/testgen/generate-bundled.mjs");
const expectedCertificationIds = Array.from({ length: 10 }, (_, sessionOffset) =>
  Array.from({ length: 5 }, (_, problemOffset) => `CS0${33 + sessionOffset}${problemOffset + 1}`),
).flat();
const expectedCertificationSources = [
  ["202403", "词频统计", "相似度计算", "化学方程式配平", "十滴水", "文件夹合并"],
  ["202406", "矩阵重塑（其一）", "矩阵重塑（其二）", "文本分词", "货物调度", "哥德尔机"],
  ["202409", "密码", "字符串变换", "补丁应用", "通讯延迟", "木板切割"],
  ["202412", "移动", "梦境巡查", "缓存模拟", "跳房子", "梦魔"],
  ["202503", "数值积分", "机器人饲养指南", "模板展开", "集体锻炼", "收费标准评估"],
  ["202506", "正态分布", "机器人复健指南", "消息解码", "月票发行", "博物馆"],
  ["202509", "蒙特卡洛", "水印检查", "HTTP 头信息", "造题计划（上）", "造题计划（下）"],
  ["202512", "集合", "数字变换", "图片解码", "C 形阵", "数据抢修"],
  ["202603", "平衡数", "机器人项目管理", "进程通信", "异或", "旅游计划 - Easy Ver."],
  ["202605", "银行家舍入", "机器人宿管指南", "死锁优化", "石子游戏", "绝世好串"],
] as const;

describe("竞赛真题题库数据质量契约", () => {
  it("打包器会在写入产物前预检 CSP 导入源", () => {
    const generator = readFileSync(generatorPath, "utf8");
    const preflight = generator.indexOf("validateCspCertificationSource(cspSource, CONTEST_DEFS)");
    const firstBuild = generator.indexOf("const classicCount = build(");

    expect(preflight).toBeGreaterThanOrEqual(0);
    expect(firstBuild).toBeGreaterThan(preflight);
  });

  it("CSP 导入源拒绝重复题号和错误来源地址", () => {
    expect(validateCspCertificationSource(cspSource)).toBe(cspSource);

    const duplicateId = cspSource.map((problem, index) => index === 1 ? { ...problem, id: cspSource[0].id } : problem);
    expect(() => validateCspCertificationSource(duplicateId)).toThrow(/重复题号|未知题号/);

    const wrongSourceUrl = cspSource.map((problem, index) => index === 0 ? { ...problem, sourceUrl: "https://example.invalid" } : problem);
    expect(() => validateCspCertificationSource(wrongSourceUrl)).toThrow(/来源 URL 错误/);
  });

  it("产物存在且题号唯一，归入竞赛真题文件夹", () => {
    expect(catalog.length).toBeGreaterThanOrEqual(7);
    expect(new Set(catalog.map((p) => p.id)).size).toBe(catalog.length);
    for (const p of catalog) {
      expect(p.id, p.id).toMatch(/^CS\d{3,4}$/);
      expect(p.folder.startsWith("竞赛真题/"), `${p.id} 应归入竞赛真题/`).toBe(true);
      expect(p.extractionStatus).toBe("complete");
    }
  });

  it("覆盖 CSP 认证 / CSP-J / NOIP / 蓝桥杯来源子文件夹", () => {
    const folders = new Set(catalog.map((p) => p.folder));
    expect([...folders].some((f) => f.includes("CSP 认证"))).toBe(true);
    expect([...folders].some((f) => f.includes("CSP-J"))).toBe(true);
    expect([...folders].some((f) => f.includes("NOIP"))).toBe(true);
    expect([...folders].some((f) => f.includes("蓝桥杯"))).toBe(true);
  });

  it("第33-42次 CSP 认证每届严格包含第1-5题，共50题", () => {
    const certification = catalog.filter((problem) => problem.folder.startsWith("竞赛真题/CSP 认证/"));
    expect(certification.map((problem) => problem.id).sort()).toEqual(expectedCertificationIds);
    for (let session = 33; session <= 42; session += 1) {
      const folder = `竞赛真题/CSP 认证/第${session}次`;
      expect(certification.filter((problem) => problem.folder === folder)).toHaveLength(5);
    }
  });

  it("50道题逐题匹配曙梦 OJ 的真实标题与来源页面", () => {
    const byId = new Map(catalog.map((problem) => [problem.id, problem]));
    expectedCertificationSources.forEach(([date, ...titles], sessionOffset) => {
      titles.forEach((title, problemOffset) => {
        const id = `CS0${33 + sessionOffset}${problemOffset + 1}`;
        const sourceId = `CSP${date}${String.fromCharCode(65 + problemOffset)}`;
        expect(byId.get(id)?.title, id).toBe(title);
        expect(byId.get(id)?.sourceUrl, id).toBe(`https://oj.shumeng.tech/p/${sourceId}`);
      });
    });
  });

  it("50道 CSP 认证题全部进入轻量索引并生成可读单题文件", () => {
    const indexIds = new Set(catalogIndex.map((problem) => problem.id));
    for (const id of expectedCertificationIds) {
      expect(indexIds.has(id), `${id} 缺少轻量索引`).toBe(true);
      const problemPath = resolve(import.meta.dirname, `../../public/problems/${id}.json`);
      expect(existsSync(problemPath), `${id} 缺少单题文件`).toBe(true);
      if (existsSync(problemPath)) expect((JSON.parse(readFileSync(problemPath, "utf8")) as Bundled).id).toBe(id);
    }
  });

  it("CSP 源、竞赛总表、索引元数据和单题文件逐项一致", () => {
    const certification = catalog.filter((problem) => problem.folder.startsWith("竞赛真题/CSP 认证/"));
    expect(certification).toEqual(cspSource);

    for (const source of cspSource) {
      const indexEntry = catalogIndex.find((problem) => problem.id === source.id);
      expect(indexEntry).toMatchObject({
        id: source.id,
        title: source.title,
        folder: source.folder,
        sourceUrl: source.sourceUrl,
        extractionStatus: source.extractionStatus,
        sampleCount: source.samples.length,
      });
      const problemPath = resolve(import.meta.dirname, `../../public/problems/${source.id}.json`);
      expect(JSON.parse(readFileSync(problemPath, "utf8"))).toEqual(source);
    }
  });

  it("生成题保留完整测试点；真实 CSP 导入题保留来源站公开样例", () => {
    for (const p of catalog) {
      const categories = new Set(p.samples.map((s) => s.category));
      if (p.folder.startsWith("竞赛真题/CSP 认证/")) {
        expect(p.samples.length, `${p.id} 缺公开样例`).toBeGreaterThanOrEqual(1);
        expect(categories).toEqual(new Set(["sample"]));
      } else {
        expect(p.samples.length, `${p.id} 测试点不足`).toBeGreaterThanOrEqual(12);
        expect(categories.size, `${p.id} 类别不足`).toBeGreaterThanOrEqual(4);
        expect(p.samples.some((s) => s.category === "performance"), `${p.id} 缺性能点`).toBe(true);
      }
      for (const s of p.samples) {
        expect(s.input.trim().length, `${p.id} 空输入`).toBeGreaterThan(0);
        expect(s.output.trim().length, `${p.id} 空输出`).toBeGreaterThan(0);
        expect(s.input.length, `${p.id} 单点超 256KB`).toBeLessThanOrEqual(256 * 1024);
      }
    }
  });
});
