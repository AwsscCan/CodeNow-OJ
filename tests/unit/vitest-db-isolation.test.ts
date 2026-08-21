import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../../vitest.config";
import * as globalSetup from "../vitest-global-setup";

type DatabasePathResolver = (databasePath: string | undefined) => string;

describe("Vitest database isolation", () => {
  it("assigns the current process a dedicated test database", () => {
    const databasePath = config.test?.env?.CODEFORGE_LOCAL_DB_PATH;

    expect(databasePath).toBe(resolve(process.cwd(), ".data", `vitest-${process.pid}.db`));
    expect(databasePath).not.toBe(resolve(process.cwd(), ".data", "codenow.db"));
  });

  it("limits cleanup to owned process-named databases", () => {
    const resolver = Reflect.get(globalSetup, "resolveTestDatabasePath");

    expect(resolver).toBeTypeOf("function");
    if (typeof resolver !== "function") return;

    const resolveTestDatabasePath = resolver as DatabasePathResolver;
    const ownedDatabase = resolve(process.cwd(), ".data", "vitest-12345.db");

    expect(resolveTestDatabasePath(ownedDatabase)).toBe(ownedDatabase);
    expect(() => resolveTestDatabasePath(resolve(process.cwd(), ".data", "codenow.db"))).toThrow();
    expect(() => resolveTestDatabasePath(resolve(process.cwd(), "outside-test.db"))).toThrow();
  });
});
