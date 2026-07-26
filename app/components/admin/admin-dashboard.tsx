"use client";

import { useEffect, useState } from "react";
import { AdminApi, type AdminContentItem, type AdminUser } from "../../lib/admin-api";
import { AdminContent } from "./admin-content";
import { AdminUsers } from "./admin-users";

type Overview = Awaited<ReturnType<typeof AdminApi.overview>>;
type Audit = Awaited<ReturnType<typeof AdminApi.listAudit>>["items"];

export function AdminDashboard() {
  const [data, setData] = useState<{ overview: Overview; users: AdminUser[]; content: AdminContentItem[]; audit: Audit } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([AdminApi.overview(), AdminApi.listUsers(), AdminApi.listContent("problem"), AdminApi.listAudit()])
      .then(([overview, users, content, audit]) => {
        if (active) setData({ overview, users: users.items, content: content.items, audit: audit.items });
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "管理数据加载失败"); });
    return () => { active = false; };
  }, []);

  if (error) return <p className="admin-error" role="alert">{error}</p>;
  if (!data) return <p className="admin-loading">正在读取管理数据…</p>;

  return <>
    <div className="admin-metrics">
      <span><b>{data.overview.users}</b>用户</span><span><b>{data.overview.sessions}</b>会话</span>
      <span><b>{data.overview.problems}</b>题目</span><span><b>{data.overview.submissions}</b>提交</span>
    </div>
    <AdminUsers initialUsers={data.users} />
    <AdminContent initialItems={data.content} />
    <section className="admin-panel" aria-labelledby="admin-audit-title"><h2 id="admin-audit-title">审计记录</h2>
      <ul className="admin-audit-list">{data.audit.map((entry) => <li key={entry.id}>
        <b>{entry.action}</b><span>{entry.targetType} / {entry.targetId}</span><small>{entry.createdAt}</small>
      </li>)}</ul>
    </section>
  </>;
}
