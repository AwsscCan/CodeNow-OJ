import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function timestamp() { return new Date().toISOString().replace(/[:.]/g, "-"); }

async function defaultRun(command, args) {
  const executable = process.platform === "win32" && command === "npx" ? "npx.cmd" : command;
  await new Promise((resolveRun, reject) => {
    // Windows .cmd shims cannot be spawned with shell:false; keep Unix execution direct.
    const child = spawn(executable, args, { stdio: "inherit", shell: process.platform === "win32" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolveRun() : reject(new Error(`${command} exited with code ${code}`)));
  });
}

export async function smokeWorker(baseUrl) {
  if (!baseUrl) return false;
  const [home, registration, hiddenAdmin] = await Promise.all([
    fetch(new URL("/", baseUrl)),
    fetch(new URL("/api/auth/sign-up/email", baseUrl), {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "smoke@example.test", name: "Smoke", password: "Smoke-password-2026!" }),
    }),
    fetch(new URL("/api/admin/users", baseUrl)),
  ]);
  return home.ok && registration.status === 404 && hiddenAdmin.status === 404
    && /private/.test(hiddenAdmin.headers.get("cache-control") ?? "") && /no-store/.test(hiddenAdmin.headers.get("cache-control") ?? "");
}

/**
 * @param {{ target: string, run?: (command: string, args: string[]) => Promise<void>, smokePreview?: () => Promise<boolean>, smokeProduction?: () => Promise<boolean> }} options
 */
export async function releaseCloudflare({ target, run = defaultRun, smokePreview, smokeProduction }) {
  if (target !== "preview" && target !== "production") throw new Error("Target must be preview or production");
  const backup = (environment) => `backups/${timestamp()}-${environment}.sql`;
  const releaseEnvironment = async (environment) => {
    await run("npx", ["wrangler", "d1", "export", "DB", "--remote", "--env", environment, "--output", backup(environment)]);
    await run("npx", ["wrangler", "d1", "migrations", "apply", "DB", "--remote", "--env", environment]);
    await run("npx", ["wrangler", "deploy", "--env", environment]);
  };

  await run("node", ["scripts/validate-cloudflare-config.mjs"]);
  await releaseEnvironment("preview");
  const previewOk = await (smokePreview ?? (() => smokeWorker(process.env.ADMIN_BOOTSTRAP_URL_PREVIEW)))();
  if (!previewOk) throw new Error("Preview smoke gate failed; production was not changed");
  if (target === "preview") return;
  await releaseEnvironment("production");
  if (smokeProduction && !await smokeProduction()) throw new Error("Production smoke failed; retain the backup and roll back the Worker version");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  mkdirSync(resolve("backups"), { recursive: true });
  releaseCloudflare({ target: process.argv[2] }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
