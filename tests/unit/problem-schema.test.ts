import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import {
  codeDrafts,
  folders,
  problems,
  testCases,
} from "../../db/schema";

describe("cloud problem data schema", () => {
  it("defines user-owned folders, problems, test cases, and code drafts", () => {
    expect(getTableColumns(folders)).toHaveProperty("userId");

    const problemColumns = getTableColumns(problems);
    expect(problemColumns).toHaveProperty("problemCode");
    expect(problemColumns).toHaveProperty("version");
    expect(problemColumns).toHaveProperty("deletedAt");

    const testCaseColumns = getTableColumns(testCases);
    expect(testCaseColumns).toHaveProperty("problemId");
    expect(testCaseColumns).toHaveProperty("sortOrder");

    const draftColumns = getTableColumns(codeDrafts);
    expect(draftColumns).toHaveProperty("problemRef");
    expect(draftColumns).toHaveProperty("language");
    expect(draftColumns).toHaveProperty("version");
  });

  it("enforces user-scoped problem codes and per-language drafts", () => {
    const problemCodeKey = getTableConfig(problems).indexes.find(
      (entry) => entry.config.name === "problems_user_id_problem_code_unique",
    );
    const draftLanguageKey = getTableConfig(codeDrafts).indexes.find(
      (entry) => entry.config.name === "code_drafts_user_id_problem_ref_language_unique",
    );

    expect(problemCodeKey?.config.unique).toBe(true);
    expect(draftLanguageKey?.config.unique).toBe(true);
  });
});
