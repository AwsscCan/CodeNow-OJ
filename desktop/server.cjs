const { spawn } = require("node:child_process");
const { createServer } = require("node:net");
const { join } = require("node:path");

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
  });
}

function waitForServer(url, child, getError, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    let timer;

    const finish = (callback, value) => {
      clearTimeout(timer);
      child.removeListener("exit", onExit);
      callback(value);
    };

    const onExit = (code, signal) => {
      const details = getError();
      finish(reject, new Error(`内置服务启动失败（code=${code ?? "null"}, signal=${signal ?? "null"}）${details ? `：${details}` : ""}`));
    };

    const probe = async () => {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1_500) });
        if (response.status < 500) {
          finish(resolve);
          return;
        }
      } catch {
        // 服务尚未监听时继续探测。
      }

      if (Date.now() >= deadline) {
        finish(reject, new Error(`内置服务在 ${timeoutMs / 1_000} 秒内未就绪${getError() ? `：${getError()}` : ""}`));
        return;
      }

      timer = setTimeout(probe, 200);
    };

    child.once("exit", onExit);
    probe();
  });
}

async function startLocalServer({ projectRoot, environment }) {
  const port = await reserveLoopbackPort();
  const url = `http://127.0.0.1:${port}`;
  const cliPath = join(projectRoot, "node_modules", "vinext", "dist", "cli.js");
  let stderr = "";
  const child = spawn(process.execPath, [cliPath, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: projectRoot,
    env: {
      ...process.env,
      ...environment,
      BETTER_AUTH_URL: url,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });

  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-3_000);
  });

  await waitForServer(url, child, () => stderr.trim());

  return {
    url,
    stop() {
      if (!child.killed && child.exitCode === null) child.kill();
    },
  };
}

module.exports = { startLocalServer };
