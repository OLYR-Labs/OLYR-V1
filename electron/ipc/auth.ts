import { randomUUID } from "node:crypto";
import { getDatabase } from "../database/database";
import { verifyPassword } from "../security/password";
export interface LoginInput{email:string;password:string}
export interface AuthenticatedSession{sessionId:string;expiresAt:string;user:{id:string;name:string;email:string;role:string};business:{id:string;name:string;currency:string};store:{id:string;name:string;address:string}}
const sessions=new Map<string,{expiresAt:number;userId:string}>();
const SESSION_DURATION_MS=8*60*60*1000;
export function login(raw:LoginInput):AuthenticatedSession{
 const email=raw.email.trim().toLowerCase(); if(!email||!raw.password) throw new Error("Enter your email and password.");
 const row=getDatabase().prepare(`SELECT u.id user_id,u.name user_name,u.email user_email,u.role user_role,u.password_hash,u.password_salt,b.id business_id,b.name business_name,b.currency business_currency,s.id store_id,s.name store_name,s.address store_address FROM users u JOIN businesses b ON b.id=u.business_id JOIN stores s ON s.id=u.store_id WHERE lower(u.email)=? LIMIT 1`).get(email) as any;
 if(!row||!verifyPassword(raw.password,row.password_hash,row.password_salt)) throw new Error("The email or password is incorrect.");
 const expiresAt=Date.now()+SESSION_DURATION_MS,sessionId=randomUUID(); sessions.set(sessionId,{expiresAt,userId:row.user_id});
 audit(row.user_id,"LOGIN","USER",row.user_id,"Successful login");
 return {sessionId,expiresAt:new Date(expiresAt).toISOString(),user:{id:row.user_id,name:row.user_name,email:row.user_email,role:row.user_role},business:{id:row.business_id,name:row.business_name,currency:row.business_currency},store:{id:row.store_id,name:row.store_name,address:row.store_address}};
}
export function logout(id:string){const s=sessions.get(id);if(s){audit(s.userId,"LOGOUT","USER",s.userId,"Signed out");sessions.delete(id)}}
export function requireSession(id:string){const s=sessions.get(id);if(!s||s.expiresAt<=Date.now()){if(s)sessions.delete(id);throw new Error("Your session has expired. Please sign in again.")}return{userId:s.userId}}
export function audit(userId:string,action:string,entityType:string,entityId:string|null,details:string){getDatabase().prepare(`INSERT INTO audit_logs(id,user_id,action,entity_type,entity_id,details,created_at) VALUES(?,?,?,?,?,?,?)`).run(randomUUID(),userId,action,entityType,entityId,details,new Date().toISOString())}
