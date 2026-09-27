import { randomUUID } from "node:crypto";
import { getDatabase } from "../database/database";
import { audit, requireSession } from "./auth";

const ctx=(sessionId:string)=>{
  const {userId}=requireSession(sessionId);
  const db=getDatabase();
  const u=db.prepare("SELECT business_id,store_id,role FROM users WHERE id=?").get(userId) as any;
  if(!u) throw new Error("User account could not be found.");
  const b=db.prepare("SELECT vertical FROM businesses WHERE id=?").get(u.business_id) as any;
  return {userId,businessId:u.business_id,storeId:u.store_id,role:String(u.role||"").toUpperCase(),vertical:String(b?.vertical||"RETAIL"),db};
};
const manager=(role:string)=>["ADMINISTRATOR","ADMIN","MANAGER","OWNER"].includes(role);

export function industrySnapshot(sessionId:string){
  const c=ctx(sessionId);
  if(c.vertical==="RESTAURANT") return {vertical:c.vertical,tables:c.db.prepare("SELECT * FROM restaurant_tables WHERE store_id=? ORDER BY name").all(c.storeId),orders:c.db.prepare("SELECT o.*,t.name table_name FROM restaurant_orders o LEFT JOIN restaurant_tables t ON t.id=o.table_id WHERE o.store_id=? ORDER BY o.updated_at DESC LIMIT 100").all(c.storeId)};
  if(c.vertical==="PHARMACY") return {vertical:c.vertical,batches:c.db.prepare("SELECT b.*,p.name product_name,p.sku FROM pharmacy_batches b JOIN products p ON p.id=b.product_id WHERE b.business_id=? ORDER BY b.expiry_date ASC").all(c.businessId),prescriptions:c.db.prepare("SELECT pr.*,cu.name customer_name FROM pharmacy_prescriptions pr LEFT JOIN customers cu ON cu.id=pr.customer_id WHERE pr.store_id=? ORDER BY pr.created_at DESC LIMIT 100").all(c.storeId)};
  if(c.vertical==="SUPERMARKET") return {vertical:c.vertical,rules:c.db.prepare("SELECT * FROM supermarket_price_rules WHERE business_id=? ORDER BY active DESC,name").all(c.businessId)};
  if(c.vertical==="WHOLESALE") return {vertical:c.vertical,tiers:c.db.prepare("SELECT t.*,p.name product_name,p.sku FROM wholesale_price_tiers t JOIN products p ON p.id=t.product_id WHERE t.business_id=? ORDER BY p.name,t.min_qty").all(c.businessId),accounts:c.db.prepare("SELECT a.*,cu.name customer_name FROM wholesale_accounts a JOIN customers cu ON cu.id=a.customer_id WHERE a.business_id=? ORDER BY cu.name").all(c.businessId)};
  if(c.vertical==="FASHION") return {vertical:c.vertical,variants:c.db.prepare("SELECT v.*,p.name product_name FROM fashion_variants v JOIN products p ON p.id=v.product_id WHERE v.business_id=? ORDER BY p.name,v.size,v.color").all(c.businessId)};
  return {vertical:c.vertical};
}
export function restaurantSeedTables(sessionId:string){
  const c=ctx(sessionId); if(c.vertical!=="RESTAURANT") throw new Error("Restaurant features are only available for restaurant businesses.");
  const count=Number((c.db.prepare("SELECT COUNT(*) count FROM restaurant_tables WHERE store_id=?").get(c.storeId) as any).count);
  if(count>0) return {created:0}; const now=new Date().toISOString();
  for(let i=1;i<=12;i++) c.db.prepare("INSERT INTO restaurant_tables(id,store_id,name,capacity,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run(randomUUID(),c.storeId,String(i),i<=4?2:i<=8?4:6,"AVAILABLE",now,now);
  return {created:12};
}
export function restaurantSaveTable(sessionId:string,input:{id?:string;name:string;capacity:number;status?:string}){
  const c=ctx(sessionId);if(c.vertical!=="RESTAURANT")throw new Error("Restaurant features are not enabled for this business.");if(!input.name.trim())throw new Error("Enter a table name.");
  const cap=Math.max(1,Math.floor(Number(input.capacity)||0));if(!cap)throw new Error("Enter a valid table capacity.");
  const status=["AVAILABLE","OCCUPIED","RESERVED","CLEANING"].includes(String(input.status||"AVAILABLE"))?String(input.status):"AVAILABLE";const now=new Date().toISOString();
  if(input.id){c.db.prepare("UPDATE restaurant_tables SET name=?,capacity=?,status=?,updated_at=? WHERE id=? AND store_id=?").run(input.name.trim(),cap,status,now,input.id,c.storeId);return c.db.prepare("SELECT * FROM restaurant_tables WHERE id=?").get(input.id);}
  const id=randomUUID();c.db.prepare("INSERT INTO restaurant_tables(id,store_id,name,capacity,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run(id,c.storeId,input.name.trim(),cap,status,now,now);audit(c.userId,"CREATE","RESTAURANT_TABLE",id,input.name.trim());return c.db.prepare("SELECT * FROM restaurant_tables WHERE id=?").get(id);
}
export function restaurantCreateOrder(sessionId:string,input:{tableId?:string;orderType:"DINE_IN"|"TAKEAWAY"|"DELIVERY";customerName?:string;notes?:string;items:{productId:string;quantity:number}[]}){
  const c=ctx(sessionId);if(c.vertical!=="RESTAURANT")throw new Error("Restaurant features are not enabled.");if(!input.items?.length)throw new Error("Add at least one item.");
  if(input.orderType==="DINE_IN"&&!input.tableId)throw new Error("Select a table for dine-in orders.");
  const rows=input.items.map(i=>{const p=c.db.prepare("SELECT * FROM products WHERE id=? AND business_id=? AND active=1").get(i.productId,c.businessId) as any;if(!p)throw new Error("Product not found.");const q=Number(i.quantity);if(!Number.isFinite(q)||q<=0)throw new Error("Invalid item quantity.");if(Number(p.stock)<q)throw new Error(p.name+" does not have enough stock.");return{p,q};});
  const total=rows.reduce((n,r)=>n+Number(r.p.selling_price)*r.q,0),id=randomUUID(),now=new Date().toISOString();c.db.exec("BEGIN IMMEDIATE");try{
    c.db.prepare("INSERT INTO restaurant_orders(id,store_id,user_id,table_id,order_type,status,customer_name,notes,total,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(id,c.storeId,c.userId,input.tableId||null,input.orderType,"RECEIVED",input.customerName?.trim()||null,input.notes?.trim()||null,total,now,now);
    for(const r of rows)c.db.prepare("INSERT INTO restaurant_order_items(id,order_id,product_id,quantity,unit_price,modifiers_json,status) VALUES(?,?,?,?,?,?,?)").run(randomUUID(),id,r.p.id,r.q,r.p.selling_price,"{}","QUEUED");
    if(input.tableId)c.db.prepare("UPDATE restaurant_tables SET status='OCCUPIED',updated_at=? WHERE id=? AND store_id=?").run(now,input.tableId,c.storeId);
    c.db.exec("COMMIT");audit(c.userId,"CREATE","RESTAURANT_ORDER",id,"Order "+input.orderType+" total "+total);return{id,total,status:"RECEIVED"};
  }catch(e){c.db.exec("ROLLBACK");throw e;}
}
export function restaurantUpdateOrder(sessionId:string,id:string,status:string){
  const c=ctx(sessionId);if(c.vertical!=="RESTAURANT")throw new Error("Restaurant features are not enabled.");const allowed=["RECEIVED","KITCHEN","PREPARING","READY","SERVED","CANCELLED"];if(!allowed.includes(status))throw new Error("Invalid kitchen status.");
  const o=c.db.prepare("SELECT * FROM restaurant_orders WHERE id=? AND store_id=?").get(id,c.storeId) as any;if(!o)throw new Error("Restaurant order not found.");const now=new Date().toISOString();c.db.prepare("UPDATE restaurant_orders SET status=?,updated_at=? WHERE id=?").run(status,now,id);
  if(o.table_id&&(status==="SERVED"||status==="CANCELLED"))c.db.prepare("UPDATE restaurant_tables SET status='AVAILABLE',updated_at=? WHERE id=?").run(now,o.table_id);
  return c.db.prepare("SELECT * FROM restaurant_orders WHERE id=?").get(id);
}
export function pharmacyAddBatch(sessionId:string,input:{productId:string;batchNumber:string;expiryDate:string;quantity:number;costPrice:number}){
  const c=ctx(sessionId);if(c.vertical!=="PHARMACY")throw new Error("Pharmacy features are not enabled.");const p=c.db.prepare("SELECT id FROM products WHERE id=? AND business_id=? AND active=1").get(input.productId,c.businessId);if(!p)throw new Error("Medicine product not found.");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.expiryDate))throw new Error("Use expiry date YYYY-MM-DD.");const q=Number(input.quantity),cost=Number(input.costPrice);if(!input.batchNumber.trim()||!Number.isFinite(q)||q<=0||!Number.isFinite(cost)||cost<0)throw new Error("Enter valid batch details.");
  const id=randomUUID(),now=new Date().toISOString();c.db.prepare("INSERT INTO pharmacy_batches(id,business_id,product_id,batch_number,expiry_date,quantity,cost_price,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run(id,c.businessId,input.productId,input.batchNumber.trim(),input.expiryDate,q,cost,now,now);
  c.db.prepare("UPDATE products SET stock=stock+?,cost_price=?,updated_at=? WHERE id=?").run(q,cost,now,input.productId);c.db.prepare("INSERT INTO inventory_movements(id,product_id,user_id,type,quantity,reference_id,reason,created_at) VALUES(?,?,?,?,?,?,?,?)").run(randomUUID(),input.productId,c.userId,"PHARMACY_BATCH",q,id,"Batch "+input.batchNumber.trim(),now);audit(c.userId,"CREATE","PHARMACY_BATCH",id,input.batchNumber.trim());return c.db.prepare("SELECT * FROM pharmacy_batches WHERE id=?").get(id);
}
export function pharmacyCreatePrescription(sessionId:string,input:{customerId?:string;prescriber:string;reference:string;notes?:string}){
  const c=ctx(sessionId);if(c.vertical!=="PHARMACY")throw new Error("Pharmacy features are not enabled.");if(!input.prescriber.trim()||!input.reference.trim())throw new Error("Prescriber and prescription reference are required.");
  const id=randomUUID(),now=new Date().toISOString();c.db.prepare("INSERT INTO pharmacy_prescriptions(id,store_id,customer_id,prescriber,reference,notes,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run(id,c.storeId,input.customerId||null,input.prescriber.trim(),input.reference.trim(),input.notes?.trim()||null,"OPEN",now,now);return c.db.prepare("SELECT * FROM pharmacy_prescriptions WHERE id=?").get(id);
}
export function pharmacyDispense(sessionId:string,input:{prescriptionId?:string;productId:string;batchId:string;quantity:number}){
  const c=ctx(sessionId);if(c.vertical!=="PHARMACY")throw new Error("Pharmacy features are not enabled.");const q=Number(input.quantity);if(!Number.isFinite(q)||q<=0)throw new Error("Enter a valid dispense quantity.");
  const b=c.db.prepare("SELECT * FROM pharmacy_batches WHERE id=? AND business_id=?").get(input.batchId,c.businessId) as any;if(!b)throw new Error("Batch not found.");if(String(b.expiry_date)<new Date().toISOString().slice(0,10))throw new Error("Expired batch cannot be dispensed.");if(Number(b.quantity)<q)throw new Error("Not enough quantity in this batch.");
  const p=c.db.prepare("SELECT * FROM products WHERE id=? AND business_id=?").get(input.productId,c.businessId) as any;if(!p)throw new Error("Medicine not found.");const id=randomUUID(),now=new Date().toISOString();c.db.exec("BEGIN IMMEDIATE");try{c.db.prepare("INSERT INTO pharmacy_dispenses(id,store_id,prescription_id,product_id,batch_id,quantity,user_id,created_at) VALUES(?,?,?,?,?,?,?,?)").run(id,c.storeId,input.prescriptionId||null,input.productId,input.batchId,q,c.userId,now);c.db.prepare("UPDATE pharmacy_batches SET quantity=quantity-?,updated_at=? WHERE id=?").run(q,now,input.batchId);c.db.prepare("UPDATE products SET stock=stock-?,updated_at=? WHERE id=?").run(q,now,input.productId);c.db.prepare("INSERT INTO inventory_movements(id,product_id,user_id,type,quantity,reference_id,reason,created_at) VALUES(?,?,?,?,?,?,?,?)").run(randomUUID(),input.productId,c.userId,"DISPENSE",-q,id,"Pharmacy dispense",now);c.db.exec("COMMIT");return{id};}catch(e){c.db.exec("ROLLBACK");throw e;}
}
export function supermarketSaveRule(sessionId:string,input:{id?:string;name:string;type:"PERCENT"|"FIXED"|"BUY_X_GET_Y";value:number;minQty:number}){
  const c=ctx(sessionId);if(c.vertical!=="SUPERMARKET")throw new Error("Supermarket features are not enabled.");const value=Number(input.value),min=Math.max(1,Number(input.minQty)||1);if(!input.name.trim()||!Number.isFinite(value)||value<0)throw new Error("Enter valid pricing rule details.");const now=new Date().toISOString();
  if(input.id){c.db.prepare("UPDATE supermarket_price_rules SET name=?,type=?,value=?,min_qty=?,updated_at=? WHERE id=? AND business_id=?").run(input.name.trim(),input.type,value,min,now,input.id,c.businessId);return c.db.prepare("SELECT * FROM supermarket_price_rules WHERE id=?").get(input.id);}
  const id=randomUUID();c.db.prepare("INSERT INTO supermarket_price_rules(id,business_id,name,type,value,min_qty,active,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?)").run(id,c.businessId,input.name.trim(),input.type,value,min,now,now);return c.db.prepare("SELECT * FROM supermarket_price_rules WHERE id=?").get(id);
}
export function supermarketWeightedPrice(sessionId:string,input:{productId:string;quantity:number}){
  const c=ctx(sessionId);if(c.vertical!=="SUPERMARKET")throw new Error("Supermarket features are not enabled.");const p=c.db.prepare("SELECT * FROM products WHERE id=? AND business_id=? AND active=1").get(input.productId,c.businessId) as any;if(!p)throw new Error("Product not found.");const q=Number(input.quantity);if(!Number.isFinite(q)||q<=0)throw new Error("Enter a valid weight.");return{productId:p.id,name:p.name,quantity:q,unit:p.unit,unitPrice:Number(p.selling_price),total:Number(p.selling_price)*q};
}
export function wholesaleSaveTier(sessionId:string,input:{productId:string;minQty:number;unitPrice:number}){
  const c=ctx(sessionId);if(c.vertical!=="WHOLESALE")throw new Error("Wholesale features are not enabled.");const q=Math.max(1,Math.floor(Number(input.minQty)||0)),price=Number(input.unitPrice);if(!input.productId||!Number.isFinite(price)||price<0)throw new Error("Enter valid tier details.");const p=c.db.prepare("SELECT id FROM products WHERE id=? AND business_id=?").get(input.productId,c.businessId);if(!p)throw new Error("Product not found.");const id=randomUUID(),now=new Date().toISOString();c.db.prepare("INSERT INTO wholesale_price_tiers(id,business_id,product_id,min_qty,unit_price,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run(id,c.businessId,input.productId,q,price,now,now);return c.db.prepare("SELECT * FROM wholesale_price_tiers WHERE id=?").get(id);
}
export function wholesaleSaveAccount(sessionId:string,input:{customerId:string;creditLimit:number}){
  const c=ctx(sessionId);if(c.vertical!=="WHOLESALE")throw new Error("Wholesale features are not enabled.");const limit=Number(input.creditLimit);if(!Number.isFinite(limit)||limit<0)throw new Error("Enter a valid credit limit.");const customer=c.db.prepare("SELECT id FROM customers WHERE id=? AND business_id=?").get(input.customerId,c.businessId);if(!customer)throw new Error("Customer not found.");const existing=c.db.prepare("SELECT id FROM wholesale_accounts WHERE customer_id=? AND business_id=?").get(input.customerId,c.businessId) as any;const now=new Date().toISOString();if(existing){c.db.prepare("UPDATE wholesale_accounts SET credit_limit=?,updated_at=? WHERE id=?").run(limit,now,existing.id);return c.db.prepare("SELECT * FROM wholesale_accounts WHERE id=?").get(existing.id);}const id=randomUUID();c.db.prepare("INSERT INTO wholesale_accounts(id,business_id,customer_id,credit_limit,outstanding,created_at,updated_at) VALUES(?,?,?,?,0,?,?)").run(id,c.businessId,input.customerId,limit,now,now);return c.db.prepare("SELECT * FROM wholesale_accounts WHERE id=?").get(id);
}
export function wholesaleQuote(sessionId:string,input:{productId:string;quantity:number}){
  const c=ctx(sessionId);if(c.vertical!=="WHOLESALE")throw new Error("Wholesale features are not enabled.");const q=Number(input.quantity);if(!Number.isFinite(q)||q<=0)throw new Error("Enter a valid quantity.");const p=c.db.prepare("SELECT * FROM products WHERE id=? AND business_id=?").get(input.productId,c.businessId) as any;if(!p)throw new Error("Product not found.");const tier=c.db.prepare("SELECT unit_price FROM wholesale_price_tiers WHERE product_id=? AND business_id=? AND min_qty<=? ORDER BY min_qty DESC LIMIT 1").get(p.id,c.businessId,q) as any;const unit=Number(tier?.unit_price??p.wholesale_price??p.selling_price);return{unitPrice:unit,quantity:q,total:unit*q};
}
export function fashionSaveVariant(sessionId:string,input:{productId:string;size:string;color:string;sku:string;barcode?:string;stock:number;sellingPrice:number}){
  const c=ctx(sessionId);if(c.vertical!=="FASHION")throw new Error("Fashion features are not enabled.");const p=c.db.prepare("SELECT id FROM products WHERE id=? AND business_id=?").get(input.productId,c.businessId);if(!p)throw new Error("Product not found.");const stock=Math.max(0,Number(input.stock)||0),price=Number(input.sellingPrice);if(!input.size.trim()||!input.color.trim()||!input.sku.trim()||!Number.isFinite(price)||price<0)throw new Error("Complete the variant details.");const id=randomUUID(),now=new Date().toISOString();c.db.prepare("INSERT INTO fashion_variants(id,business_id,product_id,size,color,sku,barcode,stock,selling_price,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(id,c.businessId,input.productId,input.size.trim(),input.color.trim(),input.sku.trim().toUpperCase(),input.barcode?.trim()||null,stock,price,now,now);return c.db.prepare("SELECT * FROM fashion_variants WHERE id=?").get(id);
}
export function fashionAdjustVariant(sessionId:string,id:string,quantity:number,reason:string){
  const c=ctx(sessionId);if(c.vertical!=="FASHION")throw new Error("Fashion features are not enabled.");if(!manager(c.role))throw new Error("Manager approval is required.");const q=Number(quantity);if(!Number.isFinite(q)||q===0||!reason.trim())throw new Error("Enter a valid adjustment and reason.");const v=c.db.prepare("SELECT * FROM fashion_variants WHERE id=? AND business_id=?").get(id,c.businessId) as any;if(!v)throw new Error("Variant not found.");if(Number(v.stock)+q<0)throw new Error("Variant stock cannot become negative.");c.db.prepare("UPDATE fashion_variants SET stock=stock+?,updated_at=? WHERE id=?").run(q,new Date().toISOString(),id);audit(c.userId,"ADJUST","FASHION_VARIANT",id,reason.trim());return c.db.prepare("SELECT * FROM fashion_variants WHERE id=?").get(id);
}