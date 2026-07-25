"use client";

import { useState } from "react";
import { authClient } from "../../lib/auth-client";
import { AuthForm } from "../auth-form";

export default function VerifyEmailPage() {
  const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  return <AuthForm title="验证邮箱" description="打开邮件中的链接完成验证，未收到时可重新发送。" pending={pending} error={error} success={success} submitLabel="重新发送验证邮件" onSubmit={async (event) => {
    event.preventDefault(); setPending(true); setError(""); setSuccess(""); const form = new FormData(event.currentTarget);
    const result = await authClient.sendVerificationEmail({ email: String(form.get("email") ?? ""), callbackURL: "/library" });
    setPending(false); if (result.error) return setError("发送失败，请稍后重试"); setSuccess("如果该账户存在，验证邮件已重新发送。");
  }} footer={<a href="/login">返回登录</a>}>
    <label className="auth-field">邮箱<input name="email" type="email" autoComplete="email" required /></label>
  </AuthForm>;
}
