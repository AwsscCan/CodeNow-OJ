// ── Judge0 ──
export const JUDGE0_BASE = "https://ce.judge0.com" as const;
export const MAX_TESTS_PER_RUN = 50;
export const MAX_SOURCE_LENGTH = 100_000;
export const MAX_SINGLE_TEST_LENGTH = 300_000;
export const MAX_TOTAL_TEST_LENGTH = 2_000_000;
export const CPU_TIME_LIMIT_SECONDS = 3;
export const WALL_TIME_LIMIT_SECONDS = 6;
export const MEMORY_LIMIT_KB = 262_144;
export const JUDGE_POLL_INTERVAL_MS = 260;
export const JUDGE_FIRST_POLL_MS = 90;
export const JUDGE_MAX_POLLS = 24;
export const JUDGE_CONCURRENCY = 8;

// ── AI / LLM ──
export const ALLOWED_AI_HOSTS = [
  "api.deepseek.com",
  "api.openai.com",
  "api.anthropic.com",
] as const;
export const AI_DEFAULT_TEMPERATURE = 0.15;
export const AI_CHAT_TEMPERATURE = 0.35;
export const AI_GENERATION_TEMPERATURE = 0.08;
export const AI_MAX_TOKENS_SOLUTION = 4096;
export const AI_MAX_TOKENS_CHAT = 2048;
export const AI_TIMEOUT_MS = 45_000;
export const AI_MAX_RAW_PROBLEM_LENGTH = 60_000;
export const AI_MAX_CODE_CONTEXT_LENGTH = 12_000;
export const AI_JSON_REPAIR_MAX_RAW_LENGTH = 12_000;
export const MAX_TEST_PARTS_COUNT = 100_000;
export const MAX_EXPANDED_CHARS = 300_000;

// ── Rate Limiting ──
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_JUDGE = 30;       // 30 judge runs per minute
export const RATE_LIMIT_AI = 15;           // 15 AI calls per minute
export const RATE_LIMIT_SUBMISSIONS = 60;  // 60 submission ops per minute

// ── Submissions ──
export const MAX_SUBMISSION_SOURCE_LENGTH = 200_000;
export const MAX_BULK_DELETE_PROBLEM_IDS = 500;

// ── Problem Storage ──
export const MAX_PROBLEM_SAMPLES = 50;
export const MAX_PROBLEM_SOURCE_LENGTH = 60_000;
export const MAX_FOLDER_NAME_LENGTH = 80;
export const MAX_FOLDER_DEPTH = 5;

// ── UI ──
export const TOAST_DURATION_MS = 2600;
export const WORKSPACE_SAVE_DEBOUNCE_MS = 450;
export const LOCAL_MARKER_DEBOUNCE_MS = 180;
export const WORKSPACE_SPLIT_MIN = 28;
export const WORKSPACE_SPLIT_MAX = 72;
