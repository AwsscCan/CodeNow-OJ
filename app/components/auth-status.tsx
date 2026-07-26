"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "../lib/auth-client";

function avatarText(name: string, email: string) {
  const source = name.trim() || email.split("@")[0] || "?";
  return Array.from(source).slice(0, 2).join("").toUpperCase();
}

export function AuthStatus({ onSignedOut }: { onSignedOut: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = authClient.useSession();

  if (session.isPending) return <span className="auth-status-loading">正在读取账户…</span>;

  const user = session.data?.user;
  if (!user) {
    const returnTo = pathname || "/";
    return (
      <Link className="header-login" aria-label="登录" href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>
        <span aria-hidden="true">✦</span>登录
      </Link>
    );
  }

  return (
    <div className="auth-status">
      <span className="avatar">{avatarText(user.name, user.email)}</span>
      <div className="user-copy"><b>{user.name || user.email}</b><small>{user.email}</small></div>
      {user.role === "admin" && <Link className="admin-link" href="/admin">管理控制台</Link>}
      <button type="button" onClick={async () => {
        await authClient.signOut();
        onSignedOut();
        router.push("/");
        router.refresh();
      }}>退出登录</button>
    </div>
  );
}
