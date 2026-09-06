import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("olyr", {
  app: {
    name: "OLYR POS",
  },
});
