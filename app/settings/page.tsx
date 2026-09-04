"use client";

import { useEffect, useRef, useState } from "react";
import { Topbar } from "../components/topbar";
import { Toast } from "../components/toast";
import { useToast } from "../hooks/use-toast";
import { authClient } from "../lib/auth-client";
import { useAiStore, type AiProvider, type PublicAiSettings } from "../stores/ai-store";
import { useThemeStore, type CppFormatMode } from "../stores/theme-store";
import { applyCcSwitchProvider, fetchCcSwitchCatalog, type CcSwitchCatalog } from "../lib/ccswitch-client";

const presets: Record<Exclude<AiProvider, "ccswitch">, { endpoint: string; model: string }> = {
  deepseek: { endpoint: "https://api.deepseek.com", model: "deepseek-chat" },
  openai: { endpoint: "https://api.openai.com/v1", model: "gpt-4.1-mini" },
  custom: { endpoint: "", model: "" },
};

type FormState = Pick<PublicAiSettings, "provider" | "endpoint" | "model" | "source" | "hasApiKey" | "version" | "wireApi"> & { apiKey: string };

export default function SettingsPage() {
  const session = authClient.useSession();
  const theme = useThemeStore();
  const { notice, toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormState>({ provider: "deepseek", endpoint: presets.deepseek.endpoint, model: presets.deepseek.model, source: "manual", hasApiKey: false, version: 0, wireApi: "chat_completions", apiKey: "" });
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [ccSwitchCatalog, setCcSwitchCatalog] = useState<CcSwitchCatalog | null>(null);
  const [ccSwitchProviderId, setCcSwitchProviderId] = useState("");
  const [ccSwitchModel, setCcSwitchModel] = useState("");
  const [ccSwitchKind, setCcSwitchKind] = useState<"claude" | "codex">("codex");
  const [ccSwitchStatus, setCcSwitchStatus] = useState("未连接本机 CCSwitch");

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
        body: JSON.stringify({ version: form.version, provider: form.provider, endpoint: form.endpoint, model: form.model, wireApi: form.wireApi, ...(form.apiKey ? { apiKey: form.apiKey } : {}), source: form.source }),
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

  async function connectCcSwitch() {
    setBusy(true);
    try {
      const catalog = await fetchCcSwitchCatalog();
      const providers = catalog.providers ?? [];
      const active = providers.find((item) => item.kind === "codex" && item.is_current && item.available !== false)
        ?? providers.find((item) => item.is_current && item.available !== false)
        ?? providers.find((item) => item.available !== false)
        ?? providers[0];
      const activeModel = active?.is_current
        && catalog.active_provider_id === active.id
        && catalog.active_model_id
        && active.models?.includes(catalog.active_model_id)
        ? catalog.active_model_id
        : undefined;
      setCcSwitchCatalog(catalog);
      setCcSwitchProviderId(active?.id ?? "");
      setCcSwitchModel(activeModel ?? active?.model_id ?? active?.models?.[0] ?? "");
      setCcSwitchKind(active?.kind ?? "codex");
      setCcSwitchStatus(catalog.active ? `已连接 · ${providers.length} 个 Provider` : "已连接，但没有可用 Provider");
      toast(catalog.active ? "已读取本机 CCSwitch Provider" : "CCSwitch 未发现可用 Provider");
    } catch (error) {
      setCcSwitchCatalog(null);
      setCcSwitchStatus("未连接本机 CCSwitch");
      toast(error instanceof Error ? `${error.message}（请启动 CCSwitch 本机服务）` : "CCSwitch 本机服务不可用");
    } finally {
      setBusy(false);
    }
  }

  async function applyConnectedCcSwitch() {
    if (!ccSwitchProviderId || !ccSwitchModel) return;
    setBusy(true);
    try {
      const result = await applyCcSwitchProvider(ccSwitchProviderId, ccSwitchModel, ccSwitchKind);
      const sync = result.account_sync;
      if (!sync?.endpoint || !sync.api_key) throw new Error("CCSwitch 已验证，但未返回可同步到账户的凭据");
      const response = await fetch("/api/ai-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: form.version,
          provider: "ccswitch",
          endpoint: sync.endpoint,
          model: result.model_id ?? ccSwitchModel,
          apiKey: sync.api_key,
          source: "ccswitch",
          wireApi: sync.wire_api === "responses" || sync.wire_api === "anthropic" ? sync.wire_api : "chat_completions",
        }),
      });
      const body = await response.json() as PublicAiSettings & { error?: { message?: string } };
      if (!response.ok || !body.configured) throw new Error(body.error?.message || "CCSwitch 已验证，但账户设置同步失败");
      setForm({ ...body, apiKey: "" });
      setModels(body.model ? [body.model] : []);
      useAiStore.getState().hydrateSettings(body);
      setCcSwitchStatus(`本机已实测联动 · ${result.provider_name ?? ccSwitchProviderId} · ${result.model_id ?? ccSwitchModel}`);
      toast("CCSwitch 已实测联动，设置已同步到账户");
    } catch (error) {
      toast(error instanceof Error ? error.message : "CCSwitch 应用失败");
    } finally {
      setBusy(false);
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
          <div className="provider-switch" aria-label="AI 服务商">
            {(["deepseek", "openai", "custom"] as const).map((provider) => <button type="button" key={provider} className={form.provider === provider ? "active" : ""} onClick={() => chooseProvider(provider)}>{provider === "deepseek" ? "DeepSeek" : provider === "openai" ? "OpenAI" : "自定义"}</button>)}
          </div>
          <div className="wire-api-field">
            <div className="field-caption"><label htmlFor="ai-wire-api">协议</label><small>按上游接口格式发送请求</small></div>
            <select id="ai-wire-api" value={form.wireApi} onChange={(event) => setForm({ ...form, wireApi: event.target.value as FormState["wireApi"] })}>
              <option value="chat_completions">OpenAI Chat Completions</option>
              <option value="responses">OpenAI Responses</option>
              <option value="anthropic">Claude Messages</option>
            </select>
          </div>
          <label htmlFor="ai-endpoint">API Endpoint</label>
          <input id="ai-endpoint" value={form.endpoint} onChange={(event) => setForm({ ...form, endpoint: event.target.value })} placeholder="https://api.example.com/v1" />
          <label htmlFor="ai-api-key">API Key</label>
          <input id="ai-api-key" type="password" value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} placeholder={form.hasApiKey ? "留空则保留已保存密钥" : "输入 API Key"} autoComplete="new-password" />
          <div className="model-field"><label htmlFor="ai-model">模型</label><button type="button" disabled={busy || !form.hasApiKey} onClick={() => void loadModels()}>拉取模型</button></div>
          {models.length ? <select id="ai-model" aria-label="模型" value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })}>{[...new Set([form.model, ...models])].filter(Boolean).map((model) => <option key={model}>{model}</option>)}</select> : <input id="ai-model" aria-label="模型" value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} placeholder="模型 ID" />}
          <section className="ccswitch-link-card" aria-label="CCSwitch 本机联动">
            <div className="ccswitch-link-head"><div><b>CCSwitch 本机联动</b><small>{ccSwitchStatus}</small></div><button type="button" disabled={busy} onClick={() => void connectCcSwitch()}>{ccSwitchCatalog ? "重新读取" : "连接本机"}</button></div>
            {ccSwitchCatalog && <><div className="ccswitch-kind-switch" role="tablist" aria-label="CCSwitch 协议"><button type="button" className={ccSwitchKind === "claude" ? "active" : ""} onClick={() => { setCcSwitchKind("claude"); setCcSwitchProviderId(""); setCcSwitchModel(""); }}>Claude</button><button type="button" className={ccSwitchKind === "codex" ? "active" : ""} onClick={() => { setCcSwitchKind("codex"); setCcSwitchProviderId(""); setCcSwitchModel(""); }}>Codex</button></div><div className="ccswitch-link-controls"><select aria-label="CCSwitch Provider" value={ccSwitchProviderId} onChange={(event) => { const provider = ccSwitchCatalog.providers?.find((item) => item.id === event.target.value); setCcSwitchProviderId(event.target.value); setCcSwitchModel(provider?.model_id ?? provider?.models?.[0] ?? ""); setCcSwitchKind(provider?.kind ?? ccSwitchKind); }}><option value="">选择 Provider</option>{(ccSwitchCatalog.providers ?? []).filter((provider) => (provider.kind ?? "claude") === ccSwitchKind).map((provider) => <option key={`${provider.kind ?? "claude"}-${provider.id}`} value={provider.id} disabled={provider.available === false}>{provider.name}{provider.is_current ? " · 当前" : ""}</option>)}</select><select aria-label="CCSwitch 模型" value={ccSwitchModel} onChange={(event) => setCcSwitchModel(event.target.value)}><option value="">选择模型</option>{[...new Set((ccSwitchCatalog.providers?.find((item) => item.id === ccSwitchProviderId)?.models ?? []).concat(ccSwitchModel).filter(Boolean))].map((model) => <option key={model}>{model}</option>)}</select><button type="button" disabled={busy || !ccSwitchProviderId || !ccSwitchModel} onClick={() => void applyConnectedCcSwitch()}>验证并应用</button></div></>}
            <small className="ccswitch-link-note">从本机 CCSwitch 数据库读取当前 Provider，并由 CCSwitch 自己验证路由；不会把密钥展示在页面。</small>
          </section>
          <section className="format-preference-card" aria-label="代码格式化偏好">
            <div className="field-caption"><label htmlFor="cpp-format-mode">默认代码格式化</label><small>编辑器工具栏将使用此模式，也可随时切换</small></div>
            <select id="cpp-format-mode" value={theme.formatMode} onChange={(event) => theme.setFormatMode(event.target.value as CppFormatMode)}>
              <option value="preserve">保留风格：只整理空白与缩进</option>
              <option value="full">完全规范：拆分逻辑句并统一排版</option>
            </select>
          </section>
          <div className="settings-actions"><button type="button" onClick={() => fileRef.current?.click()}>兼容导入 JSON</button><button type="submit" disabled={busy}>{busy ? "处理中…" : "保存设置"}</button></div>
          <input ref={fileRef} className="visually-hidden" type="file" accept="application/json,.json" aria-label="导入 CCSwitch 配置" onChange={(event) => void importCcSwitch(event.target.files?.[0])} />
        </form>
      </div>}
    </section>
    <Toast message={notice} />
  </main>;
}
