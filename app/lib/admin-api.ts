export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  banned: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminContentType = "problem" | "draft" | "conversation";

export type AdminContentItem = {
  id: string;
  userId: string;
  title?: string;
  problemRef?: string;
  problemCode?: string;
  language?: string;
  deletedAt: string | null;
  updatedAt: string;
};

type Page<T> = { items: T[]; nextCursor: string | null };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? "管理员请求失败");
  return body as T;
}

export const AdminApi = {
  overview: () => requestJson<{ users: number; sessions: number; problems: number; submissions: number }>("/api/admin/overview"),
  listUsers: (cursor?: string | null) => requestJson<Page<AdminUser>>(`/api/admin/users?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),
  inviteUser: (input: { name: string; email: string }) => requestJson<{ user: AdminUser; temporaryPassword: string }>("/api/admin/users", {
    method: "POST", body: JSON.stringify(input),
  }),
  updateUser: (id: string, action: "ban" | "unban" | "reset-password", reason?: string) => requestJson<{ success?: true; temporaryPassword?: string }>(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: "PATCH", body: JSON.stringify(reason ? { action, reason } : { action }),
  }),
  revokeSessions: (id: string) => requestJson<{ success: true }>(`/api/admin/users/${encodeURIComponent(id)}/sessions`, { method: "DELETE" }),
  listAudit: (cursor?: string | null) => requestJson<Page<{
    id: string; adminUserId: string; action: string; targetType: string; targetId: string;
    requestId: string; createdAt: string;
  }>>(`/api/admin/audit?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),
  listContent: (type: AdminContentType, cursor?: string | null) => requestJson<Page<AdminContentItem>>(`/api/admin/content?type=${type}&limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),
  moderateContent: (type: AdminContentType, id: string, deleted: boolean) => requestJson<{ content: { id: string; deletedAt: string | null } }>(`/api/admin/content/${type}/${encodeURIComponent(id)}`, {
    method: "PATCH", body: JSON.stringify({ deleted }),
  }),
};
