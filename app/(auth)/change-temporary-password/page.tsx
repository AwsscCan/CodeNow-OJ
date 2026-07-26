"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthForm } from "../auth-form";

export default function ChangeTemporaryPasswordPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  return <AuthForm
    title="设置你的正式密码"
    description="临时密码只能用于首次登录。设置正式密码后，其他登录会话将失效。"
    pending={pending}
    error={error}
    submitLabel="完成账户设置"
    onSubmit={async (event) => {
      event.preventDefault();
      setError("");
      const form = new FormData(event.currentTarget);
      const currentPassword = String(form.get("currentPassword") ?? "");
      const newPassword = String(form.get("newPassword") ?? "");
      if (newPassword !== String(form.get("confirmPassword") ?? "")) {
        setError("两次输入的新密码不一致");
        return;
      }
      setPending(true);
      const response = await fetch("/api/account/complete-invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setPending(false);
      if (!response.ok) {
        const body = await response.json() as { error?: { message?: string } };
        setError(body.error?.message ?? "无法更新密码");
        return;
      }
      router.replace("/library");
    }}
  >
    <label className="auth-field">临时密码<input name="currentPassword" type="password" autoComplete="current-password" minLength={10} maxLength={128} required /></label>
    <label className="auth-field">新密码<input name="newPassword" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></label>
    <label className="auth-field">确认新密码<input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></label>
  </AuthForm>;
}

