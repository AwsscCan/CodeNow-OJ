import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { notes } from "../../db/schema";

describe("notes schema", () => {
  it("defines a user-owned versioned soft-deletable note table", () => {
    const columns = getTableColumns(notes);
    for (const column of [
      "userId", "title", "content", "summary", "coverUrl",
      "visibility", "status", "moderationState", "hiddenReason",
      "source", "problemKind", "problemRef",
      "likeCount", "favoriteCount", "commentCount",
      "publishedAt", "version", "deletedAt", "createdAt", "updatedAt",
    ]) {
      expect(columns).toHaveProperty(column);
    }
    expect(columns.version.notNull).toBe(true);
    expect(columns.visibility.notNull).toBe(true);
    expect(columns.likeCount.notNull).toBe(true);
  });

  it("carries the visibility, status and moderation guardrails plus list indexes", () => {
    const config = getTableConfig(notes);
    const checkNames = config.checks.map((entry) => entry.name);
    expect(checkNames).toEqual(expect.arrayContaining([
      "notes_visibility_check",
      "notes_status_check",
      "notes_moderation_state_check",
      "notes_source_check",
      "notes_problem_kind_check",
    ]));

    const indexNames = config.indexes.map((entry) => entry.config.name);
    expect(indexNames).toEqual(expect.arrayContaining([
      "notes_user_id_updated_at_idx",
      "notes_user_id_deleted_at_idx",
      "notes_user_id_problem_ref_idx",
      "notes_visibility_status_moderation_published_at_idx",
    ]));
  });
});
