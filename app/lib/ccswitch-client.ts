export type CcSwitchProvider = {
  id: string;
  name: string;
  kind?: "claude" | "codex";
  wire_api?: "anthropic" | "chat_completions" | "responses" | string;
  available?: boolean;
  is_current?: boolean;
  model_id?: string;
  models?: string[];
};

export type CcSwitchCatalog = {
  active?: boolean;
  active_provider_id?: string;
  active_provider_name?: string;
  active_model_id?: string;
  providers?: CcSwitchProvider[];
  codex?: { providers?: CcSwitchProvider[]; active?: boolean; active_provider_id?: string; active_model_id?: string };
};

export const CCSWITCH_LOCAL_PORTS = [18088, 18089, 18090] as const;
export const CCSWITCH_LOCAL_ORIGIN = `http://127.0.0.1:${CCSWITCH_LOCAL_PORTS[0]}`;
let activeOrigin = CCSWITCH_LOCAL_ORIGIN;

function normalizeCatalog(body: CcSwitchCatalog): CcSwitchCatalog {
  const claude = (body.providers ?? []).map((provider) => ({ ...provider, kind: provider.kind ?? "claude" as const }));
  const codex = (body.codex?.providers ?? []).map((provider) => ({ ...provider, kind: provider.kind ?? "codex" as const }));
  return {
    ...body,
    providers: [...claude, ...codex],
    codex: body.codex ? { ...body.codex, providers: codex } : undefined,
  };
}

export async function fetchCcSwitchCatalog(fetcher: typeof fetch = fetch): Promise<CcSwitchCatalog> {
  let lastError: unknown;
  for (const port of CCSWITCH_LOCAL_PORTS) {
    const origin = `http://127.0.0.1:${port}`;
    try {
      const response = await fetcher(`${origin}/api/settings/cc-switch-catalog`, { signal: AbortSignal.timeout(2500) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.detail || "CCSwitch 本机服务不可用");
      activeOrigin = origin;
      return normalizeCatalog(body as CcSwitchCatalog);
    } catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error("CCSwitch 本机服务不可用");
}

export async function applyCcSwitchProvider(
  providerId: string,
  modelId: string,
  kindOrFetcher: "claude" | "codex" | typeof fetch = "codex",
  maybeFetcher: typeof fetch = fetch,
) {
  const kind = typeof kindOrFetcher === "function" ? "codex" : kindOrFetcher;
  const fetcher = typeof kindOrFetcher === "function" ? kindOrFetcher : maybeFetcher;
  const endpoint = kind === "codex" ? "cc-switch-codex-apply" : "cc-switch-apply";
  const response = await fetcher(`${activeOrigin}/api/settings/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider_id: providerId, model_id: modelId, verify_connection: true, sync_account: true }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok !== true || body.verified !== true) throw new Error(body?.detail || body?.message || "CCSwitch 应用未确认");
  return body as { ok: true; verified: true; connection_verified?: boolean; provider_name?: string; model_id?: string; message?: string; account_sync?: { endpoint: string; api_key: string; wire_api?: string } };
}
