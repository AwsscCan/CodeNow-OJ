import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("user_email_unique").on(table.email)]);

export const sessions = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (table) => [
  uniqueIndex("session_token_unique").on(table.token),
  index("session_user_id_idx").on(table.userId),
]);

export const accounts = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("account_user_id_idx").on(table.userId)]);

export const verifications = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
}, (table) => [index("verification_identifier_idx").on(table.identifier)]);

export const submissions = sqliteTable("submissions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  problemId: text("problem_id").notNull(),
  problemTitle: text("problem_title").notNull(),
  status: text("status").notNull(),
  passed: text("passed").notNull(),
  sourceCode: text("source_code").notNull(),
  submittedAt: integer("submitted_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("submissions_user_problem_time_idx").on(table.userId, table.problemId, table.submittedAt),
]);

export const authRateLimits = sqliteTable("auth_rate_limits", {
  keyHash: text("key_hash").notNull(),
  action: text("action").notNull(),
  windowStartedAt: integer("window_started_at", { mode: "timestamp_ms" }).notNull(),
  attempts: integer("attempts").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.keyHash, table.action] }),
  index("auth_rate_limits_expires_at_idx").on(table.expiresAt),
]);

export const folders = sqliteTable("folders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  parentId: text("parent_id").references((): AnySQLiteColumn => folders.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("folders_user_id_parent_id_sort_order_idx").on(table.userId, table.parentId, table.sortOrder),
]);

export const problems = sqliteTable("problems", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  folderId: text("folder_id").references(() => folders.id, { onDelete: "set null" }),
  problemCode: text("problem_code").notNull(),
  title: text("title").notNull(),
  difficulty: text("difficulty").notNull(),
  timeLimit: text("time_limit").notNull(),
  memoryLimit: text("memory_limit").notNull(),
  description: text("description").notNull(),
  inputFormat: text("input_format").notNull(),
  outputFormat: text("output_format").notNull(),
  origin: text("origin").notNull().default("private"),
  sourceUrl: text("source_url"),
  extractionStatus: text("extraction_status"),
  version: integer("version").notNull().default(1),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("problems_user_id_problem_code_unique").on(table.userId, table.problemCode),
  index("problems_user_id_folder_id_deleted_at_idx").on(table.userId, table.folderId, table.deletedAt),
  index("problems_user_id_updated_at_idx").on(table.userId, table.updatedAt),
]);

export const testCases = sqliteTable("test_cases", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  problemId: text("problem_id").notNull().references(() => problems.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull(),
  input: text("input").notNull(),
  expectedOutput: text("expected_output").notNull(),
  category: text("category"),
  scale: integer("scale"),
  targets: text("targets"),
  reason: text("reason"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("test_cases_problem_id_sort_order_unique").on(table.problemId, table.sortOrder),
  index("test_cases_user_id_problem_id_sort_order_idx").on(table.userId, table.problemId, table.sortOrder),
]);

export const codeDrafts = sqliteTable("code_drafts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  problemKind: text("problem_kind").notNull(),
  problemRef: text("problem_ref").notNull(),
  language: text("language").notNull(),
  sourceCode: text("source_code").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("code_drafts_user_id_problem_ref_language_unique").on(table.userId, table.problemKind, table.problemRef, table.language),
  index("code_drafts_user_id_updated_at_idx").on(table.userId, table.updatedAt),
]);

export const dataImports = sqliteTable("data_imports", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  idempotencyKey: text("idempotency_key").notNull(),
  fingerprint: text("fingerprint").notNull(),
  resultJson: text("result_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("data_imports_user_id_idempotency_key_unique").on(table.userId, table.idempotencyKey),
  index("data_imports_user_id_created_at_idx").on(table.userId, table.createdAt),
]);
