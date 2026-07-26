export type LocalDataDifficultyV1 = "入门" | "普及" | "提高";
export type LocalDataTestCategoryV1 = "boundary" | "special" | "ordinary" | "adversarial" | "performance" | "sample" | "manual";
export type LocalDataThemeV1 = "light" | "dark" | "girl";
export type LocalDataAiProviderV1 = "deepseek" | "openai" | "custom";

export type LocalDataTestCaseV1 = {
  id: string;
  input: string;
  expectedOutput: string;
  category?: LocalDataTestCategoryV1;
  scale?: number;
  targets?: string;
  reason?: string;
};

export type LocalDataProblemV1 = {
  id: string;
  title: string;
  difficulty: LocalDataDifficultyV1;
  timeLimit: string;
  memoryLimit: string;
  description: string;
  inputFormat: string;
  outputFormat: string;
  folder: string;
  testCases: LocalDataTestCaseV1[];
  sourceUrl?: string;
  extractionStatus?: "complete" | "needs_review";
};

export type LocalDataDraftV1 = {
  problemId: string;
  language: "cpp";
  sourceCode: string;
};

export type LocalDataPreferencesV1 = {
  themeMode?: LocalDataThemeV1;
  editorTheme?: LocalDataThemeV1;
  aiProvider?: LocalDataAiProviderV1;
  aiEndpoint?: string;
  aiModel?: string;
  workspaceSplit?: number;
  selectedFolder?: string;
  collapsedFolders?: string[];
  folderOrder?: string[];
  includeSubfolders?: boolean;
};

export type LocalDataMessageV1 = {
  role: "user" | "assistant";
  content: string;
};

export type LocalDataConversationV1 = {
  id: string;
  problemId?: string;
  messages: LocalDataMessageV1[];
};

export type LocalDataManifestV1 = {
  schemaVersion: 1;
  folders: string[];
  problems: LocalDataProblemV1[];
  currentDraft: LocalDataDraftV1 | null;
  preferences: LocalDataPreferencesV1;
  conversations: LocalDataConversationV1[];
};

export type LocalDataParseError = {
  code: "INVALID_JSON" | "UNSUPPORTED_VERSION" | "DATA_TOO_LARGE";
  message: string;
};

export type LocalDataParseResult =
  | { ok: true; manifest: LocalDataManifestV1; warnings: string[] }
  | { ok: false; error: LocalDataParseError };
