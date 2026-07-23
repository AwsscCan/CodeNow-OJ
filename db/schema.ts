import { text } from "drizzle-orm/sqlite-core";
import { sqliteTable } from "drizzle-orm/sqlite-core";

export const submissions = sqliteTable("submissions", {
  id: text("id").primaryKey(),
  problemId: text("problem_id").notNull(),
  problemTitle: text("problem_title").notNull(),
  status: text("status").notNull(),
  passed: text("passed").notNull(),
  sourceCode: text("source_code").notNull(),
  submittedAt: text("submitted_at").notNull(),
});
