import { and, eq } from "drizzle-orm";
import type { Database } from "../../../db/client";
import { createLocalDb } from "../../../db/client";
import { aiSettings } from "../../../db/schema";
import { decryptCredential, encryptCredential } from "./credential-crypto";
import { validateAiEndpoint } from "./model-discovery";

type RepositoryDb = ReturnType<typeof createLocalDb>;
export type AiProvider = "deepseek" | "openai" | "custom" | "ccswitch";
export type AiSettingsInput = {
  provider: AiProvider;
  endpoint: string;
  model: string;
  apiKey?: string;
  clearApiKey?: boolean;
  source?: "manual" | "ccswitch";
  wireApi?: "chat_completions" | "responses";
};
export type PublicAiSettings = {
  configured: boolean;
  provider: AiProvider;
  endpoint: string;
  model: string;
  source: "manual" | "ccswitch";
  hasApiKey: boolean;
  version: number;
  updatedAt: string | null;
  wireApi?: "chat_completions" | "responses";
};
export type RuntimeAiSettings = Omit<PublicAiSettings, "configured" | "hasApiKey" | "version" | "updatedAt"> & { apiKey: string };
export type AiSettingsResult =
  | { ok: true; value: PublicAiSettings }
  | { ok: false; status: 400 | 409; code: string; message: string; currentVersion?: number; updatedAt?: string };

const providers = new Set<AiProvider>(["deepseek", "openai", "custom", "ccswitch"]);
const defaults: PublicAiSettings = {
  configured: false,
  provider: "deepseek",
  endpoint: "https://api.deepseek.com",
  model: "deepseek-chat",
  source: "manual",
  hasApiKey: false,
  version: 0,
  updatedAt: null,
  wireApi: "chat_completions",
};

function publicValue(row?: typeof aiSettings.$inferSelect): PublicAiSettings {
  if (!row) return defaults;
  return {
    configured: Boolean(row.endpoint && row.model && row.apiKeyCiphertext),
    provider: row.provider,
    endpoint: row.endpoint,
    model: row.model,
    source: row.source,
    hasApiKey: Boolean(row.apiKeyCiphertext),
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
    wireApi: row.wireApi === "responses" ? "responses" : "chat_completions",
  };
}

function validate(input: AiSettingsInput): string | null {
  if (!providers.has(input.provider)) return "AI provider is invalid";
  if (input.wireApi !== undefined && input.wireApi !== "chat_completions" && input.wireApi !== "responses") return "Wire API is invalid";
  try { validateAiEndpoint(input.endpoint, input.provider); } catch (error) { return error instanceof Error ? error.message : "API Endpoint is invalid"; }
  if (!input.model.trim() || input.model.trim().length > 160 || /[\u0000-\u001f]/.test(input.model)) return "Model ID is invalid";
  if (input.apiKey !== undefined && (typeof input.apiKey !== "string" || input.apiKey.length > 4096 || /[\r\n]/.test(input.apiKey))) return "API Key is invalid";
  return null;
}

export function createAiSettingsRepository(db: Database, options: { secret: string }) {
  const database = db as RepositoryDb;

  async function current(userId: string) {
    const [row] = await database.select().from(aiSettings).where(eq(aiSettings.userId, userId)).limit(1);
    return row;
  }

  function conflict(row?: typeof aiSettings.$inferSelect): AiSettingsResult {
    return { ok: false, status: 409, code: "VERSION_CONFLICT", message: "AI settings changed on another device", currentVersion: row?.version ?? 0, updatedAt: row?.updatedAt.toISOString() };
  }

  return {
    async get(userId: string): Promise<PublicAiSettings> {
      return publicValue(await current(userId));
    },

    async resolve(userId: string): Promise<RuntimeAiSettings | null> {
      const row = await current(userId);
      if (!row?.apiKeyCiphertext || !row.endpoint || !row.model) return null;
      return {
        provider: row.provider,
        endpoint: row.endpoint,
        model: row.model,
        source: row.source,
        wireApi: row.wireApi === "responses" ? "responses" : "chat_completions",
        apiKey: await decryptCredential(row.apiKeyCiphertext, options.secret, userId),
      };
    },

    async save(userId: string, input: AiSettingsInput, expectedVersion: number): Promise<AiSettingsResult> {
      const invalid = validate(input);
      if (invalid || !Number.isInteger(expectedVersion) || expectedVersion < 0) {
        return { ok: false, status: 400, code: "INVALID_AI_SETTINGS", message: invalid ?? "AI settings version is invalid" };
      }
      const existing = await current(userId);
      if (!existing) {
        if (expectedVersion !== 0) return conflict();
        if (!input.apiKey?.trim()) return { ok: false, status: 400, code: "API_KEY_REQUIRED", message: "API Key is required" };
        const now = new Date();
        try {
          const [created] = await database.insert(aiSettings).values({
            userId,
            provider: input.provider,
            endpoint: input.endpoint.trim().replace(/\/+$/, ""),
            model: input.model.trim(),
            apiKeyCiphertext: await encryptCredential(input.apiKey.trim(), options.secret, userId),
            source: input.source ?? "manual",
            wireApi: input.wireApi ?? "chat_completions",
            version: 1,
            createdAt: now,
            updatedAt: now,
          }).returning();
          return { ok: true, value: publicValue(created) };
        } catch {
          return conflict(await current(userId));
        }
      }
      if (existing.version !== expectedVersion) return conflict(existing);
      let apiKeyCiphertext = existing.apiKeyCiphertext;
      if (input.clearApiKey) apiKeyCiphertext = "";
      else if (input.apiKey?.trim()) apiKeyCiphertext = await encryptCredential(input.apiKey.trim(), options.secret, userId);
      const [updated] = await database.update(aiSettings).set({
        provider: input.provider,
        endpoint: input.endpoint.trim().replace(/\/+$/, ""),
        model: input.model.trim(),
        apiKeyCiphertext,
        source: input.source ?? "manual",
        wireApi: input.wireApi ?? existing.wireApi,
        version: expectedVersion + 1,
        updatedAt: new Date(),
      }).where(and(eq(aiSettings.userId, userId), eq(aiSettings.version, expectedVersion))).returning();
      return updated ? { ok: true, value: publicValue(updated) } : conflict(await current(userId));
    },
  };
}

export type AiSettingsRepository = ReturnType<typeof createAiSettingsRepository>;
