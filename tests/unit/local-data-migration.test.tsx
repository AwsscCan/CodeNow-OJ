// @vitest-environment jsdom
/* eslint-disable import/order -- Vitest requires its environment directive before imports. */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useSession } = vi.hoisted(() => ({ useSession: vi.fn() }));

vi.mock("../../app/lib/auth-client", () => ({ authClient: { useSession } }));

import { LocalDataMigration } from "../../app/components/local-data-migration";

const libraryKey = "codenow-problem-library";

function seedLocalData() {
  localStorage.setItem(libraryKey, JSON.stringify({ state: {
    folders: ["算法", 42],
    archives: [{ folder: "算法", problem: {
      id: "CF0001", title: "本地题目", difficulty: "入门", time: "1s", memory: "64MB",
      description: "题目", inputFormat: "输入", outputFormat: "输出",
      samples: [{ id: 1, input: "1", output: "1" }],
    } }],
  } }));
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  }));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useSession.mockReturnValue({ data: { user: { id: "user-a" } }, isPending: false });
  vi.stubGlobal("fetch", vi.fn(() => jsonResponse({
    counts: { folders: 1, problems: 1, testCases: 1, drafts: 0, conversations: 0 },
    conflicts: [], previewFingerprint: "fp-1", expiresAt: new Date(Date.now() + 60_000).toISOString(),
  })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("LocalDataMigration", () => {
  it("does not scan or render for guests", () => {
    seedLocalData();
    useSession.mockReturnValue({ data: null, isPending: false });
    render(<LocalDataMigration />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("previews valid local data after login and displays counts and warnings", async () => {
    seedLocalData();
    render(<LocalDataMigration />);
    expect(await screen.findByRole("dialog", { name: "导入本地数据" })).toBeTruthy();
    expect(screen.getByText("1 个题目")).toBeTruthy();
    expect(screen.getByText("1 个测试点")).toBeTruthy();
    expect(screen.getByText(/folders contained a non-string value/)).toBeTruthy();
  });

  it("requires one decision for every conflict", async () => {
    seedLocalData();
    vi.mocked(fetch).mockImplementationOnce(() => jsonResponse({
      counts: { folders: 1, problems: 1, testCases: 1, drafts: 0, conversations: 0 },
      conflicts: [{ localProblemKey: "CF0001", cloudProblemId: "cloud-1", problemCode: "CF0001", cloudVersion: 3 }],
      previewFingerprint: "fp-conflict", expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }));
    render(<LocalDataMigration />);
    const submit = await screen.findByRole("button", { name: "导入并合并" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("CF0001 的处理方式"), { target: { value: "duplicate" } });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
  });

  it("cancels without deleting the source data", async () => {
    seedLocalData();
    const first = render(<LocalDataMigration />);
    fireEvent.click(await screen.findByRole("button", { name: "暂不导入" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem(libraryKey)).not.toBeNull();

    first.unmount();
    localStorage.setItem("codenow-theme", JSON.stringify({ state: { themeMode: "girl", editorTheme: "dark" } }));
    vi.mocked(fetch).mockImplementationOnce(() => jsonResponse({
      counts: { folders: 1, problems: 1, testCases: 1, drafts: 0, conversations: 0 },
      conflicts: [], previewFingerprint: "fp-after-preference-hydration", expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }));
    render(<LocalDataMigration />);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("marks a successful import per account and does not prompt again after local hydration changes", async () => {
    seedLocalData();
    vi.mocked(fetch)
      .mockImplementationOnce(() => jsonResponse({
        counts: { folders: 1, problems: 1, testCases: 1, drafts: 0, conversations: 0 },
        conflicts: [], previewFingerprint: "fp-success", expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }))
      .mockImplementationOnce(() => jsonResponse({ fingerprint: "fp-success", counts: { problems: 1 } }));
    const first = render(<LocalDataMigration />);
    fireEvent.click(await screen.findByRole("button", { name: "导入并合并" }));
    await screen.findByText("导入完成");
    expect(JSON.parse(localStorage.getItem("codenow-local-migration-state:user-a") || "null")).toMatchObject({ fingerprint: "fp-success" });
    expect(localStorage.getItem(libraryKey)).not.toBeNull();

    first.unmount();
    localStorage.setItem("codenow-theme", JSON.stringify({ state: { themeMode: "dark", editorTheme: "girl" } }));
    render(<LocalDataMigration />);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("cleans up unchanged source data after seven days without prompting again for changed data", async () => {
    seedLocalData();
    localStorage.setItem("codenow-local-migration-state", JSON.stringify({
      fingerprint: "fp-1", importedAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
      cleanupAfter: new Date(Date.now() - 86_400_000).toISOString(),
    }));
    const unchanged = render(<LocalDataMigration />);
    await vi.waitFor(() => expect(localStorage.getItem(libraryKey)).toBeNull());
    unchanged.unmount();

    seedLocalData();
    vi.mocked(fetch).mockImplementationOnce(() => jsonResponse({
      counts: { folders: 1, problems: 1, testCases: 1, drafts: 0, conversations: 0 },
      conflicts: [], previewFingerprint: "fp-modified", expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }));
    render(<LocalDataMigration />);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem(libraryKey)).not.toBeNull();
  });

  it("does not reuse another account's completed migration", async () => {
    seedLocalData();
    localStorage.setItem("codenow-local-migration-state:user-a", JSON.stringify({
      fingerprint: "fp-user-a", importedAt: new Date().toISOString(),
      cleanupAfter: new Date(Date.now() + 86_400_000).toISOString(),
    }));
    useSession.mockReturnValue({ data: { user: { id: "user-b" } }, isPending: false });

    render(<LocalDataMigration />);

    expect(await screen.findByRole("dialog", { name: "导入本地数据" })).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
