// @vitest-environment jsdom
/* eslint-disable import/order -- Vitest requires mocks before the tested module. */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../../app/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "user-a" } }, isPending: false }), signOut: vi.fn(async () => ({})) },
}));
vi.mock("../../app/components/auth-status", () => ({ AuthStatus: () => null }));

import SettingsPage from "../../app/settings/page";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/models")) return new Response(JSON.stringify({ models: ["model-a", "model-b"] }), { status: 200 });
    if (init?.method === "PUT") return new Response(JSON.stringify({ configured: true, provider: "custom", endpoint: "https://llm.example.com/v1", model: "model-a", source: "manual", hasApiKey: true, version: 2, updatedAt: "now" }), { status: 200 });
    return new Response(JSON.stringify({ configured: true, provider: "custom", endpoint: "https://llm.example.com/v1", model: "model-a", source: "manual", hasApiKey: true, version: 1, updatedAt: "now" }), { status: 200 });
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AI settings page", () => {
  it("loads account settings without receiving a plaintext key", async () => {
    render(<SettingsPage />);
    expect(await screen.findByDisplayValue("https://llm.example.com/v1")).toBeTruthy();
    expect(screen.getByLabelText("API Key")).toHaveProperty("value", "");
    expect(screen.getByText("已保存密钥")).toBeTruthy();
  });

  it("saves the selected model separately and can refresh the model list", async () => {
    render(<SettingsPage />);
    await screen.findByDisplayValue("model-a");
    fireEvent.click(screen.getByRole("button", { name: "拉取模型" }));
    expect(await screen.findByRole("option", { name: "model-b" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("模型"), { target: { value: "model-b" } });
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
    await waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "PUT");
      expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ model: "model-b", version: 1 });
    });
  });

  it("provides a CCSwitch JSON import control", async () => {
    render(<SettingsPage />);
    await screen.findByDisplayValue("model-a");
    expect(screen.getByLabelText("导入 CCSwitch 配置")).toBeTruthy();
  });

  it("offers a real local CCSwitch connection and provider application", async () => {
    render(<SettingsPage />);
    await screen.findByDisplayValue("model-a");
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("127.0.0.1:18088")) {
        if (String(input).includes("cc-switch-catalog")) return new Response(JSON.stringify({ active: true, providers: [{ id: "p1", name: "Local Provider", is_current: true, model_id: "m1", models: ["m1"] }] }), { status: 200 });
        return new Response(JSON.stringify({ ok: true, verified: true, connection_verified: true, provider_name: "Local Provider", model_id: "m1", message: "已验证", account_sync: { endpoint: "https://relay.example/v1", api_key: "secret-for-test", wire_api: "responses" } }), { status: 200 });
      }
      return new Response(JSON.stringify({ configured: true, provider: "custom", endpoint: "https://llm.example.com/v1", model: "model-a", source: "manual", hasApiKey: true, version: 1, updatedAt: "now" }), { status: 200 });
    });
    fireEvent.click(screen.getByRole("button", { name: "连接本机" }));
    expect(await screen.findByText("已连接 · 1 个 Provider")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "验证并应用" }));
    await waitFor(() => expect(screen.getByText(/本机已实测联动/)).toBeTruthy());
    const call = vi.mocked(fetch).mock.calls.find(([input]) => String(input).includes("cc-switch-apply"));
    expect(call).toBeTruthy();
    const saveCall = vi.mocked(fetch).mock.calls.find(([input, init]) => String(input).endsWith("/api/ai-settings") && init?.method === "PUT");
    expect(saveCall).toBeTruthy();
    expect(JSON.parse(String(saveCall?.[1]?.body))).toMatchObject({ provider: "ccswitch", endpoint: "https://relay.example/v1", model: "m1", apiKey: "secret-for-test", source: "ccswitch", wireApi: "responses" });
  });
});
