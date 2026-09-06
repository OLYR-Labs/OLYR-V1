import { getDatabase } from "../database/database";
import { completeSale } from "./pos";
import { audit, requireSession } from "./auth";

export function completeMixedSale(input:any){
  const db=getDatabase();
  const payments=Array.isArray(input.payments)?input.payments:(typeof input.paymentDetails?.payments==="string"?JSON.parse(input.paymentDetails.payments):[]);
  if(!payments.length)throw new Error("Add at least one payment.");
  let total=Number(input.total);
  if(!Number.isFinite(total)||total<=0){const {userId}=requireSession(input.sessionId);const u=db.prepare("SELECT business_id FROM users WHERE id=?").get(userId) as any;const rows=(input.items||[]).map((i:any)=>db.prepare("SELECT selling_price FROM products WHERE id=? AND business_id=? AND active=1").get(i.productId,u.business_id) as any);const subtotal=rows.reduce((n:number,p:any,i:number)=>n+Number(p.selling_price)*Number(input.items[i].quantity),0);total=Math.max(0,subtotal-Math.min(subtotal,Number(input.discount)||0));}
  const paid=payments.reduce((n:any,p:any)=>n+Number(p.amount||0),0);if(Math.abs(paid-total)>0.01)throw new Error("Payment amounts must equal the total.");
  const cash=payments.filter((p:any)=>String(p.method).toUpperCase()==="CASH").reduce((n:number,p:any)=>n+Number(p.amount||0),0);
  const r=completeSale({...input,paymentMethod:"CASH",cashReceived:total});
  const {userId}=requireSession(input.sessionId);const details={payments:payments.map((p:any)=>({method:String(p.method).toUpperCase(),amount:Number(p.amount),details:p.details||{}}))};
  db.prepare("UPDATE sales SET payment_method='MIXED',cash_received=?,change_due=0,payment_details_json=? WHERE id=?").run(cash,JSON.stringify(details),r.saleId);
  audit(userId,"MIXED_PAYMENT","SALE",r.saleId,`Mixed payment total ${total}`);
  return {...r,paymentMethod:"MIXED",cashReceived:cash,changeDue:0};
}
