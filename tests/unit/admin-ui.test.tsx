// @vitest-environment jsdom
/* eslint-disable import/order -- Vitest environment directive and hoisted mocks must precede imports. */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { useSession, listUsers, inviteUser, updateUser, revokeSessions, overview, listAudit, listContent, moderateContent } = vi.hoisted(() => ({
  useSession: vi.fn(),
  listUsers: vi.fn(),
  inviteUser: vi.fn(),
  updateUser: vi.fn(),
  revokeSessions: vi.fn(),
  overview: vi.fn(),
  listAudit: vi.fn(),
  listContent: vi.fn(),
  moderateContent: vi.fn(),
}));

vi.mock("../../app/lib/auth-client", () => ({ authClient: { useSession } }));
vi.mock("../../app/lib/admin-api", () => ({
  AdminApi: { listUsers, inviteUser, updateUser, revokeSessions, overview, listAudit, listContent, moderateContent },
}));

import AdminPage from "../../app/admin/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function setupApi() {
  overview.mockResolvedValue({ users: 2, sessions: 1, problems: 1, submissions: 0 });
  listUsers.mockResolvedValue({ items: [{
    id: "user-a", name: "Friend", email: "friend@example.test", role: "user", banned: false,
    mustChangePassword: true, createdAt: "now", updatedAt: "now",
  }], nextCursor: null });
  listAudit.mockResolvedValue({ items: [{
    id: "audit-a", adminUserId: "admin-a", action: "user.invite", targetType: "user",
    targetId: "user-a", requestId: "request-a", createdAt: "now", metadataJson: "secret-content",
  }], nextCursor: null });
  listContent.mockResolvedValue({ items: [{
    id: "problem-a", userId: "user-a", title: "示例题目", deletedAt: null, updatedAt: "now",
  }], nextCursor: null });
}

function renderAdmin() {
  setupApi();
  useSession.mockReturnValue({ data: { user: { id: "admin-a", role: "admin" } }, isPending: false });
  render(<AdminPage />);
}

describe("administrator interface", () => {
  it("renders nothing for a normal user", () => {
    useSession.mockReturnValue({ data: { user: { id: "user-a", role: "user" } }, isPending: false });
    render(<AdminPage />);
    expect(screen.queryByText("管理控制台")).toBeNull();
  });

  it("invites a user and clears the one-time password when dismissed", async () => {
    renderAdmin();
    inviteUser.mockResolvedValue({
      user: { id: "user-b", name: "New Friend", email: "new@example.test" },
      temporaryPassword: "Temporary_password_1234567890",
    });
    await screen.findByText("friend@example.test");

    fireEvent.change(screen.getByLabelText("好友名称"), { target: { value: "New Friend" } });
    fireEvent.change(screen.getByLabelText("好友邮箱"), { target: { value: "new@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "创建邀请账户" }));

    expect(await screen.findByText("Temporary_password_1234567890")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "我已保存，关闭" }));
    await waitFor(() => expect(screen.queryByText("Temporary_password_1234567890")).toBeNull());
  });

  it("requires confirmation before banning a user", async () => {
    renderAdmin();
    updateUser.mockResolvedValue({ success: true });
    await screen.findByText("friend@example.test");
    fireEvent.click(screen.getByRole("button", { name: "封禁" }));
    expect(screen.getByRole("dialog", { name: "确认封禁用户" })).toBeTruthy();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("soft-deletes and restores content after explicit confirmation", async () => {
    renderAdmin();
    moderateContent.mockResolvedValue({ content: { id: "problem-a", deletedAt: "now" } });
    await screen.findByText("示例题目");
    fireEvent.click(screen.getByRole("button", { name: "软删除" }));
    expect(screen.getByRole("dialog", { name: "确认软删除内容" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确认软删除" }));
    await waitFor(() => expect(moderateContent).toHaveBeenCalledWith("problem", "problem-a", true));

    fireEvent.click(await screen.findByRole("button", { name: "恢复" }));
    await waitFor(() => expect(moderateContent).toHaveBeenCalledWith("problem", "problem-a", false));
  });

  it("renders only the allowlisted audit fields", async () => {
    renderAdmin();
    expect(await screen.findByText("user.invite")).toBeTruthy();
    expect(screen.queryByText("secret-content")).toBeNull();
  });
});
