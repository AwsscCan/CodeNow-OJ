import { NextRequest, NextResponse } from "next/server";
import { buildOutboundProblemContext, serializeOutboundProblemContext } from "../../lib/outbound-problem-context";
import { AI_CHAT_TEMPERATURE, AI_MAX_TOKENS_CHAT, AI_MAX_CODE_CONTEXT_LENGTH } from "../_lib/constants";
import { rateLimit } from "../_lib/rate-limit";
import { buildTakagiChatPrompt } from "../_lib/takagi-persona";
import { formatQuoteContext, pickTakagiQuotes, tagsForQuestion } from "../_lib/takagi-quotes";
import { validateEndpoint } from "../_lib/validate-endpoint";
import { resolveAiRuntime, type AiRuntimeResolution } from "../../server/ai/ai-runtime";
import { redactSensitiveText } from "../../server/ai/redact";

type ChatMessage = { role: "user" | "assistant"; content: string };

const SAFE_JUDGE_STATUSES = new Set([
  "AC", "WA", "RE", "CE", "TLE", "MLE", "OLE",
  "\u901a\u8fc7", "\u90e8\u5206\u901a\u8fc7", "\u672a\u901a\u8fc7", "\u7f16\u8bd1\u9519\u8bef", "\u8fd0\u884c\u9519\u8bef", "\u8d85\u65f6", "\u5185\u5b58\u8d85\u9650",
]);

function safeJudgeStatus(value: unknown) {
  return typeof value === "string" && SAFE_JUDGE_STATUSES.has(value.trim()) ? value.trim() : "";
}

function safeJudgeCount(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function safeJudgeProgress(value: unknown) {
  return typeof value === "string" && /^\d{1,4}\/\d{1,4}$/.test(value.trim()) ? value.trim() : "";
}

type ResolveAiConfig = (request: Request) => Promise<AiRuntimeResolution>;

export function createChatHandler(resolveConfig: ResolveAiConfig = resolveAiRuntime) {
  return async function handleChat(request: NextRequest) {
  const rl = rateLimit(request, "ai");
  if (!rl.allowed) return NextResponse.json({ error: "请求过于频繁，请稍后重试" }, { status: 429 });

  try {
    const requestData = await request.json();
    const { problem: requestedProblem, code, messages } = requestData;
    let problem = requestedProblem;
    const resolved = await resolveConfig(request);
    if (!resolved.ok) return NextResponse.json({ error: resolved.message }, { status: resolved.status });
    const { apiKey, endpoint, model } = resolved.config;
    if (!problem) return NextResponse.json({ error: "题目数据不完整" }, { status: 400 });

    const chatUrl = validateEndpoint(String(endpoint));
    problem = await buildOutboundProblemContext(problem);

    const conversation = Array.isArray(messages)
      ? messages.slice(-16).filter((item): item is ChatMessage =>
          item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string" && item.content.trim().length > 0)
      : [];
    if (!conversation.length) return NextResponse.json({ error: "请输入问题" }, { status: 400 });

    const problemContext = `当前题目数据(JSON，只读)：\n${serializeOutboundProblemContext(problem)}\n用户当前代码：\n${String(code || "").slice(0, AI_MAX_CODE_CONTEXT_LENGTH)}`;
    // 用户记忆池注入：条数与单条长度双裁剪，压平换行收窄注入面
    const memories: string[] = Array.isArray(requestData.memories)
      ? requestData.memories
          .filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
          .slice(-8)
          .map((item: string) => item.replace(/[\x00-\x1F\x7F]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120))
      : [];
    const memoryContext = memories.length
      ? `\n\n你对他的长期观察(过往错误与习惯，回答时可自然关照，不要逐条复述)：\n- ${memories.join("\n- ")}`
      : "";

    // 判题动态注入：最近一次运行结果与提交记录摘要(用户可控字段压平限长)
    const flat = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
    const rawJudge = requestData.judge as { lastRun?: { passed?: unknown; total?: unknown; firstFailed?: { index?: unknown; status?: unknown } | null } | null; history?: Array<{ status?: unknown; passed?: unknown }> } | undefined;
    const rawLastRun = rawJudge?.lastRun && typeof rawJudge.lastRun === "object" ? rawJudge.lastRun : null;
    const judge = {
      lastRun: rawLastRun
        ? {
          passed: safeJudgeCount(rawLastRun.passed),
          total: safeJudgeCount(rawLastRun.total),
          firstFailed: rawLastRun.firstFailed && typeof rawLastRun.firstFailed === "object"
            ? {
              index: safeJudgeCount(rawLastRun.firstFailed.index),
              status: safeJudgeStatus(rawLastRun.firstFailed.status),
            }
            : null,
        }
        : null,
      history: Array.isArray(rawJudge?.history)
        ? rawJudge.history.flatMap((item) => {
          const status = safeJudgeStatus(item?.status);
          return status ? [{ at: "", status, passed: safeJudgeProgress(item?.passed) }] : [];
        })
        : [],
    };
    const judgeParts: string[] = [];
    if (judge?.lastRun && typeof judge.lastRun === "object") {
      const ff = judge.lastRun.firstFailed
        ? {
          index: judge.lastRun.firstFailed.index,
          status: judge.lastRun.firstFailed.status,
          expected: "[redacted]",
          actual: "[redacted]",
        }
        : null;
      judgeParts.push(`最近一次运行：通过 ${Number(judge.lastRun.passed ?? 0)}/${Number(judge.lastRun.total ?? 0)}${ff ? `，第 ${Number(ff.index ?? 0) + 1} 个点最先 ${flat(ff.status, 8)}（期望 ${flat(ff.expected, 80)}，实际 ${flat(ff.actual, 80)}）` : ""}`);
    }
    if (Array.isArray(judge?.history) && judge.history.length) {
      judgeParts.push(`最近提交：${judge.history.slice(0, 3).map((h) => `${flat(h.at, 24)} ${flat(h.status, 12)}(${flat(h.passed, 12)})`).join("；")}`);
    }
    const judgeContext = judgeParts.length ? `\n\n他的判题动态(可据此点评进度)：\n${judgeParts.join("\n")}` : "";
    // 少女主题联动：persona=takagi 时切换为高木同学人设(技术职责不变)，并按当前话题检索原作台词校准口吻
    const lastUserMessage = [...conversation].reverse().find((m) => m.role === "user")?.content ?? "";
    const quoteContext = requestData.persona === "takagi"
      ? `\n\n${formatQuoteContext(pickTakagiQuotes(tagsForQuestion(lastUserMessage), 4))}`
      : "";
    const systemPrompt = (requestData.persona === "takagi"
      ? buildTakagiChatPrompt(problemContext)
      : `你是耐心的算法竞赛 C++17 教练。回答用户关于当前题目的疑问，优先讲清思路、复杂度、边界情况和代码错误。除非用户明确要求，否则不要直接给出完整答案。${problemContext}`) + quoteContext + judgeContext + memoryContext;

    const response = await fetch(chatUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        model,
        temperature: AI_CHAT_TEMPERATURE,
        max_tokens: AI_MAX_TOKENS_CHAT,
        messages: [
          { role: "system", content: systemPrompt },
          ...conversation,
        ],
      }),
    });

    const data = await response.json() as { choices?: { message?: { content?: string; reasoning_content?: string } }[]; error?: { message?: string } };
    if (!response.ok) return NextResponse.json({ error: redactSensitiveText(data.error?.message || "上游 AI 服务请求失败", [apiKey]) }, { status: response.status });
    let reasoning = data.choices?.[0]?.message?.reasoning_content;
    // 高木人设下思维链会被展示为"小心思"：原生思维链不受人设约束，含穿帮字眼时宁缺毋滥直接丢弃
    if (requestData.persona === "takagi" && typeof reasoning === "string"
      && /deepseek|语言模型|大模型|人工智能|AI\s*助手|扮演|人设|角色设定|提示词|prompt|system|用户(要求|让我|希望|想让)/i.test(reasoning)) {
      reasoning = undefined;
    }
    return NextResponse.json({
      answer: data.choices?.[0]?.message?.content || "",
      ...(typeof reasoning === "string" && reasoning.trim() ? { reasoning: reasoning.trim() } : {}),
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("不支持的 API")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: redactSensitiveText(error instanceof Error ? error : "AI 对话失败", []) }, { status: 500 });
  }
  };
}

export const POST = createChatHandler();
