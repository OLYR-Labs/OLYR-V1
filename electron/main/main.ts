import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { getDatabase } from "../database/database";
import { completeSetup, getSetupStatus } from "../ipc/setup";

const isDevelopment = !app.isPackaged;

function registerIpc(): void {
  ipcMain.handle("setup:get-status", () => getSetupStatus());
  ipcMain.handle("setup:complete", (_event, input) => completeSetup(input));
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: "#f8fafc",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());

  if (isDevelopment) {
    void window.loadURL("http://127.0.0.1:5173");
  } else {
    void window.loadFile(path.join(__dirname, "../../dist/index.html"));
  }
}

app.whenReady().then(() => {
  getDatabase();
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
