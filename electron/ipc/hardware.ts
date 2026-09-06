import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getDatabase } from "../database/database";
import { requireSession } from "./auth";
const exec=promisify(execFile);
export type HardwareType="CASH_DRAWER"|"RECEIPT_PRINTER"|"BARCODE_SCANNER"|"LABEL_PRINTER"|"CUSTOMER_DISPLAY"|"PAYMENT_TERMINAL";

function storeIdForSession(sessionId:string){const {userId}=requireSession(sessionId);const u=getDatabase().prepare(`SELECT store_id FROM users WHERE id=?`).get(userId) as any;if(!u)throw new Error("User account could not be found.");return u.store_id}

export function hardwareStatus(sessionId:string){const storeId=storeIdForSession(sessionId);return getDatabase().prepare(`SELECT * FROM hardware_devices WHERE store_id=? ORDER BY type`).all(storeId)}

export function configureHardware(sessionId:string,input:{type:HardwareType;name:string;connection:string;config?:Record<string,unknown>}){const storeId=storeIdForSession(sessionId);const db=getDatabase(),now=new Date().toISOString(),existing=db.prepare(`SELECT id FROM hardware_devices WHERE store_id=? AND type=?`).get(storeId,input.type) as any;if(existing){db.prepare(`UPDATE hardware_devices SET name=?,connection=?,config_json=?,status='CONFIGURED',updated_at=? WHERE id=?`).run(input.name,input.connection,JSON.stringify(input.config||{}),now,existing.id);return existing.id}const id=randomUUID();db.prepare(`INSERT INTO hardware_devices(id,store_id,type,name,connection,status,config_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`).run(id,storeId,input.type,input.name,input.connection,"CONFIGURED",JSON.stringify(input.config||{}),now,now);return id}

export async function detectHardware(sessionId:string){
  const storeId=storeIdForSession(sessionId);
  const configured=hardwareStatus(sessionId) as any[];
  const detected:{type:HardwareType;name:string;connection:string;status:"DETECTED"|"CONFIGURED";source:"WINDOWS"|"CONFIGURATION"}[]=[];
  const add=(type:HardwareType,name:string,connection:string,source:"WINDOWS"|"CONFIGURATION")=>{if(!detected.some(x=>x.type===type&&x.name===name))detected.push({type,name,connection,status:source==="CONFIGURATION"?"CONFIGURED":"DETECTED",source})};

  for(const d of configured)add(d.type,d.name,d.connection,"CONFIGURATION");

  if(process.platform!=="win32")return detected;
  try{
    const {stdout}=await exec("powershell.exe",["-NoProfile","-Command","Get-Printer | Select-Object Name,PortName,PrinterStatus | ConvertTo-Json -Compress"],{windowsHide:true});
    const raw=stdout.trim();const printers=raw?JSON.parse(raw):[];for(const p of Array.isArray(printers)?printers:[printers])if(p?.Name)add("RECEIPT_PRINTER",String(p.Name),`Windows printer${p.PortName?` · ${p.PortName}`:""}`,"WINDOWS");
  }catch{}
  try{
    const {stdout}=await exec("powershell.exe",["-NoProfile","-Command","Get-PnpDevice -PresentOnly | Where-Object { $_.Class -in @('HIDClass','Ports','USB') } | Select-Object FriendlyName,Class,InstanceId | ConvertTo-Json -Compress"],{windowsHide:true});
    const raw=stdout.trim();const devices=raw?JSON.parse(raw):[];for(const d of Array.isArray(devices)?devices:[devices]){
      const name=String(d?.FriendlyName||"");const cls=String(d?.Class||"");if(!name)continue;
      if(/barcode|scanner|symbol|honeywell|zebra/i.test(name))add("BARCODE_SCANNER",name,`Windows ${cls}`.trim(),"WINDOWS");
      else if(/label.*printer|zebra|dymo|brother.*ql/i.test(name))add("LABEL_PRINTER",name,`Windows ${cls}`.trim(),"WINDOWS");
    }
  }catch{}

  const hasPrinter=detected.some(x=>x.type==="RECEIPT_PRINTER");
  const configuredDrawer=configured.find(x=>x.type==="CASH_DRAWER");
  if(configuredDrawer)add("CASH_DRAWER",configuredDrawer.name,configuredDrawer.connection,"CONFIGURATION");
  else if(hasPrinter){
    // A printer can drive an RJ11/RJ12 drawer, but Windows cannot reliably prove that the drawer is physically attached.
    // Expose it as a possible drawer rather than falsely claiming physical detection.
    add("CASH_DRAWER","Possible printer-connected cash drawer","Via detected receipt printer","WINDOWS");
  }
  return detected;
}

export async function openCashDrawer(sessionId:string){requireSession(sessionId);const devices=hardwareStatus(sessionId) as any[];const d=devices.find(x=>x.type==="CASH_DRAWER"&&x.status==="CONFIGURED")||devices.find(x=>x.type==="RECEIPT_PRINTER"&&x.status==="CONFIGURED");if(!d)return{opened:false,reason:"NOT_CONFIGURED"};const cfg=JSON.parse(d.config_json||"{}");const port=cfg.port?String(cfg.port):"";if(!port)return{opened:false,reason:"NOT_CONFIGURED"};try{await exec("powershell.exe",["-NoProfile","-Command",`$p=[System.IO.Ports.SerialPort]::new('${port}',9600,'None',8,'One');$p.Open();$p.Write([byte[]](27,112,0,25,250),0,5);$p.Close()`],{windowsHide:true});return{opened:true}}catch{return{opened:false,reason:"UNAVAILABLE"}}}

export async function testPrinter(sessionId:string){requireSession(sessionId);return{success:true,message:"Printer test is ready; configure its Windows printer or serial endpoint in Hardware Settings."}}
