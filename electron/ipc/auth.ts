import { randomUUID } from "node:crypto";
import { getDatabase } from "../database/database";
import { hashPassword, verifyPassword } from "../security/password";
export interface LoginInput{email:string;password:string}
export interface AuthenticatedSession{sessionId:string;expiresAt:string;demo:boolean;user:{id:string;name:string;email:string;role:string};business:{id:string;name:string;currency:string};store:{id:string;name:string;address:string};vertical:{id:string;locked:boolean}}
const sessions=new Map<string,{expiresAt:number;userId:string;demo:boolean}>();
const SESSION_DURATION_MS=8*60*60*1000;
const DEMO_SESSION_DURATION_MS=30*60*1000;
export function login(raw:LoginInput):AuthenticatedSession{
 const email=raw.email.trim().toLowerCase(); if(!email||!raw.password) throw new Error("Enter your email and password.");
 const row=getDatabase().prepare(`SELECT u.id user_id,u.name user_name,u.email user_email,u.role user_role,u.password_hash,u.password_salt,b.id business_id,b.name business_name,b.currency business_currency,b.vertical business_vertical,b.vertical_locked business_vertical_locked,s.id store_id,s.name store_name,s.address store_address FROM users u JOIN businesses b ON b.id=u.business_id JOIN stores s ON s.id=u.store_id WHERE lower(u.email)=? LIMIT 1`).get(email) as any;
 if(!row||!verifyPassword(raw.password,row.password_hash,row.password_salt)) throw new Error("The email or password is incorrect.");
 const expiresAt=Date.now()+SESSION_DURATION_MS,sessionId=randomUUID(); sessions.set(sessionId,{expiresAt,userId:row.user_id,demo:false});
 audit(row.user_id,"LOGIN","USER",row.user_id,"Successful login");
 return {sessionId,expiresAt:new Date(expiresAt).toISOString(),demo:false,user:{id:row.user_id,name:row.user_name,email:row.user_email,role:row.user_role},business:{id:row.business_id,name:row.business_name,currency:row.business_currency},store:{id:row.store_id,name:row.store_name,address:row.store_address},vertical:{id:String(row.business_vertical||"RETAIL"),locked:Boolean(row.business_vertical_locked??1)}};
}
export function logout(id:string){const s=sessions.get(id);if(s){audit(s.userId,"LOGOUT","USER",s.userId,"Signed out");sessions.delete(id)}}
export function requireSession(id:string){const s=sessions.get(id);if(!s||s.expiresAt<=Date.now()){if(s)sessions.delete(id);throw new Error("Your session has expired. Please sign in again.")}return{userId:s.userId,demo:s.demo}}
export function assertNotDemo(sessionId:string,action:string){const {demo}=requireSession(sessionId);if(demo)throw new Error(`Demo mode: ${action} is disabled. Use the sample checkout and industry workspace to explore OLYR POS.`)}
export function audit(userId:string,action:string,entityType:string,entityId:string|null,details:string){getDatabase().prepare(`INSERT INTO audit_logs(id,user_id,action,entity_type,entity_id,details,created_at) VALUES(?,?,?,?,?,?,?)`).run(randomUUID(),userId,action,entityType,entityId,details,new Date().toISOString())}

export function supportChangeVertical(sessionId:string,newVertical:string,supportKey:string){
 const {userId,demo}=requireSession(sessionId); if(demo) throw new Error("Demo mode: platform changes are disabled."); const db=getDatabase(); const expected=process.env.OLYR_SUPPORT_KEY;
 if(!expected||supportKey!==expected) throw new Error("Invalid OLYR support authorization.");
 const vertical=String(newVertical||"").trim().toUpperCase();
 if(!["RETAIL","RESTAURANT","PHARMACY","SUPERMARKET","WHOLESALE","FASHION","CUSTOM"].includes(vertical)) throw new Error("Unsupported business vertical.");
 const row=db.prepare("SELECT business_id FROM users WHERE id=?").get(userId) as any; if(!row) throw new Error("User account could not be found.");
 db.prepare("UPDATE businesses SET vertical=?,vertical_locked=1,updated_at=? WHERE id=?").run(vertical,new Date().toISOString(),row.business_id);
 audit(userId,"SUPPORT_VERTICAL_CHANGE","BUSINESS",row.business_id,vertical); return {vertical,locked:true};
}

export function demoLogin(requestedVertical="RETAIL"):AuthenticatedSession{
 const db=getDatabase();
 const allowed=["RETAIL","RESTAURANT","PHARMACY","SUPERMARKET","WHOLESALE","FASHION","CUSTOM"];
 const vertical=String(requestedVertical||"RETAIL").trim().toUpperCase();
 if(!allowed.includes(vertical)) throw new Error("Unsupported demo industry.");

 const demoProfiles:Record<string,{business:string;store:string;categories:Array<[string,string,number,number]>}>={
  RETAIL:{business:"OLYR Demo · Retail",store:"Retail Demo Counter",categories:[["Coca-Cola 1.5L","Beverages",350,50],["Cream Crackers","Snacks",280,60],["Bath Soap","Personal Care",220,40],["Rice 5kg","Grocery",1250,30]]},
  RESTAURANT:{business:"OLYR Demo · Restaurant",store:"Restaurant Demo Counter",categories:[["Chicken Fried Rice","Main Course",950,30],["Kottu Roti","Main Course",850,35],["Fresh Lime","Beverages",350,50],["Chocolate Brownie","Desserts",450,25]]},
  PHARMACY:{business:"OLYR Demo · Pharmacy",store:"Pharmacy Demo Counter",categories:[["Paracetamol 500mg","Medicine",180,100],["Vitamin C 500mg","Vitamins",650,60],["Cetirizine 10mg","Medicine",320,50],["Digital Thermometer","Medical Devices",1850,15]]},
  SUPERMARKET:{business:"OLYR Demo · Supermarket",store:"Supermarket Demo Counter",categories:[["Milk Powder 1kg","Dairy",1850,80],["Wheat Flour 1kg","Grocery",320,120],["Sunflower Oil 1L","Grocery",620,90],["Laundry Powder 1kg","Household",780,70]]},
  WHOLESALE:{business:"OLYR Demo · Wholesale",store:"Wholesale Demo Counter",categories:[["Bottled Water Case","Beverages",2400,100],["Soft Drink Case","Beverages",5200,70],["Biscuit Carton","Snacks",4800,45],["Rice 25kg","Grocery",6900,35]]},
  FASHION:{business:"OLYR Demo · Fashion",store:"Fashion Demo Counter",categories:[["Classic T-Shirt","Tops",2200,40],["Slim Fit Jeans","Bottoms",6500,25],["Casual Dress","Dresses",5800,20],["Canvas Sneakers","Footwear",7200,18]]},
  CUSTOM:{business:"OLYR Demo · Custom Business",store:"Custom Demo Counter",categories:[["Sample Product A","General",1000,25],["Sample Product B","General",1500,20],["Sample Product C","General",2200,15],["Sample Product D","General",3000,10]]}
 };
 const profile=demoProfiles[vertical];

 let row=db.prepare("SELECT u.id user_id,u.name user_name,u.email user_email,u.role user_role,b.id business_id,b.name business_name,b.currency business_currency,b.vertical business_vertical,b.vertical_locked business_vertical_locked,s.id store_id,s.name store_name,s.address store_address FROM users u JOIN businesses b ON b.id=u.business_id JOIN stores s ON s.id=u.store_id WHERE b.is_demo=1 AND b.vertical=? LIMIT 1").get(vertical) as any;

 if(!row){
  const now=new Date().toISOString(),businessId=randomUUID(),storeId=randomUUID(),userId=randomUUID(),{hash,salt}=hashPassword("demo");
  db.exec("BEGIN IMMEDIATE");
  try{
   db.prepare("INSERT INTO businesses(id,name,phone,currency,vertical,vertical_locked,is_demo,created_at,updated_at) VALUES(?,?,?,?,?,1,1,?,?)").run(businessId,profile.business,null,"LKR",vertical,now,now);
   db.prepare("INSERT INTO stores(id,business_id,name,address,created_at,updated_at) VALUES(?,?,?,?,?,?)").run(storeId,businessId,profile.store,"OLYR Demo",now,now);
   db.prepare("INSERT INTO users(id,business_id,store_id,name,email,role,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(userId,businessId,storeId,"Demo User",`demo+${vertical.toLowerCase()}@olyr.local`,"ADMINISTRATOR",hash,salt,now,now);
   for(const [name,cat,price,stock] of profile.categories){
    const cid=randomUUID();
    db.prepare("INSERT INTO categories(id,business_id,name,created_at) VALUES(?,?,?,?)").run(cid,businessId,cat,now);
    const sku=`DEMO-${vertical}-${name.replace(/[^A-Z0-9]+/gi,"-").replace(/^-|-$/g,"").slice(0,18).toUpperCase()}`;
    db.prepare("INSERT INTO products(id,business_id,category_id,sku,barcode,name,cost_price,selling_price,stock,min_stock,unit,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run(randomUUID(),businessId,cid,sku,sku,name,Number(price)*.7,price,stock,5,"pcs",now,now);
   }
   db.exec("COMMIT");
  }catch(e){db.exec("ROLLBACK");throw e}
  row=db.prepare("SELECT u.id user_id,u.name user_name,u.email user_email,u.role user_role,b.id business_id,b.name business_name,b.currency business_currency,b.vertical business_vertical,b.vertical_locked business_vertical_locked,s.id store_id,s.name store_name,s.address store_address FROM users u JOIN businesses b ON b.id=u.business_id JOIN stores s ON s.id=u.store_id WHERE b.is_demo=1 AND b.vertical=? LIMIT 1").get(vertical) as any;
 }
 const expiresAt=Date.now()+DEMO_SESSION_DURATION_MS,sessionId=randomUUID();
 sessions.set(sessionId,{expiresAt,userId:row.user_id,demo:true});
 const register=db.prepare("SELECT id FROM cash_registers WHERE store_id=? LIMIT 1").get(row.store_id) as any;
 if(!register)db.prepare("INSERT INTO cash_registers(id,store_id,name,created_at) VALUES(?,?,?,?)").run(randomUUID(),row.store_id,"Demo Register",new Date().toISOString());
 const registerId=(db.prepare("SELECT id FROM cash_registers WHERE store_id=? LIMIT 1").get(row.store_id) as any).id;
 const openShift=db.prepare("SELECT id FROM shifts WHERE register_id=? AND status='OPEN' LIMIT 1").get(registerId) as any;
 if(!openShift)db.prepare("INSERT INTO shifts(id,register_id,user_id,opening_cash,opened_at,status) VALUES(?,?,?,?,?,?)").run(randomUUID(),registerId,row.user_id,10000,new Date().toISOString(),"OPEN");
 audit(row.user_id,"DEMO_LOGIN","BUSINESS",row.business_id,`Demo mode · ${vertical}`);
 return {sessionId,expiresAt:new Date(expiresAt).toISOString(),demo:true,user:{id:row.user_id,name:row.user_name,email:row.user_email,role:row.user_role},business:{id:row.business_id,name:row.business_name,currency:row.business_currency},store:{id:row.store_id,name:row.store_name,address:row.store_address},vertical:{id:String(row.business_vertical||vertical),locked:true}};
}
