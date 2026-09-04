import { MAX_SUBMISSION_SOURCE_LENGTH } from "../../api/_lib/constants";
import type {
  LocalDataAiProviderV1,
  LocalDataConversationV1,
  LocalDataDifficultyV1,
  LocalDataManifestV1,
  LocalDataParseResult,
  LocalDataPreferencesV1,
  LocalDataProblemV1,
  LocalDataTestCaseV1,
  LocalDataThemeV1,
} from "./types";

const MAX_TEST_FIELD_BYTES = 512 * 1024;
const MAX_PROBLEM_TEST_BYTES = 20 * 1024 * 1024;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const encoder = new TextEncoder();

const difficulties = ["入门", "普及", "提高"] as const;
const testCategories = ["boundary", "special", "ordinary", "adversarial", "performance", "sample", "manual"] as const;
const themes = ["light", "dark", "girl"] as const;
const formatModes = ["preserve", "full"] as const;
const aiProviders = ["deepseek", "openai", "custom"] as const;
const messageRoles = ["user", "assistant"] as const;
const extractionStatuses = ["complete", "needs_review"] as const;

class DataTooLargeError extends Error {}
class InvalidJsonError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isEnum<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.some((candidate) => candidate === value);
}

function requiredString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    if (typeof record[key] === "string" && record[key].trim()) return record[key];
  }
  return null;
}

function normalizeFolderPath(value: string): string | null {
  const parts = value.replaceAll("\\", "/").split("/").map((part) => part.trim()).filter((part) => part && part !== ".");
  if (parts.some((part) => part === ".." || part.length > 100 || /[\u0000-\u001f]/.test(part))) return null;
  return parts.join("/");
}

function addFolderWithParents(folders: Set<string>, path: string) {
  const parts = path.split("/");
  for (let index = 1; index <= parts.length; index += 1) folders.add(parts.slice(0, index).join("/"));
}

function parseSerializedStore(value: unknown, allowPlainString = false): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    if (allowPlainString) return value;
    throw new InvalidJsonError("A localStorage value contains invalid JSON");
  }
}

function unwrapState(value: unknown): unknown {
  return isRecord(value) && isRecord(value.state) ? value.state : value;
}

function readStore(root: Record<string, unknown>, currentKey: string, legacyKey: string, allowPlainString = false): unknown {
  const value = root[currentKey] ?? root[legacyKey];
  return value === undefined ? undefined : unwrapState(parseSerializedStore(value, allowPlainString));
}

function createSafeId(candidate: unknown, prefix: string, used: Set<string>, warnings: string[]): string {
  if (typeof candidate === "string" || (typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate >= 0)) {
    const normalized = String(candidate);
    if (SAFE_ID.test(normalized) && !used.has(normalized)) {
      used.add(normalized);
      return normalized;
    }
  }
  let suffix = used.size + 1;
  let generated = `${prefix}-${suffix}`;
  while (used.has(generated)) {
    suffix += 1;
    generated = `${prefix}-${suffix}`;
  }
  used.add(generated);
  warnings.push(`${prefix} ID was unsafe or duplicated and has been regenerated`);
  return generated;
}

function parseStringArray(value: unknown, field: string, warnings: string[]): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    warnings.push(`${field} was ignored because it is not an array`);
    return undefined;
  }
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      warnings.push(`${field} contained a non-string value`);
      continue;
    }
    const path = normalizeFolderPath(item);
    if (path) result.push(path);
    else warnings.push(`${field} contained an unsafe folder path`);
  }
  return Array.from(new Set(result));
}

function parseTestCases(value: unknown, problemIndex: number, warnings: string[]): LocalDataTestCaseV1[] | null {
  if (!Array.isArray(value)) {
    warnings.push(`Problem ${problemIndex + 1} was ignored because testCases is not an array`);
    return null;
  }
  const usedIds = new Set<string>();
  const testCases: LocalDataTestCaseV1[] = [];
  let totalBytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!isRecord(item) || typeof item.input !== "string") {
      warnings.push(`Problem ${problemIndex + 1} test ${index + 1} was ignored because required fields are invalid`);
      continue;
    }
    const expectedOutput = typeof item.expectedOutput === "string" ? item.expectedOutput : item.output;
    if (typeof expectedOutput !== "string") {
      warnings.push(`Problem ${problemIndex + 1} test ${index + 1} was ignored because required fields are invalid`);
      continue;
    }
    const inputBytes = encoder.encode(item.input).byteLength;
    const outputBytes = encoder.encode(expectedOutput).byteLength;
    if (inputBytes > MAX_TEST_FIELD_BYTES || outputBytes > MAX_TEST_FIELD_BYTES) {
      throw new DataTooLargeError("Each test input and output is limited to 512 KiB");
    }
    totalBytes += inputBytes + outputBytes;
    if (totalBytes > MAX_PROBLEM_TEST_BYTES) {
      throw new DataTooLargeError("Test data is limited to 20 MiB per problem");
    }
    const testCase: LocalDataTestCaseV1 = {
      id: createSafeId(item.id, `local-test-${problemIndex + 1}`, usedIds, warnings),
      input: item.input,
      expectedOutput,
    };
    if (isEnum(item.category, testCategories)) testCase.category = item.category;
    if (typeof item.scale === "number" && Number.isFinite(item.scale)) testCase.scale = Math.trunc(item.scale);
    if (typeof item.targets === "string") testCase.targets = item.targets;
    if (typeof item.reason === "string") testCase.reason = item.reason;
    testCases.push(testCase);
  }
  return testCases;
}

function parseProblem(
  value: unknown,
  folderValue: unknown,
  problemIndex: number,
  usedIds: Set<string>,
  warnings: string[],
): { problem: LocalDataProblemV1; sourceId: string } | null {
  if (!isRecord(value)) {
    warnings.push(`Problem ${problemIndex + 1} was ignored because it is not an object`);
    return null;
  }
  const sourceId = requiredString(value, ["id", "problemCode"]);
  const title = requiredString(value, ["title"]);
  const timeLimit = requiredString(value, ["timeLimit", "time"]);
  const memoryLimit = requiredString(value, ["memoryLimit", "memory"]);
  const description = requiredString(value, ["description"]);
  const inputFormat = requiredString(value, ["inputFormat"]);
  const outputFormat = requiredString(value, ["outputFormat"]);
  if (!sourceId || !title || !timeLimit || !memoryLimit || !description || !inputFormat || !outputFormat || !isEnum(value.difficulty, difficulties)) {
    warnings.push(`Problem ${problemIndex + 1} was ignored because required fields are invalid`);
    return null;
  }
  const testCases = parseTestCases(value.testCases ?? value.samples, problemIndex, warnings);
  if (!testCases) return null;
  let folder = "";
  if (typeof folderValue === "string") {
    const normalized = normalizeFolderPath(folderValue);
    if (normalized !== null) folder = normalized;
    else warnings.push(`Problem ${problemIndex + 1} contained an unsafe folder path`);
  }
  const problem: LocalDataProblemV1 = {
    id: createSafeId(sourceId, "local-problem", usedIds, warnings),
    title,
    difficulty: value.difficulty as LocalDataDifficultyV1,
    timeLimit,
    memoryLimit,
    description,
    inputFormat,
    outputFormat,
    folder,
    testCases,
  };
  if (typeof value.sourceUrl === "string") problem.sourceUrl = value.sourceUrl;
  if (isEnum(value.extractionStatus, extractionStatuses)) problem.extractionStatus = value.extractionStatus;
  return { problem, sourceId };
}

function readThemePreference(value: unknown, field: string, preferences: LocalDataPreferencesV1, warnings: string[]) {
  if (value === undefined) return;
  if (!isEnum(value, themes)) {
    warnings.push(`${field} was ignored because it has an invalid value`);
    return;
  }
  preferences[field as "themeMode" | "editorTheme"] = value as LocalDataThemeV1;
}

function parseRoot(raw: unknown): Record<string, unknown> {
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!isRecord(value)) throw new InvalidJsonError("Local data must be a JSON object");
  return value;
}

export function parseLocalData(raw: unknown): LocalDataParseResult {
  try {
    const root = parseRoot(raw);
    if (root.schemaVersion !== undefined && root.schemaVersion !== 1) {
      return { ok: false, error: { code: "UNSUPPORTED_VERSION", message: `Unsupported local data version: ${String(root.schemaVersion)}` } };
    }

    const warnings: string[] = [];
    const folders = new Set<string>();
    const problems: LocalDataProblemV1[] = [];
    const usedProblemIds = new Set<string>();
    const sourceProblemIds = new Map<string, string>();
    const library = readStore(root, "codenow-problem-library", "codeforge-problem-library");
    const libraryState = isRecord(library) ? library : {};
    const explicitFolders = parseStringArray(libraryState.folders, "folders", warnings) ?? [];
    for (const folder of explicitFolders) addFolderWithParents(folders, folder);

    const archives = libraryState.archives;
    if (archives !== undefined && !Array.isArray(archives)) warnings.push("archives was ignored because it is not an array");
    if (Array.isArray(archives)) {
      for (let index = 0; index < archives.length; index += 1) {
        const archive = archives[index];
        if (!isRecord(archive)) {
          warnings.push(`Archive ${index + 1} was ignored because it is not an object`);
          continue;
        }
        const parsed = parseProblem(archive.problem, archive.folder, index, usedProblemIds, warnings);
        if (!parsed) continue;
        problems.push(parsed.problem);
        if (!sourceProblemIds.has(parsed.sourceId)) sourceProblemIds.set(parsed.sourceId, parsed.problem.id);
        if (parsed.problem.folder) addFolderWithParents(folders, parsed.problem.folder);
      }
    }

    const workspace = readStore(root, "codenow-workspace", "codeforge-workspace");
    const workspaceState = isRecord(workspace) ? workspace : {};
    const workspaceProblem = isRecord(workspaceState.problem) ? workspaceState.problem : null;
    let workspaceProblemId: string | undefined;
    if (workspaceProblem) {
      const sourceId = requiredString(workspaceProblem, ["id", "problemCode"]);
      workspaceProblemId = sourceId ? sourceProblemIds.get(sourceId) : undefined;
      if (!workspaceProblemId) {
        const selectedFolder = typeof libraryState.selectedFolder === "string" ? libraryState.selectedFolder : "";
        const parsed = parseProblem(workspaceProblem, selectedFolder, problems.length, usedProblemIds, warnings);
        if (parsed) {
          problems.push(parsed.problem);
          sourceProblemIds.set(parsed.sourceId, parsed.problem.id);
          workspaceProblemId = parsed.problem.id;
          if (parsed.problem.folder) addFolderWithParents(folders, parsed.problem.folder);
        }
      }
    }

    if (typeof workspaceState.code === "string" && workspaceState.code.length > MAX_SUBMISSION_SOURCE_LENGTH) {
      throw new DataTooLargeError(`Draft source code is limited to ${MAX_SUBMISSION_SOURCE_LENGTH} characters`);
    }
    const currentDraft = workspaceProblemId && typeof workspaceState.code === "string"
      ? { problemId: workspaceProblemId, language: "cpp" as const, sourceCode: workspaceState.code }
      : null;

    const preferences: LocalDataPreferencesV1 = {};
    const theme = readStore(root, "codenow-theme", "codeforge-theme", true);
    if (isRecord(theme)) {
      readThemePreference(theme.themeMode, "themeMode", preferences, warnings);
      readThemePreference(theme.editorTheme, "editorTheme", preferences, warnings);
    } else {
      readThemePreference(theme, "themeMode", preferences, warnings);
    }
    if (preferences.editorTheme === undefined) {
      const editorTheme = readStore(root, "codenow-editor-theme", "codeforge-editor-theme", true);
      readThemePreference(editorTheme, "editorTheme", preferences, warnings);
    }
    if (isRecord(theme) && theme.formatMode !== undefined) {
      if (isEnum(theme.formatMode, formatModes)) preferences.formatMode = theme.formatMode;
      else warnings.push("formatMode was ignored because it has an invalid value");
    }

    const selectedFolder = typeof libraryState.selectedFolder === "string" ? normalizeFolderPath(libraryState.selectedFolder) : null;
    if (selectedFolder) preferences.selectedFolder = selectedFolder;
    const collapsedFolders = parseStringArray(libraryState.collapsedFolders, "collapsedFolders", warnings);
    if (collapsedFolders) preferences.collapsedFolders = collapsedFolders;
    const folderOrder = parseStringArray(libraryState.folderOrder, "folderOrder", warnings);
    if (folderOrder) preferences.folderOrder = folderOrder;
    if (typeof libraryState.includeSubfolders === "boolean") preferences.includeSubfolders = libraryState.includeSubfolders;
    if (typeof workspaceState.workspaceSplit === "number" && Number.isFinite(workspaceState.workspaceSplit)) {
      preferences.workspaceSplit = workspaceState.workspaceSplit;
    }

    const ai = readStore(root, "codenow-ai", "codeforge-ai");
    const aiState = isRecord(ai) ? ai : {};
    if (aiState.provider !== undefined && !isEnum(aiState.provider, aiProviders)) warnings.push("AI provider was ignored because it has an invalid value");
    if (isEnum(aiState.provider, aiProviders)) preferences.aiProvider = aiState.provider as LocalDataAiProviderV1;
    if (typeof aiState.endpoint === "string") preferences.aiEndpoint = aiState.endpoint;
    if (typeof aiState.model === "string") preferences.aiModel = aiState.model;

    const conversations: LocalDataConversationV1[] = [];
    if (aiState.chatMessages !== undefined && !Array.isArray(aiState.chatMessages)) {
      warnings.push("chatMessages was ignored because it is not an array");
    }
    if (Array.isArray(aiState.chatMessages)) {
      const messages = aiState.chatMessages.flatMap((message, index) => {
        if (!isRecord(message) || !isEnum(message.role, messageRoles) || typeof message.content !== "string" || !message.content.trim()) {
          warnings.push(`Chat message ${index + 1} was ignored because required fields are invalid`);
          return [];
        }
        return [{ role: message.role, content: message.content }];
      });
      if (messages.length) {
        const usedConversationIds = new Set<string>();
        conversations.push({
          id: createSafeId(aiState.conversationId ?? "conversation-1", "local-conversation", usedConversationIds, warnings),
          ...(workspaceProblemId ? { problemId: workspaceProblemId } : {}),
          messages,
        });
      }
    }

    const manifest: LocalDataManifestV1 = {
      schemaVersion: 1,
      folders: Array.from(folders),
      problems,
      currentDraft,
      preferences,
      conversations,
    };
    return { ok: true, manifest, warnings };
  } catch (error) {
    if (error instanceof DataTooLargeError) {
      return { ok: false, error: { code: "DATA_TOO_LARGE", message: error.message } };
    }
    const message = error instanceof InvalidJsonError ? error.message : "Local data contains invalid JSON";
    return { ok: false, error: { code: "INVALID_JSON", message } };
  }
}

export const parseLegacyLocalData = parseLocalData;

export type { LocalDataManifestV1, LocalDataParseResult } from "./types";
