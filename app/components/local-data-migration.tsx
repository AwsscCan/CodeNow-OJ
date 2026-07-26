"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { authClient } from "../lib/auth-client";
import { parseLocalData } from "../lib/local-data/parse";
import type { LocalDataManifestV1 } from "../lib/local-data/types";

const SOURCE_KEYS = [
  "codenow-problem-library", "codeforge-problem-library",
  "codenow-workspace", "codeforge-workspace",
  "codenow-theme", "codeforge-theme",
  "codenow-editor-theme", "codeforge-editor-theme",
  "codenow-ai", "codeforge-ai",
] as const;
const MIGRATION_STATE_KEY = "codenow-local-migration-state";
const DISMISSED_STATE_KEY = "codenow-local-migration-dismissed";
const CLEANUP_DELAY_MS = 7 * 24 * 60 * 60 * 1000;

type Conflict = { localProblemKey: string; cloudProblemId: string; problemCode: string; cloudVersion: number };
type Preview = {
  counts: { folders: number; problems: number; testCases: number; drafts: number; conversations: number };
  conflicts: Conflict[];
  previewFingerprint: string;
  expiresAt: string;
};
type Decision = { action: "overwrite" | "duplicate" | "skip"; cloudVersion: number };
type MigrationState = { fingerprint: string; importedAt: string; cleanupAfter: string };
type View = "hidden" | "scanning" | "preview" | "committing" | "success" | "error";

function collectLocalData() {
  return Object.fromEntries(SOURCE_KEYS.flatMap((key) => {
    const value = localStorage.getItem(key);
    return value === null ? [] : [[key, value]];
  }));
}

function readMigrationState(): MigrationState | null {
  try {
    const value = JSON.parse(localStorage.getItem(MIGRATION_STATE_KEY) || "null") as Partial<MigrationState> | null;
    return value && typeof value.fingerprint === "string" && typeof value.importedAt === "string" && typeof value.cleanupAfter === "string"
      ? value as MigrationState
      : null;
  } catch {
    return null;
  }
}

function wasDismissed(userId: string) {
  try {
    const value = JSON.parse(sessionStorage.getItem(DISMISSED_STATE_KEY) || "null") as Record<string, unknown> | null;
    return value?.userId === userId;
  } catch {
    return false;
  }
}

function hasImportableData(manifest: LocalDataManifestV1) {
  return manifest.folders.length > 0 || manifest.problems.length > 0 || manifest.currentDraft !== null
    || manifest.conversations.length > 0 || Object.keys(manifest.preferences).length > 0;
}

function errorMessage(value: unknown, fallback: string) {
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  return typeof record.message === "string" ? record.message : fallback;
}

function idempotencyKey() {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `local-import-${Date.now()}-${Math.random()}`;
}

export function LocalDataMigration() {
  const session = authClient.useSession();
  const userId = session.data?.user.id;
  const [view, setView] = useState<View>("hidden");
  const [manifest, setManifest] = useState<LocalDataManifestV1 | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [error, setError] = useState("");
  const [showDiscard, setShowDiscard] = useState(false);
  const [discardText, setDiscardText] = useState("");
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const commitKey = useRef("");
  const scanGeneration = useRef(0);

  useEffect(() => {
    const generation = ++scanGeneration.current;
    if (session.isPending || !userId) return;
    void (async () => {
      await Promise.resolve();
      const parsed = parseLocalData(collectLocalData());
      if (generation !== scanGeneration.current) return;
      if (!parsed.ok || !hasImportableData(parsed.manifest)) {
        setView("hidden");
        return;
      }
      setManifest(parsed.manifest);
      setWarnings(parsed.warnings);
      try {
        const response = await fetch("/api/imports/local-data/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ manifest: parsed.manifest }),
        });
        const body = await response.json() as Preview | { message?: string };
        if (generation !== scanGeneration.current) return;
        if (!response.ok || !("previewFingerprint" in body)) throw new Error(errorMessage(body, "无法预览本地数据"));
        const saved = readMigrationState();
        if (saved?.fingerprint === body.previewFingerprint) {
          if (Date.parse(saved.cleanupAfter) <= Date.now()) SOURCE_KEYS.forEach((key) => localStorage.removeItem(key));
          setView("hidden");
          return;
        }
        if (wasDismissed(userId)) {
          setView("hidden");
          return;
        }
        setPreview(body);
        setDecisions({});
        commitKey.current = idempotencyKey();
        setActiveUserId(userId);
        setView("preview");
      } catch (cause) {
        if (generation !== scanGeneration.current) return;
        setError(cause instanceof Error ? cause.message : "无法预览本地数据");
        setActiveUserId(userId);
        setView("error");
      }
    })();
  }, [session.isPending, userId]);

  const allDecided = useMemo(() => preview?.conflicts.every((item) => Boolean(decisions[item.localProblemKey])) ?? false, [decisions, preview]);

  async function commit() {
    if (!manifest || !preview || !allDecided) return;
    setView("committing");
    try {
      const response = await fetch("/api/imports/local-data/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": commitKey.current },
        body: JSON.stringify({ manifest, previewFingerprint: preview.previewFingerprint, decisions }),
      });
      const body = await response.json() as { message?: string };
      if (!response.ok) throw new Error(errorMessage(body, "导入失败，请重试"));
      const importedAt = new Date();
      localStorage.setItem(MIGRATION_STATE_KEY, JSON.stringify({
        fingerprint: preview.previewFingerprint,
        importedAt: importedAt.toISOString(),
        cleanupAfter: new Date(importedAt.getTime() + CLEANUP_DELAY_MS).toISOString(),
      } satisfies MigrationState));
      setView("success");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "导入失败，请重试");
      setView("error");
    }
  }

  function discardSourceData() {
    if (discardText !== "放弃本地数据") return;
    SOURCE_KEYS.forEach((key) => localStorage.removeItem(key));
    setView("hidden");
  }

  function dismiss() {
    if (userId && preview) sessionStorage.setItem(DISMISSED_STATE_KEY, JSON.stringify({ userId }));
    setView("hidden");
  }

  if (!userId || activeUserId !== userId || view === "hidden" || view === "scanning") return null;

  return <div className="migration-backdrop" role="presentation">
    <section className="migration-dialog" role="dialog" aria-modal="true" aria-label="导入本地数据">
      {view === "success" ? <>
        <span className="migration-kicker">迁移完成</span>
        <h2>导入完成</h2>
        <p>云端已保存本次导入。本地源数据会保留七天，便于需要时恢复。</p>
        <div className="migration-actions"><button type="button" onClick={() => setView("hidden")}>完成</button></div>
      </> : view === "error" ? <>
        <span className="migration-kicker">需要处理</span>
        <h2>本地数据导入失败</h2>
        <p className="migration-error">{error}</p>
        <div className="migration-actions"><button type="button" onClick={() => setView(preview ? "preview" : "hidden")}>返回</button></div>
      </> : <>
        <span className="migration-kicker">检测到旧版数据</span>
        <h2>导入本地数据</h2>
        <p>登录后可把这台设备上的题目、测试点和草稿合并到你的账户。</p>
        {preview && <div className="migration-counts">
          <b>{preview.counts.problems} 个题目</b><b>{preview.counts.testCases} 个测试点</b>
          <span>{preview.counts.folders} 个文件夹</span><span>{preview.counts.drafts} 个草稿</span>
        </div>}
        {warnings.length > 0 && <details className="migration-warnings" open><summary>扫描提示（{warnings.length}）</summary>{warnings.map((item, index) => <p key={`${index}-${item}`}>{item}</p>)}</details>}
        {preview?.conflicts.map((conflict) => <label className="migration-conflict" key={conflict.localProblemKey}>
          <span><b>{conflict.problemCode}</b> 与云端题号重复</span>
          <select aria-label={`${conflict.problemCode} 的处理方式`} value={decisions[conflict.localProblemKey]?.action ?? ""} onChange={(event) => {
            const action = event.target.value as Decision["action"] | "";
            setDecisions((current) => {
              if (!action) {
                const next = { ...current };
                delete next[conflict.localProblemKey];
                return next;
              }
              return { ...current, [conflict.localProblemKey]: { action, cloudVersion: conflict.cloudVersion } };
            });
          }}>
            <option value="">请选择</option><option value="overwrite">覆盖云端</option><option value="duplicate">保留两份</option><option value="skip">跳过本地题目</option>
          </select>
        </label>)}
        {showDiscard && <div className="migration-discard">
          <label>输入“放弃本地数据”以确认<input value={discardText} onChange={(event) => setDiscardText(event.target.value)} /></label>
          <button type="button" disabled={discardText !== "放弃本地数据"} onClick={discardSourceData}>永久放弃本地数据</button>
        </div>}
        <div className="migration-actions">
          <button type="button" className="danger-link" onClick={() => setShowDiscard((value) => !value)}>放弃本地数据</button>
          <button type="button" onClick={dismiss}>暂不导入</button>
          <button type="button" className="primary" disabled={!allDecided || view === "committing"} onClick={() => void commit()}>{view === "committing" ? "正在导入…" : "导入并合并"}</button>
        </div>
      </>}
    </section>
  </div>;
}
