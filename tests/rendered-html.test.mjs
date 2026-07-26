import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(import.meta.dirname, "..");

async function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`production server exited with ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch { /* server is still starting */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("production server did not become ready within 15 seconds");
}

test("production HTML hydrates from reachable client assets on Windows", async () => {
  const port = await freePort();
  const cli = resolve(projectRoot, "node_modules/vinext/dist/cli.js");
  const child = spawn(process.execPath, [cli, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let logs = "";
  child.stdout.on("data", (chunk) => { logs += chunk; });
  child.stderr.on("data", (chunk) => { logs += chunk; });

  try {
    const response = await waitForServer(`http://127.0.0.1:${port}/problem/P1001`, child);
    assert.match(response.headers.get("content-type") || "", /^text\/html/i);
    const html = await response.text();
    assert.match(html, /<title>CodeNow OJ/);
    assert.match(html, /测试点/);
    assert.ok(!/file:\/\/\/|url\((?:['"])?[A-Za-z]:\//.test(html), "SSR HTML must not reference local filesystem paths (fonts/assets)");

    const assetPath = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0];
    assert.ok(assetPath, "SSR HTML must reference the hydration entry asset");
    const asset = await fetch(`http://127.0.0.1:${port}${assetPath}`);
    assert.equal(asset.status, 200, `hydration asset must be reachable; server logs:\n${logs}`);
    assert.match(asset.headers.get("content-type") || "", /javascript/);
    assert.ok((await asset.text()).length > 1_000, "hydration asset must not be an empty fallback");

    for (const [path, label] of [
      ["/login", "登录 CodeNow"],
      ["/register", "创建账户"],
      ["/forgot-password", "忘记密码"],
      ["/reset-password?token=test", "重新设置密码"],
    ]) {
      const authResponse = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(authResponse.status, 200, `${path} must render; server logs:\n${logs}`);
      assert.match(await authResponse.text(), new RegExp(label));
    }
  } finally {
    child.kill();
    await Promise.race([
      new Promise((resolveExit) => child.once("exit", resolveExit)),
      new Promise((resolveWait) => setTimeout(resolveWait, 2_000)),
    ]);
  }
});
