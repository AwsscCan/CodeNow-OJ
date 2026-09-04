export type CcSwitchProvider = {
  id: string;
  name: string;
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

export const CCSWITCH_LOCAL_ORIGIN = "http://127.0.0.1:19999";

export async function fetchCcSwitchCatalog(fetcher: typeof fetch = fetch): Promise<CcSwitchCatalog> {
  const response = await fetcher(`${CCSWITCH_LOCAL_ORIGIN}/api/settings/cc-switch-catalog`, { signal: AbortSignal.timeout(2500) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.detail || "CCSwitch 本机服务不可用");
  return body as CcSwitchCatalog;
}

export async function applyCcSwitchProvider(
  providerId: string,
  modelId: string,
  fetcher: typeof fetch = fetch,
) {
  const response = await fetcher(`${CCSWITCH_LOCAL_ORIGIN}/api/settings/cc-switch-apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider_id: providerId, model_id: modelId, verify_connection: true }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok !== true || body.verified !== true) throw new Error(body?.detail || body?.message || "CCSwitch 应用未确认");
  return body as { ok: true; verified: true; connection_verified?: boolean; provider_name?: string; model_id?: string; message?: string };
}
