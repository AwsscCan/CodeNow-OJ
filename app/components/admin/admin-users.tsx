"use client";

import { useState, type FormEvent } from "react";
import { AdminApi, type AdminUser } from "../../lib/admin-api";

export function AdminUsers({ initialUsers }: { initialUsers: AdminUser[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState<AdminUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function invite(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const result = await AdminApi.inviteUser({ name, email });
      setUsers((current) => [...current, result.user]);
      setTemporaryPassword(result.temporaryPassword);
      setName("");
      setEmail("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "创建账户失败"); }
  }

  async function confirmBan() {
    if (!banTarget) return;
    try {
      await AdminApi.updateUser(banTarget.id, "ban", "管理员手动封禁");
      setUsers((current) => current.map((user) => user.id === banTarget.id ? { ...user, banned: true } : user));
      setBanTarget(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "封禁失败"); }
  }

  async function unban(user: AdminUser) {
    try {
      await AdminApi.updateUser(user.id, "unban");
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, banned: false } : item));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "解封失败"); }
  }

  return <section className="admin-panel" aria-labelledby="admin-users-title">
    <h2 id="admin-users-title">用户与邀请</h2>
    <form className="admin-invite" onSubmit={invite}>
      <label>好友名称<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>好友邮箱<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <button type="submit">创建邀请账户</button>
    </form>
    {error && <p className="admin-error" role="alert">{error}</p>}
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>用户</th><th>角色</th><th>首次改密</th><th>状态</th><th>操作</th></tr></thead>
      <tbody>{users.map((user) => <tr key={user.id}>
        <td><b>{user.name}</b><small>{user.email}</small></td><td>{user.role}</td>
        <td>{user.mustChangePassword ? "待完成" : "已完成"}</td><td>{user.banned ? "已封禁" : "正常"}</td>
        <td className="admin-actions">
          {user.banned ? <button type="button" onClick={() => void unban(user)}>解封</button> : <button type="button" className="danger" onClick={() => setBanTarget(user)}>封禁</button>}
          <button type="button" onClick={() => void AdminApi.revokeSessions(user.id)}>撤销会话</button>
        </td>
      </tr>)}</tbody>
    </table></div>
    {temporaryPassword && <div className="admin-dialog-backdrop"><div role="dialog" aria-label="一次性临时密码" className="admin-dialog">
      <h3>一次性临时密码</h3><p>请立即通过安全方式发送给好友。关闭后不会再次显示。</p>
      <code>{temporaryPassword}</code><button type="button" onClick={() => setTemporaryPassword(null)}>我已保存，关闭</button>
    </div></div>}
    {banTarget && <div className="admin-dialog-backdrop"><div role="dialog" aria-label="确认封禁用户" className="admin-dialog">
      <h3>确认封禁用户</h3><p>将封禁 {banTarget.email} 并阻止其继续访问。</p>
      <div className="admin-dialog-actions"><button type="button" onClick={() => setBanTarget(null)}>取消</button><button type="button" className="danger" onClick={() => void confirmBan()}>确认封禁</button></div>
    </div></div>}
  </section>;
}
