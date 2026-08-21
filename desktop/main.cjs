const { app, BrowserWindow, dialog, shell } = require("electron");
const { randomBytes } = require("node:crypto");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { startLocalServer } = require("./server.cjs");

let mainWindow;
let localServer;
let isQuitting = false;

function loadRuntimeSettings(userDataPath) {
  const settingsPath = join(userDataPath, "runtime-settings.json");

  if (existsSync(settingsPath)) {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    if (typeof settings.authSecret === "string" && settings.authSecret.length >= 32) return settings;
  }

  const settings = { authSecret: randomBytes(48).toString("base64url") };
  writeFileSync(settingsPath, JSON.stringify(settings), { encoding: "utf8", mode: 0o600 });
  return settings;
}

function createMainWindow(serverUrl) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(serverUrl)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(serverUrl)) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.loadURL(serverUrl);
}

function reportStartupFailure(error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  writeFileSync(join(app.getPath("userData"), "startup-error.log"), `${new Date().toISOString()}\n${message}\n`, "utf8");
  dialog.showErrorBox("CodeNow OJ 启动失败", message);
}

async function startApplication() {
  const userDataPath = app.getPath("userData");
  const dataPath = join(userDataPath, "data");
  mkdirSync(dataPath, { recursive: true });
  const settings = loadRuntimeSettings(userDataPath);

  localServer = await startLocalServer({
    projectRoot: app.isPackaged ? join(process.resourcesPath, "runtime") : app.getAppPath(),
    environment: {
      BETTER_AUTH_SECRET: settings.authSecret,
      CODEFORGE_LOCAL_DB_PATH: join(dataPath, "codenow.db"),
    },
  });

  createMainWindow(localServer.url);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId("com.bamzc.codenowoj");

  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(startApplication).catch((error) => {
    reportStartupFailure(error);
    app.quit();
  });

  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => {
    isQuitting = true;
    localServer?.stop();
  });

  app.on("browser-window-created", (_event, window) => {
    window.on("closed", () => {
      if (!isQuitting) mainWindow = undefined;
    });
  });
}
