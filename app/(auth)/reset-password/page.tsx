"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "../../lib/auth-client";
import { AuthForm } from "../auth-form";

export default function ResetPasswordPage() {
  const router = useRouter(); const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  return <AuthForm title="重新设置密码" description="设置一个 10–128 个字符的新密码。" pending={pending} error={error} success={success} submitLabel="更新密码" onSubmit={async (event) => {
    event.preventDefault(); setError(""); setSuccess(""); const token = new URLSearchParams(window.location.search).get("token");
    if (!token) return setError("重置链接无效或已过期"); const form = new FormData(event.currentTarget); const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirmPassword") ?? "")) return setError("两次输入的密码不一致"); setPending(true);
    const result = await authClient.resetPassword({ newPassword: password, token }); setPending(false);
    if (result.error) return setError(result.error.message || "重置链接无效或已过期"); setSuccess("密码已更新，即将返回登录页面。"); setTimeout(() => router.push("/login"), 800);
  }} footer={<a href="/login">返回登录</a>}>
    <label className="auth-field">新密码<input name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></label>
    <label className="auth-field">确认新密码<input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></label>
  </AuthForm>;
}
