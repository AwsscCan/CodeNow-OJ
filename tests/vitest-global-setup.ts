/* CodeNow OJ · 单元测试隔离数据库初始化 · Bamzc */

import { existsSync, rmSync } from "node:fs";
import { relative, resolve } from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

/** 单测隔离库路径，与开发库 .data/codenow.db 分离，避免测试污染本地数据 */
const TEST_DB_DIRECTORY = resolve(process.cwd(), ".data");
const TEST_DB_FILE_NAME = /^vitest-\d+\.db$/;

type VitestProject = {
  config: {
    env?: Record<string, string | undefined>;
  };
};

export function resolveTestDatabasePath(databasePath: string | undefined) {
  if (!databasePath) {
    throw new Error("Vitest must provide CODEFORGE_LOCAL_DB_PATH.");
  }

  const absolutePath = resolve(databasePath);
  const relativePath = relative(TEST_DB_DIRECTORY, absolutePath);

  if (!TEST_DB_FILE_NAME.test(relativePath)) {
    throw new Error(`Refusing to operate on non-test database path: ${absolutePath}`);
  }

  return absolutePath;
}

function removeTestDatabaseArtifacts(databasePath: string) {
  for (const suffix of ["", "-shm", "-wal"]) {
    const artifactPath = databasePath + suffix;
    if (existsSync(artifactPath)) {
      rmSync(artifactPath);
    }
  }
}

/**
 * 测试套件启动前：清掉旧隔离库并预跑迁移，
 * 使各并发 worker 打开的都是已迁移好的干净库，杜绝并发建表冲突。
 */
export default function setup(project: VitestProject) {
  const testDatabasePath = resolveTestDatabasePath(project.config.env?.CODEFORGE_LOCAL_DB_PATH);
  removeTestDatabaseArtifacts(testDatabasePath);

  const sqlite = new BetterSqlite3(testDatabasePath);
  try {
    migrate(drizzle(sqlite), { migrationsFolder: resolve(process.cwd(), "drizzle") });
  } catch (error) {
    sqlite.close();
    removeTestDatabaseArtifacts(testDatabasePath);
    throw error;
  }

  sqlite.close();
  return () => removeTestDatabaseArtifacts(testDatabasePath);
}
