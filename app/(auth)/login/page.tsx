"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "../../lib/auth-client";
import { AuthForm } from "../auth-form";

function safeReturnTo(): string {
  const raw = new URLSearchParams(window.location.search).get("returnTo") ?? "/library";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/library";
  const target = new URL(raw, window.location.origin);
  return target.origin === window.location.origin
    ? `${target.pathname}${target.search}${target.hash}`
    : "/library";
}

export default function LoginPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  return <AuthForm title="登录 CodeNow" description="登录后跨设备同步题目、测试点和代码。" pending={pending} error={error} submitLabel="登录" onSubmit={async (event) => {
    event.preventDefault(); setPending(true); setError("");
    const form = new FormData(event.currentTarget);
    const result = await authClient.signIn.email({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      rememberMe: form.get("rememberMe") === "on",
    });
    setPending(false);
    if (result.error) return setError(result.error.message || "登录失败，请检查邮箱和密码");
    router.push(safeReturnTo()); router.refresh();
  }} footer={<><a href="/forgot-password">忘记密码</a><span>没有账户？<a href="/register">创建账户</a></span></>}>
    <label className="auth-field">邮箱<input name="email" type="email" autoComplete="email" required /></label>
    <label className="auth-field">密码<input name="password" type="password" autoComplete="current-password" minLength={10} required /></label>
    <label className="auth-check"><input name="rememberMe" type="checkbox" defaultChecked />记住我</label>
  </AuthForm>;
}
