type PermissionUser = {
  role?: unknown;
  permissions?: unknown;
  canManageProblems?: unknown;
  canManageBuiltinProblems?: unknown;
};

/** 内置题属于产品内容，只允许管理员或被授予题库管理权限的账号修改/删除。 */
export function canManageBuiltinProblems(user: unknown): boolean {
  if (!user || typeof user !== "object") return false;
  const account = user as PermissionUser;
  if (account.role === "admin" || account.canManageProblems === true || account.canManageBuiltinProblems === true) return true;
  if (!Array.isArray(account.permissions)) return false;
  return account.permissions.some((permission) => permission === "manage_problems" || permission === "manage_builtin_problems" || permission === "problems:manage");
}
