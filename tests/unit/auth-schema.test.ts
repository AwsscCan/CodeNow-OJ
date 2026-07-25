import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  accounts,
  sessions,
  submissions,
  users,
  verifications,
} from "../../db/schema";

describe("authentication schema", () => {
  it("owns submissions and exposes every Better Auth table", () => {
    expect(getTableColumns(users)).toHaveProperty("emailVerified");
    expect(getTableColumns(sessions)).toHaveProperty("token");
    expect(getTableColumns(accounts)).toHaveProperty("password");
    expect(getTableColumns(verifications)).toHaveProperty("value");
    expect(getTableColumns(submissions)).toHaveProperty("userId");
  });
});
