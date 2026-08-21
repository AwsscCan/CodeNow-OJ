import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { CSP_CERTIFICATION_SESSIONS, validateCspCertificationSource } from "./generate-bundled.mjs";

const editions = CSP_CERTIFICATION_SESSIONS;
const letters = ["A", "B", "C", "D", "E"];
const targets = editions.flatMap(([session, date]) => letters.map((letter, index) => ({
  session,
  problemNumber: index + 1,
  sourceId: `CSP${date}${letter}`,
  sourceUrl: `https://oj.shumeng.tech/p/CSP${date}${letter}`,
})));

const browser = await chromium.launch({ headless: true });

async function scrape(target) {
  const page = await browser.newPage();
  try {
    await page.goto(target.sourceUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const problem = await page.locator(".problem-content").evaluate((root, metadata) => {
      const body = root.querySelector(".section__body");
      if (!body) throw new Error("Missing problem body");

      function cleanText(element) {
        const clone = element.cloneNode(true);
        for (const math of clone.querySelectorAll(".katex")) {
          const latex = math.querySelector("annotation[encoding='application/x-tex']")?.textContent?.trim();
          math.replaceWith(document.createTextNode(latex ? `$${latex}$` : math.textContent || ""));
        }
        for (const image of clone.querySelectorAll("img")) {
          const src = image.getAttribute("src") || "";
          const absolute = src ? new URL(src, location.href).href : "";
          image.replaceWith(document.createTextNode(absolute ? `[图片](${absolute})` : "[图片]"));
        }
        return (clone.innerText || clone.textContent || "")
          .replace(/\u200b/g, "")
          .replace(/[ \t]+\n/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      }

      const headings = Array.from(body.querySelectorAll("h2"));
      function section(name, stopNames) {
        const heading = headings.find((item) => item.textContent?.trim() === name);
        if (!heading) return "";
        const parts = [];
        let current = heading.nextElementSibling;
        while (current) {
          if (current.tagName === "H2" && stopNames.includes(current.textContent?.trim() || "")) break;
          if (current.tagName === "PRE") break;
          parts.push(cleanText(current));
          current = current.nextElementSibling;
        }
        return parts.filter(Boolean).join("\n\n");
      }

      const allText = body.innerText;
      const time = allText.match(/时间限制[：:]\s*([^\n]+)/)?.[1]?.trim() || "1.0 秒";
      const memory = allText.match(/空间限制[：:]\s*([^\n]+)/)?.[1]?.trim() || "512 MB";
      const pre = Array.from(body.querySelectorAll("pre"), (item) => item.innerText.replace(/\r/g, "").trimEnd());
      const samples = [];
      for (let index = 0; index + 1 < pre.length; index += 2) {
        samples.push({
          id: samples.length + 1,
          input: `${pre[index]}\n`,
          output: `${pre[index + 1]}\n`,
          category: "sample",
          scale: 1,
          targets: "来源站公开样例",
          reason: `曙梦 OJ ${metadata.sourceId} 公开样例`,
        });
      }
      return {
        title: root.querySelector(".section__title")?.textContent?.trim() || metadata.sourceId,
        time,
        memory,
        description: section("题目描述", ["输入格式", "输出格式"]),
        inputFormat: section("输入格式", ["输出格式"]),
        outputFormat: section("输出格式", ["样例解释", "样例 1 解释", "子任务", "数据范围"]),
        samples,
        headings: headings.map((item) => item.textContent?.trim()).filter(Boolean),
      };
    }, target);
    if (!problem.description || !problem.inputFormat || !problem.outputFormat || problem.samples.length === 0) {
      throw new Error(`${target.sourceId} extraction incomplete: headings=${problem.headings.join(",")} samples=${problem.samples.length}`);
    }
    return {
      id: `CS0${target.session}${target.problemNumber}`,
      sourceId: target.sourceId,
      title: problem.title,
      difficulty: target.problemNumber === 1 ? "入门" : target.problemNumber === 2 ? "普及" : "提高",
      time: problem.time,
      memory: problem.memory,
      description: problem.description,
      inputFormat: problem.inputFormat,
      outputFormat: problem.outputFormat,
      samples: problem.samples,
      folder: `竞赛真题/CSP 认证/第${target.session}次`,
      sourceUrl: target.sourceUrl,
      extractionStatus: "complete",
    };
  } finally {
    await page.close();
  }
}

const results = [];
for (let index = 0; index < targets.length; index += 4) {
  const batch = await Promise.all(targets.slice(index, index + 4).map(scrape));
  results.push(...batch);
  console.log(`已抓取 ${results.length}/${targets.length}: ${batch.map((item) => `${item.id} ${item.title}`).join(" | ")}`);
}
await browser.close();

const output = resolve(import.meta.dirname, "csp-cert-source.json");
validateCspCertificationSource(results);
writeFileSync(output, `${JSON.stringify(results, null, 2)}\n`);
console.log(`已写入 ${results.length} 道真实 CSP 题面与公开样例 → ${output}`);
