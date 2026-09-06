import { getDatabase } from "../database/database";
import { completeSale } from "./pos";
import { audit, requireSession } from "./auth";

export function completeMixedSale(input:any){
  if(!Array.isArray(input.payments)||!input.payments.length)throw new Error("Add at least one payment.");
  const total=Number(input.total);const paid=input.payments.reduce((n:any,p:any)=>n+Number(p.amount||0),0);if(!Number.isFinite(total)||Math.abs(paid-total)>0.01)throw new Error("Payment amounts must equal the total.");
  const cash= input.payments.filter((p:any)=>String(p.method).toUpperCase()==="CASH").reduce((n:number,p:any)=>n+Number(p.amount||0),0);
  const r=completeSale({...input,paymentMethod:"CASH",cashReceived:total});
  const {userId}=requireSession(input.sessionId);const db=getDatabase();const details={payments:input.payments.map((p:any)=>({method:String(p.method).toUpperCase(),amount:Number(p.amount),details:p.details||{}}))};
  db.prepare("UPDATE sales SET payment_method='MIXED',cash_received=?,change_due=0,payment_details_json=? WHERE id=?").run(cash,JSON.stringify(details),r.saleId);
  audit(userId,"MIXED_PAYMENT","SALE",r.saleId,`Mixed payment total ${total}`);
  return {...r,paymentMethod:"MIXED",cashReceived:cash,changeDue:0};
}
