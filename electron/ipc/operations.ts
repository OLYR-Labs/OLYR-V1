import { randomUUID } from "node:crypto";
import { getDatabase } from "../database/database";
import { audit, requireSession } from "./auth";

const ctx=(sessionId:string)=>{const {userId}=requireSession(sessionId);const db=getDatabase();const u=db.prepare("SELECT business_id,store_id,role FROM users WHERE id=?").get(userId) as any;if(!u)throw new Error("User account could not be found.");return {userId,businessId:u.business_id,storeId:u.store_id,role:String(u.role||"").toUpperCase(),db}};
const manager=(role:string)=>["ADMINISTRATOR","ADMIN","MANAGER","OWNER"].includes(role);

export function splitSalePayments(sessionId:string,saleId:string,payments:{method:string;amount:number;details?:Record<string,string>}[]){
  const c=ctx(sessionId);if(!payments.length)throw new Error("Add at least one payment.");
  const sale=c.db.prepare("SELECT * FROM sales WHERE id=? AND store_id=? AND status='COMPLETED'").get(saleId,c.storeId) as any;if(!sale)throw new Error("Sale not found.");
  const total=payments.reduce((n,p)=>n+Number(p.amount||0),0);if(Math.abs(total-Number(sale.total))>0.01)throw new Error("Payment amounts must equal the sale total.");
  c.db.prepare("UPDATE sales SET payment_method='MIXED',payment_details_json=? WHERE id=?").run(JSON.stringify(payments.map(p=>({method:p.method,amount:Number(p.amount),details:p.details||{}}))),saleId);
  audit(c.userId,"SPLIT_PAYMENT","SALE",saleId,`Mixed payment total ${total}`);return{success:true};
}

export function cashMovement(sessionId:string,type:"CASH_IN"|"CASH_OUT",amount:number,reason:string){
  const c=ctx(sessionId);const sh=c.db.prepare("SELECT id FROM shifts WHERE user_id=? AND status='OPEN' ORDER BY opened_at DESC LIMIT 1").get(c.userId) as any;if(!sh)throw new Error("Start your shift before recording cash movement.");
  const value=Number(amount);if(!Number.isFinite(value)||value<=0)throw new Error("Enter a valid amount.");if(!reason.trim())throw new Error("Enter a reason.");
  const id=randomUUID();c.db.prepare("INSERT INTO cash_movements(id,store_id,shift_id,user_id,type,amount,reason,created_at) VALUES(?,?,?,?,?,?,?,?)").run(id,c.storeId,sh.id,c.userId,type,value,reason.trim(),new Date().toISOString());audit(c.userId,type,"CASH_MOVEMENT",id,`${value}: ${reason}`);return{id};
}

export function cashMovements(sessionId:string){const c=ctx(sessionId);return c.db.prepare("SELECT * FROM cash_movements WHERE store_id=? ORDER BY created_at DESC LIMIT 200").all(c.storeId)}

export function voidSale(sessionId:string,saleId:string,reason:string){
  const c=ctx(sessionId);if(!manager(c.role))throw new Error("Manager approval is required to void a completed sale.");
  const sale=c.db.prepare("SELECT * FROM sales WHERE id=? AND store_id=? AND status='COMPLETED'").get(saleId,c.storeId) as any;if(!sale)throw new Error("Completed sale not found.");
  if(!reason.trim())throw new Error("Enter a void reason.");
  const items=c.db.prepare("SELECT * FROM sale_items WHERE sale_id=?").all(saleId) as any[];const now=new Date().toISOString();c.db.exec("BEGIN IMMEDIATE");try{c.db.prepare("UPDATE sales SET status='VOID' WHERE id=?").run(saleId);for(const i of items){c.db.prepare("UPDATE products SET stock=stock+?,updated_at=? WHERE id=?").run(i.quantity,now,i.product_id);c.db.prepare("INSERT INTO inventory_movements(id,product_id,user_id,type,quantity,reference_id,reason,created_at) VALUES(?,?,?,?,?,?,?,?)").run(randomUUID(),i.product_id,c.userId,"VOID",i.quantity,saleId,reason.trim(),now)}c.db.exec("COMMIT");audit(c.userId,"VOID_SALE","SALE",saleId,reason.trim());return{success:true}}catch(e){c.db.exec("ROLLBACK");throw e}}

export function returnSale(sessionId:string,saleId:string,items:{productId:string;quantity:number}[],reason:string){
  const c=ctx(sessionId);if(!manager(c.role))throw new Error("Manager approval is required for returns.");if(!items.length)throw new Error("Select at least one item to return.");
  const sale=c.db.prepare("SELECT * FROM sales WHERE id=? AND store_id=? AND status='COMPLETED'").get(saleId,c.storeId) as any;if(!sale)throw new Error("Completed sale not found.");
  const original=c.db.prepare("SELECT product_id,quantity,unit_price FROM sale_items WHERE sale_id=?").all(saleId) as any[];let total=0;const rows=items.map(i=>{const o=original.find(x=>x.product_id===i.productId);if(!o||Number(i.quantity)<=0||Number(i.quantity)>Number(o.quantity))throw new Error("Return quantity exceeds the sold quantity.");total+=Number(i.quantity)*Number(o.unit_price);return{...i,price:Number(o.unit_price)}});
  const id=randomUUID(),now=new Date().toISOString();c.db.exec("BEGIN IMMEDIATE");try{c.db.prepare("INSERT INTO returns(id,sale_id,user_id,total,reason,created_at) VALUES(?,?,?,?,?,?)").run(id,saleId,c.userId,total,reason?.trim()||null,now);for(const i of rows){c.db.prepare("INSERT INTO return_items(id,return_id,product_id,quantity,unit_price,line_total) VALUES(?,?,?,?,?,?)").run(randomUUID(),id,i.productId,i.quantity,i.price,i.quantity*i.price);c.db.prepare("UPDATE products SET stock=stock+?,updated_at=? WHERE id=?").run(i.quantity,now,i.productId);c.db.prepare("INSERT INTO inventory_movements(id,product_id,user_id,type,quantity,reference_id,reason,created_at) VALUES(?,?,?,?,?,?,?,?)").run(randomUUID(),i.productId,c.userId,"RETURN",i.quantity,id,reason?.trim()||"Sale return",now)}c.db.exec("COMMIT");audit(c.userId,"RETURN_SALE","SALE",saleId,`Return ${id}, total ${total}`);return{id,total}}catch(e){c.db.exec("ROLLBACK");throw e}}

export function returnsHistory(sessionId:string){const c=ctx(sessionId);return c.db.prepare("SELECT r.*,s.receipt_number,u.name cashier FROM returns r JOIN sales s ON s.id=r.sale_id JOIN users u ON u.id=r.user_id WHERE s.store_id=? ORDER BY r.created_at DESC LIMIT 200").all(c.storeId)}

export function paymentSummary(sessionId:string){const c=ctx(sessionId);return c.db.prepare("SELECT payment_method method,COUNT(*) count,COALESCE(SUM(total),0) total FROM sales WHERE store_id=? AND status='COMPLETED' GROUP BY payment_method ORDER BY payment_method").all(c.storeId)}

export function lowStock(sessionId:string){const c=ctx(sessionId);return c.db.prepare("SELECT * FROM products WHERE business_id=? AND active=1 AND stock<=min_stock ORDER BY stock ASC,name ASC").all(c.businessId)}

export function adjustStock(sessionId:string,productId:string,quantity:number,reason:string){const c=ctx(sessionId);if(!manager(c.role))throw new Error("Manager approval is required for stock adjustments.");const q=Number(quantity);if(!Number.isFinite(q)||q===0)throw new Error("Enter a non-zero stock adjustment.");if(!reason.trim())throw new Error("Enter a reason.");const p=c.db.prepare("SELECT * FROM products WHERE id=? AND business_id=? AND active=1").get(productId,c.businessId) as any;if(!p)throw new Error("Product not found.");if(Number(p.stock)+q<0)throw new Error("Stock cannot become negative.");const now=new Date().toISOString();c.db.prepare("UPDATE products SET stock=stock+?,updated_at=? WHERE id=?").run(q,now,productId);c.db.prepare("INSERT INTO inventory_movements(id,product_id,user_id,type,quantity,reason,created_at) VALUES(?,?,?,?,?,?,?)").run(randomUUID(),productId,c.userId,"ADJUSTMENT",q,reason.trim(),now);audit(c.userId,"ADJUST_STOCK","PRODUCT",productId,`${q}: ${reason}`);return{success:true,stock:Number(p.stock)+q}}

export function barcodeLabelData(sessionId:string){const c=ctx(sessionId);return c.db.prepare("SELECT id,name,sku,barcode,selling_price,unit FROM products WHERE business_id=? AND active=1 AND COALESCE(barcode,'')<>'' ORDER BY name").all(c.businessId)}
