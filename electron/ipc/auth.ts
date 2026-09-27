import { randomUUID } from "node:crypto";
import { getDatabase } from "../database/database";
import { verifyPassword } from "../security/password";
export interface LoginInput{email:string;password:string}
export interface AuthenticatedSession{sessionId:string;expiresAt:string;user:{id:string;name:string;email:string;role:string};business:{id:string;name:string;currency:string};store:{id:string;name:string;address:string};vertical:{id:string;locked:boolean}}
const sessions=new Map<string,{expiresAt:number;userId:string}>();
const SESSION_DURATION_MS=8*60*60*1000;
export function login(raw:LoginInput):AuthenticatedSession{
 const email=raw.email.trim().toLowerCase(); if(!email||!raw.password) throw new Error("Enter your email and password.");
 const row=getDatabase().prepare(`SELECT u.id user_id,u.name user_name,u.email user_email,u.role user_role,u.password_hash,u.password_salt,b.id business_id,b.name business_name,b.currency business_currency,b.vertical business_vertical,b.vertical_locked business_vertical_locked,s.id store_id,s.name store_name,s.address store_address FROM users u JOIN businesses b ON b.id=u.business_id JOIN stores s ON s.id=u.store_id WHERE lower(u.email)=? LIMIT 1`).get(email) as any;
 if(!row||!verifyPassword(raw.password,row.password_hash,row.password_salt)) throw new Error("The email or password is incorrect.");
 const expiresAt=Date.now()+SESSION_DURATION_MS,sessionId=randomUUID(); sessions.set(sessionId,{expiresAt,userId:row.user_id});
 audit(row.user_id,"LOGIN","USER",row.user_id,"Successful login");
 return {sessionId,expiresAt:new Date(expiresAt).toISOString(),user:{id:row.user_id,name:row.user_name,email:row.user_email,role:row.user_role},business:{id:row.business_id,name:row.business_name,currency:row.business_currency},store:{id:row.store_id,name:row.store_name,address:row.store_address},vertical:{id:String(row.business_vertical||"RETAIL"),locked:Boolean(row.business_vertical_locked??1)}};
}
export function logout(id:string){const s=sessions.get(id);if(s){audit(s.userId,"LOGOUT","USER",s.userId,"Signed out");sessions.delete(id)}}
export function requireSession(id:string){const s=sessions.get(id);if(!s||s.expiresAt<=Date.now()){if(s)sessions.delete(id);throw new Error("Your session has expired. Please sign in again.")}return{userId:s.userId}}
export function audit(userId:string,action:string,entityType:string,entityId:string|null,details:string){getDatabase().prepare(`INSERT INTO audit_logs(id,user_id,action,entity_type,entity_id,details,created_at) VALUES(?,?,?,?,?,?,?)`).run(randomUUID(),userId,action,entityType,entityId,details,new Date().toISOString())}

export function supportChangeVertical(sessionId:string,newVertical:string,supportKey:string){
 const {userId}=requireSession(sessionId); const db=getDatabase(); const expected=process.env.OLYR_SUPPORT_KEY;
 if(!expected||supportKey!==expected) throw new Error("Invalid OLYR support authorization.");
 const vertical=String(newVertical||"").trim().toUpperCase();
 if(!["RETAIL","RESTAURANT","PHARMACY","SUPERMARKET","WHOLESALE","FASHION","CUSTOM"].includes(vertical)) throw new Error("Unsupported business vertical.");
 const row=db.prepare("SELECT business_id FROM users WHERE id=?").get(userId) as any; if(!row) throw new Error("User account could not be found.");
 db.prepare("UPDATE businesses SET vertical=?,vertical_locked=1,updated_at=? WHERE id=?").run(vertical,new Date().toISOString(),row.business_id);
 audit(userId,"SUPPORT_VERTICAL_CHANGE","BUSINESS",row.business_id,vertical); return {vertical,locked:true};
}

export function demoLogin():AuthenticatedSession{
 const db=getDatabase(); let row=db.prepare("SELECT u.id user_id,u.name user_name,u.email user_email,u.role user_role,b.id business_id,b.name business_name,b.currency business_currency,b.vertical business_vertical,b.vertical_locked business_vertical_locked,s.id store_id,s.name store_name,s.address store_address FROM users u JOIN businesses b ON b.id=u.business_id JOIN stores s ON s.id=u.store_id WHERE b.is_demo=1 LIMIT 1").get() as any;
 if(!row){const now=new Date().toISOString(),businessId=randomUUID(),storeId=randomUUID(),userId=randomUUID(),{hash,salt}=hashPassword("demo");db.exec("BEGIN IMMEDIATE");try{db.prepare("INSERT INTO businesses(id,name,phone,currency,vertical,vertical_locked,is_demo,created_at,updated_at) VALUES(?,?,?,?,?,1,1,?,?)").run(businessId,"OLYR Demo Store",null,"LKR","RETAIL",now,now);db.prepare("INSERT INTO stores(id,business_id,name,address,created_at,updated_at) VALUES(?,?,?,?,?,?)").run(storeId,businessId,"Demo Counter","OLYR Demo",now,now);db.prepare("INSERT INTO users(id,business_id,store_id,name,email,role,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(userId,businessId,storeId,"Demo Cashier","demo@olyr.local","ADMINISTRATOR",hash,salt,now,now);const products=[["Demo Coca-Cola","DEMO-001",350,50,"Beverages"],["Demo Biscuit","DEMO-002",180,80,"Snacks"],["Demo Soap","DEMO-003",250,40,"Personal Care"],["Demo Rice 1kg","DEMO-004",420,60,"Grocery"]];for(const [name,sku,price,stock,cat] of products){const cid=randomUUID();db.prepare("INSERT INTO categories(id,business_id,name,created_at) VALUES(?,?,?,?)").run(cid,businessId,cat,now);db.prepare("INSERT INTO products(id,business_id,category_id,sku,barcode,name,cost_price,selling_price,stock,min_stock,unit,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run(randomUUID(),businessId,cid,sku,sku,name,Number(price)*.7,price,stock,5,"pcs",now,now)}db.exec("COMMIT")}catch(e){db.exec("ROLLBACK");throw e}row=db.prepare("SELECT u.id user_id,u.name user_name,u.email user_email,u.role user_role,b.id business_id,b.name business_name,b.currency business_currency,b.vertical business_vertical,b.vertical_locked business_vertical_locked,s.id store_id,s.name store_name,s.address store_address FROM users u JOIN businesses b ON b.id=u.business_id JOIN stores s ON s.id=u.store_id WHERE b.is_demo=1 LIMIT 1").get() as any;}
 const expiresAt=Date.now()+SESSION_DURATION_MS,sessionId=randomUUID();sessions.set(sessionId,{expiresAt,userId:row.user_id});audit(row.user_id,"DEMO_LOGIN","BUSINESS",row.business_id,"Demo mode");return {sessionId,expiresAt:new Date(expiresAt).toISOString(),user:{id:row.user_id,name:row.user_name,email:row.user_email,role:row.user_role},business:{id:row.business_id,name:row.business_name,currency:row.business_currency},store:{id:row.store_id,name:row.store_name,address:row.store_address},vertical:{id:String(row.business_vertical||"RETAIL"),locked:true}};
}
