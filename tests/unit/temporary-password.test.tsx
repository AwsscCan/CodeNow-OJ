// @vitest-environment jsdom
/* eslint-disable import/order -- Vitest environment directive and hoisted mocks must precede imports. */
import BetterSqlite3 from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { cleanup, render, waitFor } from "@testing-library/react";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { useSession, replace, usePathname } = vi.hoisted(() => ({
  useSession: vi.fn(),
  replace: vi.fn(),
  usePathname: vi.fn(() => "/library"),
}));

vi.mock("../../app/lib/auth-client", () => ({ authClient: { useSession } }));
vi.mock("next/navigation", () => ({ usePathname, useRouter: () => ({ replace }) }));

import { createInvitationCompletionHandlers } from "../../app/api/account/complete-invitation/route";
import { completeInvitationNavigation } from "../../app/(auth)/change-temporary-password/page";
import { InvitationPasswordGate } from "../../app/components/invitation-password-gate";
import { createMiddleware } from "../../app/middleware";
import { users } from "../../db/schema";
import * as schema from "../../db/schema";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("temporary password completion", () => {
  it("uses a full navigation so the forced-change session cache is discarded", () => {
    const replaceLocation = vi.fn();
    completeInvitationNavigation({ replace: replaceLocation });
    expect(replaceLocation).toHaveBeenCalledWith("/library");
  });

  it("changes the password, revokes other sessions, and clears the forced-change flag", async () => {
    const sqlite = new BetterSqlite3(":memory:");
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: "drizzle" });
    const now = new Date();
    db.insert(users).values({
      id: "invited-user", name: "Friend", email: "friend@example.test", emailVerified: true,
      mustChangePassword: true, createdAt: now, updatedAt: now,
    }).run();
    const changePassword = vi.fn(async () => new Response(JSON.stringify({ status: true }), {
      headers: { "Set-Cookie": "better-auth.session_token=new-session; Path=/; HttpOnly" },
    }));
    const handlers = createInvitationCompletionHandlers(async () => ({ userId: "invited-user", db, changePassword }));

    const response = await handlers.POST(new Request("http://localhost/api/account/complete-invitation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: "temporary-password", newPassword: "permanent-password-123" }),
    }));

    expect(response.status).toBe(200);
    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: "temporary-password", newPassword: "permanent-password-123", revokeOtherSessions: true,
    });
    expect(response.headers.get("set-cookie")).toContain("new-session");
    expect((await db.select().from(users).where(eq(users.id, "invited-user")))[0].mustChangePassword).toBe(false);
    sqlite.close();
  });

  it("redirects forced-change users away from private pages", async () => {
    useSession.mockReturnValue({
      data: { user: { id: "invited-user", mustChangePassword: true } },
      isPending: false,
    });
    render(<InvitationPasswordGate />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/change-temporary-password"));
  });

  it("does not redirect from the password completion page", () => {
    usePathname.mockReturnValue("/change-temporary-password");
    useSession.mockReturnValue({
      data: { user: { id: "invited-user", mustChangePassword: true } },
      isPending: false,
    });
    render(<InvitationPasswordGate />);
    expect(replace).not.toHaveBeenCalled();
  });

  it("blocks private APIs until the temporary password is replaced", async () => {
    const sqlite = new BetterSqlite3(":memory:");
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: "drizzle" });
    const now = new Date();
    db.insert(users).values({
      id: "invited-user", name: "Friend", email: "friend@example.test", emailVerified: true,
      mustChangePassword: true, createdAt: now, updatedAt: now,
    }).run();
    const middleware = createMiddleware(async () => ({
      auth: { api: { getSession: async () => ({ user: { id: "invited-user" } }) } },
      db,
      rateLimitPepper: "pepper",
    }), async () => null);

    expect((await middleware(new NextRequest("http://localhost/api/preferences"))).status).toBe(428);
    expect((await middleware(new NextRequest("http://localhost/api/account/complete-invitation", { method: "POST" }))).status).not.toBe(428);
    sqlite.close();
  });
});
