/* CodeNow OJ · 桌宠台词取词(AI 优先，本地池降级) · Bamzc */

"use client";

import { pickLocalLine, type MascotLine, type MascotMood, type MascotPhase } from "../stores/mascot-lines";

const VALID_MOODS: readonly MascotMood[] = ["smile", "laugh", "smug", "surprised", "gentle", "annoyed", "angry"];

export type MascotLineRequest = {
  phase: MascotPhase;
  context: { problemTitle: string; codeExcerpt: string; passed: number; total: number; firstFailedIndex: number };
  recentLines: string[];
  ai: { apiKey: string; endpoint: string; model: string };
  signal?: AbortSignal;
};

/**
 * 取一句桌宠台词：优先调用 AI 生成（避免重复），未配置 Key、上游失败或网络异常时
 * 降级到本地高木台词池，保证桌宠始终有话说。
 */
export async function requestMascotLine(req: MascotLineRequest): Promise<MascotLine> {
  const fallback = () => pickLocalLine(req.phase, req.recentLines);
  if (!req.ai.apiKey?.trim()) return fallback();

  try {
    const res = await fetch("/api/mascot-line", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: req.ai.apiKey,
        endpoint: req.ai.endpoint,
        model: req.ai.model,
        event: { phase: req.phase, ...req.context },
        recentLines: req.recentLines,
      }),
      signal: req.signal,
    });
    const data = await res.json() as { line?: string; mood?: string; sprite?: number };
    if (!res.ok || !data.line) return fallback();

    const local = fallback();
    const mood = VALID_MOODS.includes(data.mood as MascotMood) ? (data.mood as MascotMood) : local.mood;
    const sprite = Number.isInteger(data.sprite) && (data.sprite as number) >= 0 && (data.sprite as number) <= 6 ? (data.sprite as number) : local.sprite;
    return { text: data.line, mood, sprite };
  } catch {
    return fallback();
  }
}
