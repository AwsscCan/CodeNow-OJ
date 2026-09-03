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
});
