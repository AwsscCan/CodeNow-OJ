import { describe, expect, it } from "vitest";
import { parseLocalData } from "../../app/lib/local-data/parse";

const problem = {
  id: "P1001",
  title: "A + B",
  difficulty: "入门",
  time: "1000 ms",
  memory: "128 MB",
  description: "Add two integers.",
  inputFormat: "Two integers.",
  outputFormat: "Their sum.",
  samples: [{ id: 1, input: "1 2", output: "3", category: "sample" }],
};

function snapshot(values: Record<string, unknown>) {
  return JSON.stringify(Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]),
  ));
}

describe("parseLocalData", () => {
  it("parses current codenow Zustand payloads into a versioned manifest", () => {
    const result = parseLocalData(snapshot({
      "codenow-problem-library": {
        state: {
          archives: [{ problem, folder: " /Algorithms//Graphs/ ", archivedAt: "2026-07-25T12:00:00.000Z" }],
          folders: ["Algorithms", " /Algorithms//Graphs/ "],
          selectedFolder: " /Algorithms//Graphs/ ",
          collapsedFolders: ["Algorithms"],
          folderOrder: [" /Algorithms//Graphs/ "],
          includeSubfolders: true,
        },
        version: 0,
      },
      "codenow-workspace": { state: { problem, code: "int main() {}", workspaceSplit: 42 }, version: 0 },
      "codenow-theme": { state: { themeMode: "light", editorTheme: "dark" }, version: 0 },
      "codenow-ai": {
        state: {
          provider: "deepseek",
          endpoint: "https://api.deepseek.com",
          model: "deepseek-chat",
          apiKeys: { deepseek: "sk-current-secret" },
          chatMessages: [{ role: "user", content: "Give me a hint" }],
        },
        version: 0,
      },
      "codenow-api-keys": { deepseek: "sk-separate-secret" },
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest).toMatchObject({
      schemaVersion: 1,
      folders: ["Algorithms", "Algorithms/Graphs"],
      problems: [{
        id: "P1001",
        folder: "Algorithms/Graphs",
        timeLimit: "1000 ms",
        memoryLimit: "128 MB",
        testCases: [{ id: "1", input: "1 2", expectedOutput: "3", category: "sample" }],
      }],
      currentDraft: { problemId: "P1001", language: "cpp", sourceCode: "int main() {}" },
      preferences: {
        themeMode: "light",
        editorTheme: "dark",
        aiProvider: "deepseek",
        aiEndpoint: "https://api.deepseek.com",
        aiModel: "deepseek-chat",
        workspaceSplit: 42,
        selectedFolder: "Algorithms/Graphs",
        collapsedFolders: ["Algorithms"],
        folderOrder: ["Algorithms/Graphs"],
        includeSubfolders: true,
      },
      conversations: [{ problemId: "P1001", messages: [{ role: "user", content: "Give me a hint" }] }],
    });
    expect(JSON.stringify(result.manifest)).not.toContain("sk-current-secret");
    expect(JSON.stringify(result.manifest)).not.toContain("sk-separate-secret");
    expect(result.manifest.preferences).not.toHaveProperty("apiKeys");
  });

  it("parses direct legacy codeforge payloads", () => {
    const result = parseLocalData(snapshot({
      "codeforge-problem-library": {
        archives: [{ problem: { ...problem, id: "CF-7" }, folder: "Legacy\\Dynamic Programming", archivedAt: "2025-01-01" }],
        folders: ["Legacy\\Dynamic Programming"],
      },
      "codeforge-workspace": { problem: { ...problem, id: "CF-7" }, code: "// legacy" },
      "codeforge-theme": "girl",
      "codeforge-editor-theme": "light",
      "codeforge-ai": {
        provider: "openai",
        endpoint: "https://api.openai.com/v1",
        model: "gpt-4.1-mini",
        apiKey: "sk-legacy-secret",
        chatMessages: [{ role: "assistant", content: "Try a recurrence." }],
      },
      "codeforge-api-keys": { openai: "sk-other-legacy-secret" },
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.folders).toEqual(["Legacy", "Legacy/Dynamic Programming"]);
    expect(result.manifest.problems[0]).toMatchObject({ id: "CF-7", folder: "Legacy/Dynamic Programming" });
    expect(result.manifest.currentDraft).toMatchObject({ problemId: "CF-7", sourceCode: "// legacy" });
    expect(result.manifest.preferences).toMatchObject({ themeMode: "girl", editorTheme: "light", aiProvider: "openai" });
    expect(JSON.stringify(result.manifest)).not.toContain("sk-legacy-secret");
    expect(JSON.stringify(result.manifest)).not.toContain("sk-other-legacy-secret");
  });

  it("returns INVALID_JSON instead of throwing for corrupt JSON", () => {
    expect(() => parseLocalData("{not json")).not.toThrow();
    expect(parseLocalData("{not json")).toMatchObject({ ok: false, error: { code: "INVALID_JSON" } });

    const corruptStore = JSON.stringify({ "codenow-workspace": "{still not json" });
    expect(() => parseLocalData(corruptStore)).not.toThrow();
    expect(parseLocalData(corruptStore)).toMatchObject({ ok: false, error: { code: "INVALID_JSON" } });
  });

  it("skips records with missing or incorrectly typed required fields", () => {
    const result = parseLocalData(snapshot({
      "codenow-problem-library": {
        state: {
          archives: [
            { problem: { ...problem, title: undefined }, folder: "Valid" },
            { problem: { ...problem, id: 12 }, folder: "Valid" },
          ],
          folders: ["Valid", 17, null],
        },
      },
      "codenow-theme": { state: { themeMode: "blue", editorTheme: 1 } },
      "codenow-ai": { state: { provider: "unknown", chatMessages: [{ role: "system", content: "unsafe" }, { role: "user" }] } },
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.problems).toEqual([]);
    expect(result.manifest.folders).toEqual(["Valid"]);
    expect(result.manifest.preferences).toEqual({});
    expect(result.manifest.conversations).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("regenerates duplicate and unsafe problem, test, and conversation IDs", () => {
    const unsafeProblem = { ...problem, id: "../bad id", samples: [
      { id: 5, input: "a", output: "b" },
      { id: 5, input: "c", output: "d" },
      { id: "../unsafe", input: "e", output: "f" },
    ] };
    const result = parseLocalData(snapshot({
      "codenow-problem-library": { state: { archives: [
        { problem: unsafeProblem, folder: "Safe/../Traversal" },
        { problem: { ...problem, id: "P1001" }, folder: "Safe" },
        { problem: { ...problem, id: "P1001" }, folder: "Safe" },
      ] } },
      "codenow-ai": { state: { chatMessages: [{ role: "user", content: "hello" }], conversationId: "../chat" } },
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const problemIds = result.manifest.problems.map((item) => item.id);
    expect(new Set(problemIds).size).toBe(problemIds.length);
    expect(problemIds.every((id) => /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id))).toBe(true);
    const testIds = result.manifest.problems[0].testCases.map((item) => item.id);
    expect(new Set(testIds).size).toBe(testIds.length);
    expect(testIds.every((id) => /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id))).toBe(true);
    expect(result.manifest.folders).not.toContain("Safe/../Traversal");
    expect(result.manifest.conversations[0].id).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
    expect(result.warnings.some((warning) => warning.includes("regenerated"))).toBe(true);
  });

  it("rejects input or output bodies larger than 512 KiB by UTF-8 bytes", () => {
    const oversized = { ...problem, samples: [{ id: 1, input: "界".repeat(174_763), output: "ok" }] };
    const result = parseLocalData(snapshot({
      "codenow-problem-library": { state: { archives: [{ problem: oversized, folder: "Large" }] } },
    }));

    expect(result).toMatchObject({ ok: false, error: { code: "DATA_TOO_LARGE" } });
  });

  it("rejects more than 20 MiB of test data in one problem", () => {
    const block = "x".repeat(512 * 1024);
    const oversized = { ...problem, samples: Array.from({ length: 41 }, (_, index) => ({ id: index + 1, input: block, output: "" })) };
    const result = parseLocalData(snapshot({
      "codenow-problem-library": { state: { archives: [{ problem: oversized, folder: "Large" }] } },
    }));

    expect(result).toMatchObject({ ok: false, error: { code: "DATA_TOO_LARGE" } });
  });

  it("rejects unsupported manifest versions without throwing", () => {
    expect(parseLocalData(JSON.stringify({ schemaVersion: 2 }))).toMatchObject({
      ok: false,
      error: { code: "UNSUPPORTED_VERSION" },
    });
  });
});
