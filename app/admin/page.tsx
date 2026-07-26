"use client";

import Link from "next/link";
import { AdminDashboard } from "../components/admin/admin-dashboard";
import { authClient } from "../lib/auth-client";

export default function AdminPage() {
  const session = authClient.useSession();
  if (session.isPending) return <main className="admin-page"><p>正在验证管理员身份…</p></main>;
  if (session.data?.user?.role !== "admin") return null;

  return <main className="admin-page">
    <header className="admin-header"><div><small>CodeNow Private</small><h1>管理控制台</h1><p>邀请好友、管理会话与审查用户内容。</p></div><Link href="/">返回主页</Link></header>
    <AdminDashboard />
  </main>;
}
