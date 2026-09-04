import { describe, expect, it } from "vitest";
import { canManageBuiltinProblems } from "../../app/lib/problem-permissions";

describe("内置题权限", () => {
  it("仅管理员或明确的题库管理权限可以操作内置题", () => {
    expect(canManageBuiltinProblems(null)).toBe(false);
    expect(canManageBuiltinProblems({ role: "user" })).toBe(false);
    expect(canManageBuiltinProblems({ role: "admin" })).toBe(true);
    expect(canManageBuiltinProblems({ permissions: ["manage_builtin_problems"] })).toBe(true);
  });
});
