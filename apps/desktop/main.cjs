const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

app.setName("Steward");
let window;

function configPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function readServerUrl() {
  if (process.env.TIMECLOCK_SERVER_URL) return process.env.TIMECLOCK_SERVER_URL;
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf8")).serverUrl;
  } catch {
    return "";
  }
}

function validServerUrl(value) {
  try {
    const url = new URL(value);
    if (!url.hostname) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function showSettings(error = "") {
  const query = new URLSearchParams({ current: readServerUrl(), error });
  window.loadFile(path.join(__dirname, "settings.html"), { query: Object.fromEntries(query) });
}

function ownerPortalUrl(serverUrl) {
  const url = new URL(serverUrl);
  url.pathname = "/admin";
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function loadSteward() {
  const serverUrl = readServerUrl();
  if (!validServerUrl(serverUrl)) {
    showSettings();
    return;
  }
  try {
    await window.loadURL(ownerPortalUrl(serverUrl));
  } catch {
    showSettings("Steward could not reach that service. Check the address and network, then try again.");
  }
}

function createWindow() {
  window = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 760,
    minHeight: 600,
    backgroundColor: "#f1f2e9",
    title: "Steward",
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, destination) => {
    const configured = readServerUrl();
    if (configured && destination.startsWith(new URL(configured).origin)) return;
    if (destination.startsWith("file:")) return;
    event.preventDefault();
    void shell.openExternal(destination);
  });

  const menu = Menu.buildFromTemplate([
    {
      label: "Steward",
      submenu: [
        { label: "Reload", accelerator: "CmdOrCtrl+R", click: () => loadSteward() },
        { label: "Connection settings", click: () => showSettings() },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
  ]);
  Menu.setApplicationMenu(menu);
  void loadSteward();
}

ipcMain.handle("save-server-url", async (_event, value) => {
  const serverUrl = String(value).trim().replace(/\/$/, "");
  if (!validServerUrl(serverUrl)) {
    return { ok: false, error: "Use an HTTPS address. HTTP is allowed only for localhost." };
  }
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify({ serverUrl }, null, 2), { mode: 0o600 });
  await loadSteward();
  return { ok: true };
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
