"use client";

import { useState } from "react";
import { authClient } from "../../lib/auth-client";
import { AuthForm } from "../auth-form";

const GENERIC_REGISTER_RESULT = "如果该邮箱可以注册，我们已发送验证邮件。";

export default function RegisterPage() {
  const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  return <AuthForm title="创建账户" description="验证邮箱后即可启用云端同步。" pending={pending} error={error} success={success} submitLabel="注册" onSubmit={async (event) => {
    event.preventDefault(); setPending(true); setError(""); setSuccess("");
    const form = new FormData(event.currentTarget); const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirmPassword") ?? "")) { setPending(false); return setError("两次输入的密码不一致"); }
    const result = await authClient.signUp.email({ name: String(form.get("name") ?? ""), email: String(form.get("email") ?? ""), password, callbackURL: "/library" });
    setPending(false); if (result.error) return setError(result.error.message || "注册请求失败，请稍后重试"); setSuccess(GENERIC_REGISTER_RESULT);
  }} footer={<span>已有账户？<a href="/login">返回登录</a></span>}>
    <label className="auth-field">昵称<input name="name" autoComplete="name" required maxLength={80} /></label>
    <label className="auth-field">邮箱<input name="email" type="email" autoComplete="email" required /></label>
    <label className="auth-field">密码<input name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></label>
    <label className="auth-field">确认密码<input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></label>
  </AuthForm>;
}
