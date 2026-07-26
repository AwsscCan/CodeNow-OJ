import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { hashPassword } from "better-auth/crypto";
import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const targets = new Set(["local", "preview", "production"]);
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

export function parseBootstrapArguments(argv) {
  const result = { target: "local", name: "管理员", email: "", confirmProduction: false, url: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--confirm-production") { result.confirmProduction = true; continue; }
    if (["--target", "--name", "--email", "--url"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      result[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    if (/token|password/i.test(argument)) throw new Error("Tokens and passwords must not be command-line arguments");
    throw new Error(`Unknown argument: ${argument}`);
  }
  if (!targets.has(result.target)) throw new Error("--target must be local, preview, or production");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new Error("--email is required and must be valid");
  if (!result.name.trim() || result.name.length > 100) throw new Error("--name must be between 1 and 100 characters");
  if (result.target === "production" && !result.confirmProduction) throw new Error("Production requires --confirm-production");
  return result;
}

function temporaryPassword() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => alphabet[byte & 63]).join("");
}

export async function bootstrapLocal({ email, name, databasePath = process.env.CODEFORGE_LOCAL_DB_PATH ?? ".data/codenow.db" }) {
  const filename = resolve(databasePath);
  mkdirSync(dirname(filename), { recursive: true });
  const sqlite = new BetterSqlite3(filename);
  try {
    migrate(drizzle(sqlite), { migrationsFolder: resolve("drizzle") });
    if (sqlite.prepare("select id from user where role = 'admin' limit 1").get()) return { alreadyExists: true };
    const normalizedEmail = email.trim().toLowerCase();
    const password = temporaryPassword();
    const passwordHash = await hashPassword(password);
    const userId = crypto.randomUUID();
    const accountId = crypto.randomUUID();
    const now = Date.now();
    try {
      sqlite.transaction(() => {
        sqlite.prepare("insert into user (id,name,email,email_verified,role,banned,must_change_password,created_at,updated_at) values (?,?,?,?,?,?,?,?,?)")
          .run(userId, name.trim(), normalizedEmail, 1, "admin", 0, 1, now, now);
        sqlite.prepare("insert into account (id,account_id,provider_id,user_id,password,created_at,updated_at) values (?,?,?,?,?,?,?)")
          .run(accountId, userId, "credential", userId, passwordHash, now, now);
        sqlite.prepare("insert into admin_audit_logs (id,admin_user_id,action,target_type,target_id,request_id,metadata_json,created_at) values (?,?,?,?,?,?,?,?)")
          .run("initial-admin-bootstrap", userId, "user.role_change", "user", userId, "initial-admin-bootstrap", "{}", now);
      })();
    } catch (cause) {
      if (sqlite.prepare("select id from user where role = 'admin' limit 1").get()) return { alreadyExists: true };
      throw cause;
    }
    return { alreadyExists: false, user: { id: userId, email: normalizedEmail, name: name.trim() }, temporaryPassword: password };
  } finally { sqlite.close(); }
}

async function bootstrapRemote(options) {
  const envName = `ADMIN_BOOTSTRAP_URL_${options.target.toUpperCase()}`;
  const baseUrl = options.url || process.env[envName];
  const token = process.env.ADMIN_BOOTSTRAP_TOKEN;
  if (!baseUrl) throw new Error(`Set ${envName} or pass --url`);
  if (!token) throw new Error("ADMIN_BOOTSTRAP_TOKEN must be provided through the environment");
  const response = await fetch(new URL("/api/internal/bootstrap-admin", baseUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ email: options.email, name: options.name }),
  });
  const body = await response.json();
  if (response.status === 409 && body?.alreadyExists) return body;
  if (!response.ok) throw new Error(body?.error?.message ?? `Bootstrap failed with HTTP ${response.status}`);
  return body;
}

export async function runBootstrap(argv) {
  const options = parseBootstrapArguments(argv);
  const result = options.target === "local" ? await bootstrapLocal(options) : await bootstrapRemote(options);
  const { temporaryPassword: password, ...safeResult } = result;
  process.stdout.write(`${JSON.stringify({ target: options.target, ...safeResult })}\n`);
  if (password) process.stderr.write(`一次性临时密码：${password}\n`);
  return safeResult;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runBootstrap(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
