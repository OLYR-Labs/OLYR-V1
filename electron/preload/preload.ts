import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("olyr", {
  app: {
    name: "OLYR POS",
  },
  setup: {
    getStatus: () => ipcRenderer.invoke("setup:get-status"),
    complete: (input: SetupInput) => ipcRenderer.invoke("setup:complete", input),
  },
});

interface SetupInput {
  businessName: string;
  businessPhone: string;
  currency: string;
  storeName: string;
  storeAddress: string;
  adminName: string;
  adminEmail: string;
  password: string;
}
