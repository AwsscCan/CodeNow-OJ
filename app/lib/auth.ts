import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import {
  createD1Db,
  createLocalDb,
  type Database,
  type D1Binding,
} from "../../db/client";
import * as schema from "../../db/schema";
import { createAuthOptions } from "./auth-compat";
import { createEmailSender } from "./email";

type AuthEnvironment = {
  environment: "development" | "test" | "production";
  baseURL: string;
  secret: string;
  resendApiKey?: string;
  emailFrom?: string;
};

type AuthFactoryOptions = {
  db: Parameters<typeof drizzleAdapter>[0];
  env: AuthEnvironment;
  waitUntil?: (promise: Promise<unknown>) => void;
};

export function createAuth({ db, env, waitUntil }: AuthFactoryOptions) {
  const authOptions = createAuthOptions({ baseURL: env.baseURL, secret: env.secret });
  const sendEmail = createEmailSender({
    environment: env.environment,
    apiKey: env.resendApiKey,
    from: env.emailFrom,
  });

  const deliver = async (message: Parameters<typeof sendEmail>[0]) => {
    const delivery = sendEmail(message);
    if (waitUntil) {
      waitUntil(delivery);
      return;
    }
    await delivery;
  };

  return betterAuth({
    ...authOptions,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    user: {
      additionalFields: {
        mustChangePassword: { type: "boolean", input: false, defaultValue: false },
      },
    },
    trustedOrigins: [env.baseURL],
    plugins: [admin({
      defaultRole: "user",
      adminRoles: ["admin"],
      allowImpersonatingAdmins: false,
    })],
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }) => {
        await deliver({
          to: user.email,
          subject: "验证 CodeNow 邮箱",
          text: `请打开以下链接完成邮箱验证：${url}`,
        });
      },
    },
    emailAndPassword: {
      ...authOptions.emailAndPassword,
      sendResetPassword: async ({ user, url }) => {
        await deliver({
          to: user.email,
          subject: "重置 CodeNow 密码",
          text: `请打开以下链接重新设置密码：${url}`,
        });
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

type RuntimeBindings = {
  DB?: D1Binding;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  RESEND_API_KEY?: string;
  AUTH_EMAIL_FROM?: string;
  ADMIN_BOOTSTRAP_TOKEN?: string;
  VOICE_SERVICE_URL?: string;
  VOICE_SERVICE_TOKEN?: string;
};

type CloudflareRuntime = {
  env?: RuntimeBindings;
  waitUntil?: (promise: Promise<unknown>) => void;
};

export type VoiceService = { url: string; token: string };

export type RuntimeServices = {
  auth: Auth;
  db: Database;
  rateLimitPepper: string;
  credentialSecret: string;
  adminBootstrapToken?: string;
  voiceService?: VoiceService;
};

let localServices: RuntimeServices | null = null;

async function loadCloudflareRuntime(): Promise<CloudflareRuntime | null> {
  try {
    const moduleName = "cloudflare:workers";
    return await import(/* @vite-ignore */ moduleName) as CloudflareRuntime;
  } catch {
    return null;
  }
}

function runtimeEnvironment(): AuthEnvironment["environment"] {
  if (process.env.NODE_ENV === "production") return "production";
  if (process.env.NODE_ENV === "test") return "test";
  return "development";
}

function authEnvironment(request: Request, bindings: RuntimeBindings): AuthEnvironment {
  const environment = runtimeEnvironment();
  const secret = bindings.BETTER_AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!secret && environment === "production") {
    throw new Error("BETTER_AUTH_SECRET is required in production");
  }

  return {
    environment,
    baseURL: bindings.BETTER_AUTH_URL ?? process.env.BETTER_AUTH_URL ?? new URL(request.url).origin,
    secret: secret ?? "codenow-development-secret-change-me",
    resendApiKey: bindings.RESEND_API_KEY ?? process.env.RESEND_API_KEY,
    emailFrom: bindings.AUTH_EMAIL_FROM ?? process.env.AUTH_EMAIL_FROM,
  };
}

function voiceServiceEnvironment(bindings: RuntimeBindings): VoiceService | undefined {
  const url = bindings.VOICE_SERVICE_URL ?? process.env.VOICE_SERVICE_URL;
  const token = bindings.VOICE_SERVICE_TOKEN ?? process.env.VOICE_SERVICE_TOKEN;
  if (!url?.trim() || !token?.trim()) return undefined;
  return { url: url.trim(), token: token.trim() };
}

export function createLocalRuntimeServices(request: Request, filename: string): RuntimeServices {
  const absolutePath = resolve(filename);
  mkdirSync(dirname(absolutePath), { recursive: true });
  const db = createLocalDb(absolutePath);
  migrate(db, { migrationsFolder: "drizzle" });
  const env = authEnvironment(request, {});
  return {
    db,
    rateLimitPepper: env.secret,
    credentialSecret: env.secret,
    adminBootstrapToken: process.env.ADMIN_BOOTSTRAP_TOKEN,
    voiceService: voiceServiceEnvironment({}),
    auth: createAuth({ db, env }),
  };
}

export async function getRuntimeServices(request: Request): Promise<RuntimeServices> {
  const runtime = await loadCloudflareRuntime();
  const bindings = runtime?.env ?? {};
  const env = authEnvironment(request, bindings);

  if (bindings.DB) {
    const db = createD1Db(bindings.DB);
    return { db, rateLimitPepper: env.secret, credentialSecret: env.secret, adminBootstrapToken: bindings.ADMIN_BOOTSTRAP_TOKEN, voiceService: voiceServiceEnvironment(bindings), auth: createAuth({
      db,
      env,
      waitUntil: runtime?.waitUntil,
    }) };
  }

  if (!localServices) {
    const filename = process.env.CODEFORGE_LOCAL_DB_PATH ?? resolve(process.cwd(), ".data", "codenow.db");
    localServices = createLocalRuntimeServices(request, filename);
  }
  return localServices;
}

export async function getRuntimeAuth(request: Request): Promise<Auth> {
  return (await getRuntimeServices(request)).auth;
}
