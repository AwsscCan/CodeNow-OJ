// @vitest-environment jsdom
/* eslint-disable import/order -- Vitest requires its environment directive before imports. */
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useSession } = vi.hoisted(() => ({ useSession: vi.fn() }));
vi.mock("../../app/lib/auth-client", () => ({ authClient: { useSession } }));

import { PreferenceSync } from "../../app/components/preference-sync";
import { useThemeStore } from "../../app/stores/theme-store";

beforeEach(() => {
  localStorage.clear();
  useThemeStore.setState({ themeMode: "light", editorTheme: "light" });
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("PreferenceSync", () => {
  it("defers persisted theme hydration until after the first client render", async () => {
    expect(useThemeStore.persist.getOptions().skipHydration).toBe(true);
    localStorage.setItem("codenow-theme", JSON.stringify({ state: { themeMode: "dark", editorTheme: "girl" }, version: 0 }));
    useSession.mockReturnValue({ data: null, isPending: false });
    render(<PreferenceSync delay={0} />);
    await waitFor(() => expect(useThemeStore.getState()).toMatchObject({ themeMode: "dark", editorTheme: "girl" }));
  });

  it("keeps guest preferences local without calling the cloud", () => {
    useSession.mockReturnValue({ data: null, isPending: false });
    render(<PreferenceSync delay={0} />);
    act(() => useThemeStore.getState().setThemeMode("girl"));
    expect(useThemeStore.getState().themeMode).toBe("girl");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("hydrates after login and debounces only safe theme fields back to the cloud", async () => {
    useSession.mockReturnValue({ data: { user: { id: "user-a" } }, isPending: false });
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ preferences: { themeMode: "dark", editorTheme: "girl" }, version: 3, updatedAt: "now" }))
      .mockResolvedValueOnce(response({ preferences: { themeMode: "light", editorTheme: "girl" }, version: 4, updatedAt: "later" }));
    render(<PreferenceSync delay={0} />);
    await waitFor(() => expect(useThemeStore.getState()).toMatchObject({ themeMode: "dark", editorTheme: "girl" }));
    expect(fetch).toHaveBeenCalledTimes(1);

    act(() => useThemeStore.getState().setThemeMode("light"));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const [, init] = vi.mocked(fetch).mock.calls[1];
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({ version: 3, patch: { themeMode: "light", editorTheme: "girl" } });
    expect(String(init?.body)).not.toMatch(/apiKey|token|secret/i);
  });
});

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
