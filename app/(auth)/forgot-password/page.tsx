"use client";

import { useState } from "react";
import { authClient } from "../../lib/auth-client";
import { AuthForm } from "../auth-form";

const GENERIC_RESET_RESULT = "如果该账户存在，我们已发送密码重置邮件。";

export default function ForgotPasswordPage() {
  const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  return <AuthForm title="忘记密码" description="输入注册邮箱以获取一次性重置链接。" pending={pending} error={error} success={success} submitLabel="发送重置邮件" onSubmit={async (event) => {
    event.preventDefault(); setPending(true); setError(""); setSuccess(""); const form = new FormData(event.currentTarget);
    const result = await authClient.requestPasswordReset({ email: String(form.get("email") ?? ""), redirectTo: "/reset-password" });
    setPending(false); if (result.error) return setError("请求失败，请稍后重试"); setSuccess(GENERIC_RESET_RESULT);
  }} footer={<a href="/login">返回登录</a>}>
    <label className="auth-field">邮箱<input name="email" type="email" autoComplete="email" required /></label>
  </AuthForm>;
}
