"use client";

import Link from "next/link";
import type { FormEventHandler, ReactNode } from "react";

type AuthFormProps = {
  title: string;
  description: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
  pending: boolean;
  error: string;
  success?: string;
  submitLabel: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthForm(props: AuthFormProps) {
  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={props.onSubmit}>
        <Link className="auth-brand" href="/">CodeNow <em>OJ</em></Link>
        <h1>{props.title}</h1>
        <p>{props.description}</p>
        {props.children}
        {props.error && <div className="auth-error" role="alert">{props.error}</div>}
        {props.success && <div className="auth-success" role="status">{props.success}</div>}
        <button className="auth-submit" disabled={props.pending} type="submit">
          {props.pending ? "请稍候…" : props.submitLabel}
        </button>
        {props.footer && <div className="auth-footer">{props.footer}</div>}
      </form>
    </main>
  );
}
