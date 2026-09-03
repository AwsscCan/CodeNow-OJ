import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function timestamp() { return new Date().toISOString().replace(/[:.]/g, "-"); }

async function defaultRun(command, args) {
  const executable = process.platform === "win32" && ["npx", "npm"].includes(command) ? `${command}.cmd` : command;
  await new Promise((resolveRun, reject) => {
    // Windows .cmd shims cannot be spawned with shell:false; keep Unix execution direct.
    const child = spawn(executable, args, { stdio: "inherit", shell: process.platform === "win32" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolveRun() : reject(new Error(`${command} exited with code ${code}`)));
  });
}

async function smokeFetch(input, init) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await fetch(input, init); }
    catch (error) {
      lastError = error;
      await new Promise((resolveWait) => setTimeout(resolveWait, 1000 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function smokeWorker(baseUrl) {
  if (!baseUrl) return false;
  const [home, session, hiddenAdmin, aiSettings, aiModels, aiCcSwitch] = await Promise.all([
    smokeFetch(new URL("/", baseUrl)),
    smokeFetch(new URL("/api/auth/get-session", baseUrl)),
    smokeFetch(new URL("/api/admin/users", baseUrl)),
    smokeFetch(new URL("/api/ai-settings", baseUrl)),
    smokeFetch(new URL("/api/ai-settings/models", baseUrl), { method: "POST" }),
    smokeFetch(new URL("/api/ai-settings/ccswitch", baseUrl), { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
  ]);
  return home.ok && session.status === 200 && hiddenAdmin.status === 404
    && aiSettings.status === 401 && aiModels.status === 401 && aiCcSwitch.status === 401
    && /private/.test(hiddenAdmin.headers.get("cache-control") ?? "") && /no-store/.test(hiddenAdmin.headers.get("cache-control") ?? "");
}

function prepareDeployConfig() {
  const generatedPath = resolve("dist/server/wrangler.json");
  const generated = JSON.parse(readFileSync(generatedPath, "utf8"));
  const source = JSON.parse(readFileSync(resolve("wrangler.jsonc"), "utf8"));
  generated.name = source.name;
  generated.env = source.env;
  writeFileSync(generatedPath, `${JSON.stringify(generated)}\n`);
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
    await run("npx", ["wrangler", "deploy", "--config", "dist/server/wrangler.json", "--env", environment]);
  };

  await run("npm", ["run", "build"]);
  prepareDeployConfig();
  await run("node", ["scripts/validate-cloudflare-config.mjs"]);
  await releaseEnvironment("preview");
  const previewOk = await (smokePreview ?? (() => smokeWorker(process.env.ADMIN_BOOTSTRAP_URL_PREVIEW)))();
  if (!previewOk) throw new Error("Preview smoke gate failed; production was not changed");
  if (target === "preview") return;
  await releaseEnvironment("production");
  const productionOk = await (smokeProduction ?? (() => smokeWorker(process.env.ADMIN_BOOTSTRAP_URL_PRODUCTION)))();
  if (!productionOk) throw new Error("Production smoke failed; retain the backup and roll back the Worker version");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  mkdirSync(resolve("backups"), { recursive: true });
  releaseCloudflare({ target: process.argv[2] }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
