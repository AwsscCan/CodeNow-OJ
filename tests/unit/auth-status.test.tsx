// @vitest-environment jsdom
/* eslint-disable import/order -- Vitest requires its environment directive before imports. */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { useSession, signOut, push, refresh } = vi.hoisted(() => ({
  useSession: vi.fn(),
  signOut: vi.fn(async () => ({})),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("../../app/lib/auth-client", () => ({
  authClient: { useSession, signOut },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/library",
  useRouter: () => ({ push, refresh }),
}));

import { AuthStatus } from "../../app/components/auth-status";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AuthStatus", () => {
  it("shows a return-aware login link for anonymous visitors", () => {
    useSession.mockReturnValue({ data: null, isPending: false });

    render(<AuthStatus onSignedOut={() => {}} />);

    expect(screen.getByRole("link", { name: "登录" }).getAttribute("href"))
      .toBe("/login?returnTo=%2Flibrary");
  });

  it("shows the user and signs out while clearing client state", async () => {
    const onSignedOut = vi.fn();
    useSession.mockReturnValue({
      data: { user: { name: "林然", email: "lin@example.com" } },
      isPending: false,
    });

    render(<AuthStatus onSignedOut={onSignedOut} />);
    expect(screen.getByText("林然", { selector: "b" })).toBeTruthy();
    expect(screen.getByText("林然", { selector: ".avatar" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
    await vi.waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(onSignedOut).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/");
  });

  it("shows the administrator link only to administrators", () => {
    useSession.mockReturnValue({
      data: { user: { name: "Owner", email: "owner@example.test", role: "admin" } },
      isPending: false,
    });
    const { rerender } = render(<AuthStatus onSignedOut={() => {}} />);
    expect(screen.getByRole("link", { name: "管理控制台" }).getAttribute("href")).toBe("/admin");

    useSession.mockReturnValue({
      data: { user: { name: "Friend", email: "friend@example.test", role: "user" } },
      isPending: false,
    });
    rerender(<AuthStatus onSignedOut={() => {}} />);
    expect(screen.queryByRole("link", { name: "管理控制台" })).toBeNull();
  });
});
