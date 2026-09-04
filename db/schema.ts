import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
  banned: integer("banned", { mode: "boolean" }).notNull().default(false),
  banReason: text("ban_reason"),
  banExpires: integer("ban_expires", { mode: "timestamp_ms" }),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  check("user_role_check", sql`${table.role} in ('user', 'admin')`),
  uniqueIndex("user_email_unique").on(table.email),
  index("user_role_banned_idx").on(table.role, table.banned),
]);

export const sessions = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  impersonatedBy: text("impersonated_by"),
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
  resultsJson: text("results_json").notNull().default("[]"),
  totalDurationMs: integer("total_duration_ms"),
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
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
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

export const userPreferences = sqliteTable("user_preferences", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  themeMode: text("theme_mode").notNull().default("light"),
  editorTheme: text("editor_theme").notNull().default("light"),
  settingsJson: text("settings_json").notNull().default("{}"),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("user_preferences_updated_at_idx").on(table.updatedAt)]);

export const aiSettings = sqliteTable("ai_settings", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider", { enum: ["deepseek", "openai", "custom", "ccswitch"] }).notNull(),
  endpoint: text("endpoint").notNull(),
  model: text("model").notNull(),
  apiKeyCiphertext: text("api_key_ciphertext").notNull(),
  source: text("source", { enum: ["manual", "ccswitch"] }).notNull().default("manual"),
  wireApi: text("wire_api", { enum: ["chat_completions", "responses"] }).notNull().default("chat_completions"),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("ai_settings_updated_at_idx").on(table.updatedAt)]);

export const aiConversations = sqliteTable("ai_conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  problemRef: text("problem_ref"),
  title: text("title").notNull(),
  version: integer("version").notNull().default(1),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("ai_conversations_user_id_updated_at_idx").on(table.userId, table.updatedAt),
  index("ai_conversations_user_id_problem_ref_idx").on(table.userId, table.problemRef),
]);

export const aiMessages = sqliteTable("ai_messages", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id").notNull().references(() => aiConversations.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  sortOrder: integer("sort_order").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  check("ai_messages_role_check", sql`${table.role} in ('user', 'assistant')`),
  uniqueIndex("ai_messages_user_conversation_idempotency_unique").on(table.userId, table.conversationId, table.idempotencyKey),
  uniqueIndex("ai_messages_conversation_id_sort_order_unique").on(table.conversationId, table.sortOrder),
  index("ai_messages_user_id_conversation_id_sort_order_idx").on(table.userId, table.conversationId, table.sortOrder),
]);

export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  summary: text("summary"),
  coverUrl: text("cover_url"),
  visibility: text("visibility", { enum: ["private", "public"] }).notNull().default("private"),
  status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
  moderationState: text("moderation_state", { enum: ["visible", "hidden"] }).notNull().default("visible"),
  hiddenReason: text("hidden_reason"),
  source: text("source", { enum: ["standalone", "problem"] }).notNull().default("standalone"),
  problemKind: text("problem_kind", { enum: ["private", "public"] }),
  problemRef: text("problem_ref"),
  likeCount: integer("like_count").notNull().default(0),
  favoriteCount: integer("favorite_count").notNull().default(0),
  commentCount: integer("comment_count").notNull().default(0),
  publishedAt: integer("published_at", { mode: "timestamp_ms" }),
  version: integer("version").notNull().default(1),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  check("notes_visibility_check", sql`${table.visibility} in ('private', 'public')`),
  check("notes_status_check", sql`${table.status} in ('draft', 'published')`),
  check("notes_moderation_state_check", sql`${table.moderationState} in ('visible', 'hidden')`),
  check("notes_source_check", sql`${table.source} in ('standalone', 'problem')`),
  check("notes_problem_kind_check", sql`${table.problemKind} is null or ${table.problemKind} in ('private', 'public')`),
  index("notes_user_id_updated_at_idx").on(table.userId, table.updatedAt),
  index("notes_user_id_deleted_at_idx").on(table.userId, table.deletedAt),
  index("notes_user_id_problem_ref_idx").on(table.userId, table.problemKind, table.problemRef),
  index("notes_visibility_status_moderation_published_at_idx").on(table.visibility, table.status, table.moderationState, table.publishedAt),
]);

export const noteProblemRefs = sqliteTable("note_problem_refs", {
  id: text("id").primaryKey(),
  noteId: text("note_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  problemKind: text("problem_kind", { enum: ["private", "public"] }).notNull(),
  problemRef: text("problem_ref").notNull(),
  sortOrder: integer("sort_order").notNull(),
}, (table) => [
  check("note_problem_refs_kind_check", sql`${table.problemKind} in ('private', 'public')`),
  uniqueIndex("note_problem_refs_note_id_sort_order_unique").on(table.noteId, table.sortOrder),
  index("note_problem_refs_user_id_note_id_sort_order_idx").on(table.userId, table.noteId, table.sortOrder),
]);

export const noteComments = sqliteTable("note_comments", {
  id: text("id").primaryKey(),
  noteId: text("note_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  parentId: text("parent_id").references((): AnySQLiteColumn => noteComments.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  version: integer("version").notNull().default(1),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("note_comments_user_note_idempotency_unique").on(table.userId, table.noteId, table.idempotencyKey),
  index("note_comments_note_id_deleted_at_created_at_idx").on(table.noteId, table.deletedAt, table.createdAt),
  index("note_comments_user_id_created_at_idx").on(table.userId, table.createdAt),
  index("note_comments_note_id_parent_id_created_at_idx").on(table.noteId, table.parentId, table.createdAt),
]);

export const noteReactions = sqliteTable("note_reactions", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  noteId: text("note_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["like", "favorite"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.noteId, table.kind] }),
  check("note_reactions_kind_check", sql`${table.kind} in ('like', 'favorite')`),
  index("note_reactions_note_id_kind_idx").on(table.noteId, table.kind),
]);

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("tags_user_id_name_unique").on(table.userId, table.name),
]);

export const noteTags = sqliteTable("note_tags", {
  noteId: text("note_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
  tagId: text("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (table) => [
  primaryKey({ columns: [table.noteId, table.tagId] }),
  index("note_tags_tag_id_idx").on(table.tagId),
  index("note_tags_user_id_note_id_idx").on(table.userId, table.noteId),
]);

export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(),
  reporterUserId: text("reporter_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetKind: text("target_kind", { enum: ["note", "comment"] }).notNull(),
  targetId: text("target_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status", { enum: ["open", "reviewed", "dismissed", "actioned"] }).notNull().default("open"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  check("reports_target_kind_check", sql`${table.targetKind} in ('note', 'comment')`),
  check("reports_status_check", sql`${table.status} in ('open', 'reviewed', 'dismissed', 'actioned')`),
  uniqueIndex("reports_reporter_target_unique").on(table.reporterUserId, table.targetKind, table.targetId),
  index("reports_status_created_at_idx").on(table.status, table.createdAt),
]);

const adminAuditActions = [
  "user.invite",
  "user.password_reset",
  "user.ban",
  "user.unban",
  "user.sessions_revoke",
  "user.role_change",
  "content.soft_delete",
  "content.restore",
] as const;

export const adminAuditLogs = sqliteTable("admin_audit_logs", {
  id: text("id").primaryKey(),
  adminUserId: text("admin_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  action: text("action", { enum: adminAuditActions }).notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  requestId: text("request_id").notNull(),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  check("admin_audit_action_check", sql`${table.action} in ('user.invite', 'user.password_reset', 'user.ban', 'user.unban', 'user.sessions_revoke', 'user.role_change', 'content.soft_delete', 'content.restore')`),
  index("admin_audit_admin_created_at_idx").on(table.adminUserId, table.createdAt),
  index("admin_audit_target_idx").on(table.targetType, table.targetId, table.createdAt),
]);
