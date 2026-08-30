const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nansheDesktop", {
  saveServerUrl: (value) => ipcRenderer.invoke("save-server-url", value),
});
