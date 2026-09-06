import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("olyr", {
  app: { name: "OLYR POS" },
  setup: {
    getStatus: () => ipcRenderer.invoke("setup:get-status"),
    complete: (input: SetupInput) => ipcRenderer.invoke("setup:complete", input),
  },
  auth: {
    login: (input: LoginInput) => ipcRenderer.invoke("auth:login", input),
    logout: (sessionId: string) => ipcRenderer.invoke("auth:logout", sessionId),
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

interface LoginInput { email: string; password: string; }
