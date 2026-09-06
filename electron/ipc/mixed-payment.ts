import { getDatabase } from "../database/database";
import { completeSale } from "./pos";
import { audit, requireSession } from "./auth";

const paymentMethods=["CASH","CARD","QR","BANK_TRANSFER"];

export function completeMixedSale(input:any){
  const db=getDatabase();
  const payments=Array.isArray(input.payments)
    ? input.payments
    : typeof input.paymentDetails?.payments==="string"
      ? JSON.parse(input.paymentDetails.payments)
      : [];
  if(!Array.isArray(payments)||!payments.length)throw new Error("Add at least one payment.");

  const normalized=payments.map((p:any)=>{
    const method=String(p.method||"").toUpperCase();
    const amount=Number(p.amount);
    if(!paymentMethods.includes(method))throw new Error("Select a valid payment method for every split payment.");
    if(!Number.isFinite(amount)||amount<=0)throw new Error("Every split payment must have a valid amount.");
    return {method,amount,details:p.details||{}};
  });

  let total=Number(input.total);
  if(!Number.isFinite(total)||total<0){
    const {userId}=requireSession(input.sessionId);
    const u=db.prepare("SELECT business_id FROM users WHERE id=?").get(userId) as any;
    if(!u)throw new Error("User account could not be found.");
    const items=Array.isArray(input.items)?input.items:[];
    if(!items.length)throw new Error("Add at least one product to the sale.");
    const rows=items.map((i:any)=>{
      const p=db.prepare("SELECT selling_price FROM products WHERE id=? AND business_id=? AND active=1").get(i.productId,u.business_id) as any;
      if(!p)throw new Error("One of the products is no longer available.");
      const quantity=Number(i.quantity);
      if(!Number.isFinite(quantity)||quantity<=0)throw new Error("Sale quantity must be greater than zero.");
      return {price:Number(p.selling_price),quantity};
    });
    const subtotal=rows.reduce((n:number,p:any)=>n+p.price*p.quantity,0);
    const discount=Math.min(subtotal,Math.max(0,Number(input.discount)||0));
    total=Math.max(0,subtotal-discount);
  }

  const paid=normalized.reduce((n,p)=>n+p.amount,0);
  if(Math.abs(paid-total)>0.01)throw new Error("Payment amounts must equal the total.");

  const cash=normalized.filter(p=>p.method==="CASH").reduce((n,p)=>n+p.amount,0);
  const r=completeSale({...input,paymentMethod:"CASH",cashReceived:total,paymentDetails:{}});
  const details={payments:normalized};
  db.prepare("UPDATE sales SET payment_method='MIXED',cash_received=?,change_due=0,payment_details_json=? WHERE id=?").run(cash,JSON.stringify(details),r.saleId);
  audit(r.saleId?requireSession(input.sessionId).userId:"","MIXED_PAYMENT","SALE",r.saleId,`Mixed payment total ${total}`);
  return {...r,paymentMethod:"MIXED",cashReceived:cash,changeDue:0};
}
