/* CodeNow OJ · 桌宠动态台词(高木同学人设) · Bamzc */

import { NextRequest, NextResponse } from "next/server";
import { pickLocalLine, type MascotPhase } from "../../stores/mascot-lines";
import {
  AI_MASCOT_TEMPERATURE,
  AI_MAX_TOKENS_MASCOT,
  MASCOT_LINE_TIMEOUT_MS,
  MASCOT_LINE_MAX_LENGTH,
  MASCOT_CODE_EXCERPT_LENGTH,
  MASCOT_TITLE_MAX_LENGTH,
  MASCOT_RECENT_MAX_ITEMS,
  MASCOT_RECENT_LINE_MAX_LENGTH,
} from "../_lib/constants";
import { rateLimit } from "../_lib/rate-limit";
import { buildTakagiMascotPrompt } from "../_lib/takagi-persona";
import { formatQuoteContext, pickTakagiQuotes, tagsForPhase } from "../_lib/takagi-quotes";
import { validateEndpoint } from "../_lib/validate-endpoint";
import { resolveAiRuntime, type AiRuntimeResolution } from "../../server/ai/ai-runtime";

/** 每种情境对应的表情与给模型的语气指引 */
const PHASE_STYLE: Record<string, { mood: string; sprite: number; brief: string }> = {
  idle: { mood: "smile", sprite: 6, brief: "他停下来发呆没写代码，你若无其事地看着他、随口调侃两句" },
  coding: { mood: "gentle", sprite: 0, brief: "他正在敲代码，你饶有兴致地观察、轻轻挑衅一下" },
  judging: { mood: "surprised", sprite: 3, brief: "代码正在评测，你假装淡定其实有点小期待" },
  ac: { mood: "laugh", sprite: 1, brief: "所有测试点都通过了，你傲娇地夸他、嘴上却偏不服输" },
  wa: { mood: "annoyed", sprite: 4, brief: "答案错误，你坏笑着调侃他、点破他大概没考虑到的情况" },
  ce: { mood: "angry", sprite: 5, brief: "编译都没过，你佯装生气地催他把语法错误改干净" },
  re: { mood: "surprised", sprite: 3, brief: "程序运行时崩溃了，你惊讶又有点幸灾乐祸，但记得关心一句" },
  tle: { mood: "smug", sprite: 2, brief: "跑超时了，你嫌他太慢、得意地嘲笑他的复杂度" },
};

const SYSTEM_PROMPT = buildTakagiMascotPrompt();

/** 去除换行/控制符并压平为单行，限长——用于会拼进 prompt 的用户可控字段，收窄注入面 */
function sanitizeField(raw: unknown, max: number): string {
  return String(raw ?? "")
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** 清洗模型输出：去换行、去 emoji、去首尾引号与空白、硬截断为一句短台词 */
function sanitizeLine(raw: string): string {
  return String(raw || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu, "")
    .replace(/^[\s"'“”「」『』]+/, "")
    .replace(/[\s"'“”「」『』]+$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MASCOT_LINE_MAX_LENGTH);
}

function buildUserPrompt(event: Record<string, unknown>, recentLines: string[], memories: string[]): string {
  const phase = String(event.phase || "idle");
  const style = PHASE_STYLE[phase] ?? PHASE_STYLE.idle;
  const title = sanitizeField(event.problemTitle, MASCOT_TITLE_MAX_LENGTH) || "当前题目";
  const passed = Number(event.passed ?? 0);
  const total = Number(event.total ?? 0);
  const firstFailedIndex = Number(event.firstFailedIndex ?? -1);
  const codeExcerpt = String(event.codeExcerpt || "").slice(0, MASCOT_CODE_EXCERPT_LENGTH);

  const lines = [`【当前状态】${style.brief}。`, `题目：${title}。`];
  if (total > 0) lines.push(`测试点通过 ${passed}/${total}${firstFailedIndex >= 0 ? `，第 ${firstFailedIndex + 1} 个点最先出问题` : ""}。`);
  if (codeExcerpt.trim()) lines.push(`（参考）他此刻的代码片段：\n${codeExcerpt}`);
  const quoteContext = formatQuoteContext(pickTakagiQuotes(tagsForPhase(phase), 3));
  if (quoteContext) lines.push(quoteContext);
  if (memories.length) lines.push(`你对他的长期观察（可自然玩梗，但别逐条复述）：\n- ${memories.join("\n- ")}`);
  if (recentLines.length) lines.push(`最近说过（不要重复或雷同）：\n- ${recentLines.join("\n- ")}`);
  lines.push("现在，用高木同学的口吻针对【当前状态】说一句新台词。");
  return lines.join("\n");
}

type ResolveAiConfig = (request: Request) => Promise<AiRuntimeResolution>;

export function createMascotLineHandler(resolveConfig: ResolveAiConfig = resolveAiRuntime) {
  return async function handleMascotLine(request: NextRequest) {
  const rl = rateLimit(request, "mascot");
  if (!rl.allowed) return NextResponse.json({ error: "请求过于频繁，请稍后重试" }, { status: 429 });

  try {
    const requestData = await request.json();
    const { event } = requestData;
    const recentLines: string[] = Array.isArray(requestData.recentLines)
      ? requestData.recentLines
          .filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
          .slice(-MASCOT_RECENT_MAX_ITEMS)
          .map((item: string) => sanitizeField(item, MASCOT_RECENT_LINE_MAX_LENGTH))
      : [];
    const memories: string[] = Array.isArray(requestData.memories)
      ? requestData.memories
          .filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
          .slice(-3)
          .map((item: string) => sanitizeField(item, 60))
      : [];

    const resolved = await resolveConfig(request);
    if (!resolved.ok) return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    const { apiKey, endpoint, model } = resolved.config;
    if (!event || typeof event !== "object") {
      return NextResponse.json({ error: "桌宠台词请求参数不完整" }, { status: 400 });
    }

    const phase = String((event as Record<string, unknown>).phase || "idle");
    const style = PHASE_STYLE[phase] ?? PHASE_STYLE.idle;
    const chatUrl = validateEndpoint(String(endpoint));

    const response = await fetch(chatUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(MASCOT_LINE_TIMEOUT_MS),
      body: JSON.stringify({
        model,
        temperature: AI_MASCOT_TEMPERATURE,
        max_tokens: AI_MAX_TOKENS_MASCOT,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(event as Record<string, unknown>, recentLines, memories) },
        ],
      }),
    });

    // 上游失败：返回通用错误，不泄露上游细节（信息枚举面）
    if (!response.ok) return NextResponse.json({ error: "AI 台词服务暂时不可用" }, { status: 502 });

    const data = await response.json() as { choices?: { message?: { content?: string } }[] };
    const line = sanitizeLine(data.choices?.[0]?.message?.content || "");
    // 空输出：服务端直接降级到本地预设台词池，保证桌宠始终有话说
    if (!line) {
      const local = pickLocalLine(phase as MascotPhase, recentLines);
      return NextResponse.json({ line: local.text, mood: local.mood, sprite: local.sprite });
    }

    return NextResponse.json({ line, mood: style.mood, sprite: style.sprite });
  } catch (error) {
    // validateEndpoint 抛出的端点校验错误按客户端错误处理；其余统一通用错误，不外泄内部细节
    if (error instanceof Error && /API Endpoint|不安全的 API|不支持的 API/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "桌宠台词生成失败" }, { status: 500 });
  }
  };
}

export const POST = createMascotLineHandler();
