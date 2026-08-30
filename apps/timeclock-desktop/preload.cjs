const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("timeclockDesktop", {
  saveServerUrl: (value) => ipcRenderer.invoke("save-server-url", value),
});
