import BetterSqlite3 from "better-sqlite3";
import { drizzle as drizzleBetterSqlite3 } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import * as schema from "./schema";

export type D1Binding = Parameters<typeof drizzleD1>[0];

export function createD1Db(binding: D1Binding) {
  return drizzleD1(binding, { schema });
}

export function createLocalDb(filename: string) {
  return drizzleBetterSqlite3(new BetterSqlite3(filename), { schema });
}

export type Database = ReturnType<typeof createD1Db> | ReturnType<typeof createLocalDb>;
