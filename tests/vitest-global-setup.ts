/* CodeNow OJ · 单元测试隔离数据库初始化 · Bamzc */

import { rmSync } from "node:fs";
import { resolve } from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

/** 单测隔离库路径，与开发库 .data/codenow.db 分离，避免测试污染本地数据 */
export const TEST_DB_PATH = resolve(process.cwd(), ".data", "vitest-local.db");

/**
 * 测试套件启动前：清掉旧隔离库并预跑迁移，
 * 使各并发 worker 打开的都是已迁移好的干净库，杜绝并发建表冲突。
 */
export default function setup() {
  for (const suffix of ["", "-shm", "-wal"]) {
    rmSync(TEST_DB_PATH + suffix, { force: true });
  }
  const db = drizzle(new BetterSqlite3(TEST_DB_PATH));
  migrate(db, { migrationsFolder: resolve(process.cwd(), "drizzle") });
}
