import { app,BrowserWindow,ipcMain } from "electron";
import path from "node:path";
import { getDatabase } from "../database/database";
import { login,logout } from "../ipc/auth";
import { completeSetup,getSetupStatus } from "../ipc/setup";
import { dashboard,listProducts,createProduct,startShift,currentShift,closeShift,completeSale,salesHistory,inventory,profitReport,createCustomer,customers } from "../ipc/pos";
import { hardwareStatus,configureHardware,openCashDrawer,testPrinter } from "../ipc/hardware";
const isDevelopment=!app.isPackaged;
function registerIpc(){
 ipcMain.handle("setup:get-status",()=>getSetupStatus()); ipcMain.handle("setup:complete",(_e,input)=>completeSetup(input));
 ipcMain.handle("auth:login",(_e,input)=>login(input)); ipcMain.handle("auth:logout",(_e,id:string)=>logout(id));
 ipcMain.handle("pos:dashboard",(_e,id:string)=>dashboard(id)); ipcMain.handle("pos:products",(_e,id:string,q?:string)=>listProducts(id,q));
 ipcMain.handle("pos:create-product",(_e,input)=>createProduct(input)); ipcMain.handle("pos:start-shift",(_e,id:string,c:number)=>startShift(id,c)); ipcMain.handle("pos:current-shift",(_e,id:string)=>currentShift(id)); ipcMain.handle("pos:close-shift",(_e,id:string,c:number)=>closeShift(id,c));
 ipcMain.handle("pos:complete-sale",(_e,input)=>completeSale(input)); ipcMain.handle("pos:sales",(_e,id:string)=>salesHistory(id)); ipcMain.handle("pos:inventory",(_e,id:string)=>inventory(id)); ipcMain.handle("pos:profit",(_e,id:string)=>profitReport(id));
 ipcMain.handle("pos:create-customer",(_e,input)=>createCustomer(input.sessionId,input)); ipcMain.handle("pos:customers",(_e,id:string)=>customers(id));
 ipcMain.handle("hardware:status",(_e,id:string)=>hardwareStatus(id)); ipcMain.handle("hardware:configure",(_e,input)=>configureHardware(input.sessionId,input)); ipcMain.handle("hardware:open-drawer",(_e,id:string)=>openCashDrawer(id)); ipcMain.handle("hardware:test-printer",(_e,id:string)=>testPrinter(id));
}
function createWindow(){const w=new BrowserWindow({width:1440,height:900,minWidth:1100,minHeight:700,show:false,backgroundColor:"#f7f9fc",webPreferences:{preload:path.join(__dirname,"../preload/preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:true}});w.once("ready-to-show",()=>w.show());if(isDevelopment)void w.loadURL("http://127.0.0.1:5173");else void w.loadFile(path.join(__dirname,"../../dist/index.html"))}
app.whenReady().then(()=>{getDatabase();registerIpc();createWindow();app.on("activate",()=>{if(!BrowserWindow.getAllWindows().length)createWindow()})});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit()});
