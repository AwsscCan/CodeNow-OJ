import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { aiConversations, aiMessages, userPreferences } from "../../db/schema";

describe("preference and conversation schema", () => {
  it("defines one versioned preference row per user without credential columns", () => {
    const columns = getTableColumns(userPreferences);
    expect(columns).toHaveProperty("userId");
    expect(columns).toHaveProperty("themeMode");
    expect(columns).toHaveProperty("editorTheme");
    expect(columns).toHaveProperty("settingsJson");
    expect(columns).toHaveProperty("version");
    expect(columns).toHaveProperty("createdAt");
    expect(columns).toHaveProperty("updatedAt");
    expect(Object.keys(columns).join(" ")).not.toMatch(/api.?key|credential|secret|token/i);
    expect(columns.userId.primary).toBe(true);
  });

  it("defines indexed user-owned conversations and ordered messages", () => {
    const conversationColumns = getTableColumns(aiConversations);
    expect(conversationColumns).toHaveProperty("userId");
    expect(conversationColumns).toHaveProperty("problemRef");
    expect(conversationColumns).toHaveProperty("title");
    expect(conversationColumns).toHaveProperty("version");
    expect(conversationColumns).toHaveProperty("createdAt");
    expect(conversationColumns).toHaveProperty("updatedAt");
    expect(getTableConfig(aiConversations).indexes.map((entry) => entry.config.name)).toContain("ai_conversations_user_id_updated_at_idx");

    const messageColumns = getTableColumns(aiMessages);
    expect(messageColumns).toHaveProperty("userId");
    expect(messageColumns).toHaveProperty("conversationId");
    expect(messageColumns).toHaveProperty("role");
    expect(messageColumns).toHaveProperty("content");
    expect(messageColumns).toHaveProperty("sortOrder");
    expect(messageColumns).toHaveProperty("version");
    expect(messageColumns).toHaveProperty("createdAt");
    expect(messageColumns).toHaveProperty("updatedAt");
    expect(messageColumns.role.enumValues).toEqual(["user", "assistant"]);
    expect(getTableConfig(aiMessages).indexes.map((entry) => entry.config.name)).toContain("ai_messages_user_id_conversation_id_sort_order_idx");
  });
});
