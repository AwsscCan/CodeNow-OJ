"use client";

import { useState } from "react";
import { AdminApi, type AdminContentItem, type AdminContentType } from "../../lib/admin-api";

export function AdminContent({ initialItems }: { initialItems: AdminContentItem[] }) {
  const [type, setType] = useState<AdminContentType>("problem");
  const [items, setItems] = useState(initialItems);
  const [deleteTarget, setDeleteTarget] = useState<AdminContentItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function changeType(nextType: AdminContentType) {
    setType(nextType);
    try { setItems((await AdminApi.listContent(nextType)).items); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "读取内容失败"); }
  }

  async function setDeleted(item: AdminContentItem, deleted: boolean) {
    try {
      const result = await AdminApi.moderateContent(type, item.id, deleted);
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, deletedAt: result.content.deletedAt } : entry));
      setDeleteTarget(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "内容操作失败"); }
  }

  return <section className="admin-panel" aria-labelledby="admin-content-title">
    <div className="admin-panel-heading"><h2 id="admin-content-title">用户内容</h2><label>内容类型<select value={type} onChange={(event) => void changeType(event.target.value as AdminContentType)}>
      <option value="problem">题目</option><option value="draft">草稿</option><option value="conversation">AI 会话</option>
    </select></label></div>
    {error && <p className="admin-error" role="alert">{error}</p>}
    <ul className="admin-content-list">{items.map((item) => <li key={item.id}>
      <div><b>{item.title || item.problemRef || item.problemCode || item.id}</b><small>所有者：{item.userId}</small></div>
      {item.deletedAt ? <button type="button" onClick={() => void setDeleted(item, false)}>恢复</button> : <button type="button" className="danger" onClick={() => setDeleteTarget(item)}>软删除</button>}
    </li>)}</ul>
    {deleteTarget && <div className="admin-dialog-backdrop"><div role="dialog" aria-label="确认软删除内容" className="admin-dialog">
      <h3>确认软删除内容</h3><p>内容将对普通用户隐藏，但管理员仍可恢复。</p>
      <div className="admin-dialog-actions"><button type="button" onClick={() => setDeleteTarget(null)}>取消</button><button type="button" className="danger" onClick={() => void setDeleted(deleteTarget, true)}>确认软删除</button></div>
    </div></div>}
  </section>;
}
