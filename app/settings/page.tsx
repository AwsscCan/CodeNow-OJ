"use client";

import { useEffect, useRef, useState } from "react";
import { Topbar } from "../components/topbar";
import { Toast } from "../components/toast";
import { useToast } from "../hooks/use-toast";
import { authClient } from "../lib/auth-client";
import { useAiStore, type AiProvider, type PublicAiSettings } from "../stores/ai-store";
import { useThemeStore } from "../stores/theme-store";

const presets: Record<Exclude<AiProvider, "ccswitch">, { endpoint: string; model: string }> = {
  deepseek: { endpoint: "https://api.deepseek.com", model: "deepseek-chat" },
  openai: { endpoint: "https://api.openai.com/v1", model: "gpt-4.1-mini" },
  custom: { endpoint: "", model: "" },
};

type FormState = Pick<PublicAiSettings, "provider" | "endpoint" | "model" | "source" | "hasApiKey" | "version"> & { apiKey: string };

export default function SettingsPage() {
  const session = authClient.useSession();
  const theme = useThemeStore();
  const { notice, toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormState>({ provider: "deepseek", endpoint: presets.deepseek.endpoint, model: presets.deepseek.model, source: "manual", hasApiKey: false, version: 0, apiKey: "" });
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session.data?.user) return;
    const controller = new AbortController();
    fetch("/api/ai-settings", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("无法读取 AI 设置");
        return response.json() as Promise<PublicAiSettings>;
      })
      .then((settings) => {
        setForm({ ...settings, apiKey: "" });
        setModels(settings.model ? [settings.model] : []);
        useAiStore.getState().hydrateSettings(settings);
      })
      .catch((error) => { if (!controller.signal.aborted) toast(error instanceof Error ? error.message : "无法读取 AI 设置"); });
    return () => controller.abort();
  }, [session.data?.user?.id]);

  function chooseProvider(provider: Exclude<AiProvider, "ccswitch">) {
    setForm((current) => ({ ...current, provider, ...presets[provider], source: "manual" }));
    setModels(presets[provider].model ? [presets[provider].model] : []);
  }

  async function save() {
    setBusy(true);
    try {
      const response = await fetch("/api/ai-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: form.version, provider: form.provider, endpoint: form.endpoint, model: form.model, ...(form.apiKey ? { apiKey: form.apiKey } : {}), source: form.source }),
      });
      const body = await response.json() as PublicAiSettings & { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message || "保存失败");
      setForm({ ...body, apiKey: "" });
      useAiStore.getState().hydrateSettings(body);
      toast("AI 设置已保存");
    } catch (error) {
      toast(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function loadModels() {
    setBusy(true);
    try {
      const response = await fetch("/api/ai-settings/models", { method: "POST" });
      const body = await response.json() as { models?: string[]; error?: { message?: string } };
      if (!response.ok || !body.models) throw new Error(body.error?.message || "无法拉取模型");
      setModels(body.models);
      if (!form.model && body.models[0]) setForm((current) => ({ ...current, model: body.models![0] }));
      toast(`已拉取 ${body.models.length} 个模型`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "无法拉取模型");
    } finally {
      setBusy(false);
    }
  }

  async function importCcSwitch(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const config = JSON.parse(await file.text()) as unknown;
      const response = await fetch("/api/ai-settings/ccswitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: form.version, config }),
      });
      const body = await response.json() as { settings?: PublicAiSettings; models?: string[]; error?: { message?: string } };
      if (!response.ok || !body.settings) throw new Error(body.error?.message || "CCSwitch 导入失败");
      setForm({ ...body.settings, apiKey: "" });
      setModels(body.models ?? [body.settings.model]);
      useAiStore.getState().hydrateSettings(body.settings);
      toast("CCSwitch Provider 已导入");
    } catch (error) {
      toast(error instanceof Error ? error.message : "CCSwitch 导入失败");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return <main className={`app-shell theme-${theme.themeMode}`}>
    <Topbar onToast={toast} />
    <section className="settings-page">
      <header><small>ACCOUNT SETTINGS</small><h1>设置</h1><p>AI 服务配置会随账户同步。</p></header>
      {!session.data?.user && !session.isPending ? <div className="settings-empty">登录后配置账户 AI 服务。</div> : <div className="settings-layout">
        <nav className="settings-nav" aria-label="设置分类"><button className="active">AI 模型</button></nav>
        <form className="settings-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <div className="settings-heading"><div><h2>AI 模型</h2><p>Provider、访问端点、凭据和当前模型。</p></div><span className={form.hasApiKey ? "configured" : ""}>{form.hasApiKey ? "已保存密钥" : "未保存密钥"}</span></div>
          <div className="provider-switch">
            {(["deepseek", "openai", "custom"] as const).map((provider) => <button type="button" key={provider} className={form.provider === provider ? "active" : ""} onClick={() => chooseProvider(provider)}>{provider === "deepseek" ? "DeepSeek" : provider === "openai" ? "OpenAI" : "自定义"}</button>)}
          </div>
          <label htmlFor="ai-endpoint">API Endpoint</label>
          <input id="ai-endpoint" value={form.endpoint} onChange={(event) => setForm({ ...form, endpoint: event.target.value })} placeholder="https://api.example.com/v1" />
          <label htmlFor="ai-api-key">API Key</label>
          <input id="ai-api-key" type="password" value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} placeholder={form.hasApiKey ? "留空则保留已保存密钥" : "输入 API Key"} autoComplete="new-password" />
          <div className="model-field"><label htmlFor="ai-model">模型</label><button type="button" disabled={busy || !form.hasApiKey} onClick={() => void loadModels()}>拉取模型</button></div>
          {models.length ? <select id="ai-model" aria-label="模型" value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })}>{[...new Set([form.model, ...models])].filter(Boolean).map((model) => <option key={model}>{model}</option>)}</select> : <input id="ai-model" aria-label="模型" value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} placeholder="模型 ID" />}
          <div className="settings-actions"><button type="button" onClick={() => fileRef.current?.click()}>导入 CCSwitch</button><button type="submit" disabled={busy}>{busy ? "处理中…" : "保存设置"}</button></div>
          <input ref={fileRef} className="visually-hidden" type="file" accept="application/json,.json" aria-label="导入 CCSwitch 配置" onChange={(event) => void importCcSwitch(event.target.files?.[0])} />
        </form>
      </div>}
    </section>
    <Toast message={notice} />
  </main>;
}
