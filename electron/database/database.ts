import { app } from "electron";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

let database: DatabaseSync | null = null;

export function getDatabase(): DatabaseSync {
  if (database) return database;
  const dir = app.getPath("userData");
  mkdirSync(dir, { recursive: true });
  database = new DatabaseSync(path.join(dir, "olyr-pos.sqlite"));
  database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS businesses (id TEXT PRIMARY KEY,name TEXT NOT NULL,phone TEXT,currency TEXT NOT NULL DEFAULT 'LKR',logo_path TEXT,address TEXT,email TEXT,tax_number TEXT,receipt_footer TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS stores (id TEXT PRIMARY KEY,business_id TEXT NOT NULL,name TEXT NOT NULL,address TEXT NOT NULL,phone TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,business_id TEXT NOT NULL,store_id TEXT NOT NULL,name TEXT NOT NULL,email TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'ADMINISTRATOR',password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(business_id,email),FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE,FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY,business_id TEXT NOT NULL,name TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,UNIQUE(business_id,name),FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS suppliers (id TEXT PRIMARY KEY,business_id TEXT NOT NULL,name TEXT NOT NULL,phone TEXT,email TEXT,address TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY,business_id TEXT NOT NULL,name TEXT NOT NULL,phone TEXT,email TEXT,address TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY,business_id TEXT NOT NULL,category_id TEXT,sku TEXT NOT NULL,barcode TEXT,name TEXT NOT NULL,brand TEXT,cost_price REAL NOT NULL DEFAULT 0,selling_price REAL NOT NULL DEFAULT 0,wholesale_price REAL NOT NULL DEFAULT 0,stock REAL NOT NULL DEFAULT 0,min_stock REAL NOT NULL DEFAULT 0,unit TEXT NOT NULL DEFAULT 'pcs',supplier_id TEXT,tax_rate REAL NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(business_id,sku),FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE,FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL,FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL);
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(business_id,barcode);
    CREATE TABLE IF NOT EXISTS cash_registers (id TEXT PRIMARY KEY,store_id TEXT NOT NULL,name TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS shifts (id TEXT PRIMARY KEY,register_id TEXT NOT NULL,user_id TEXT NOT NULL,opening_cash REAL NOT NULL,closing_cash REAL,opened_at TEXT NOT NULL,closed_at TEXT,status TEXT NOT NULL DEFAULT 'OPEN',FOREIGN KEY(register_id) REFERENCES cash_registers(id),FOREIGN KEY(user_id) REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS sales (id TEXT PRIMARY KEY,store_id TEXT NOT NULL,user_id TEXT NOT NULL,customer_id TEXT,shift_id TEXT,receipt_number TEXT NOT NULL UNIQUE,subtotal REAL NOT NULL,discount REAL NOT NULL DEFAULT 0,tax REAL NOT NULL DEFAULT 0,total REAL NOT NULL,payment_method TEXT NOT NULL,cash_received REAL NOT NULL DEFAULT 0,change_due REAL NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'COMPLETED',created_at TEXT NOT NULL,FOREIGN KEY(store_id) REFERENCES stores(id),FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(customer_id) REFERENCES customers(id),FOREIGN KEY(shift_id) REFERENCES shifts(id));
    CREATE TABLE IF NOT EXISTS sale_items (id TEXT PRIMARY KEY,sale_id TEXT NOT NULL,product_id TEXT NOT NULL,quantity REAL NOT NULL,unit_price REAL NOT NULL,discount REAL NOT NULL DEFAULT 0,line_total REAL NOT NULL,FOREIGN KEY(sale_id) REFERENCES sales(id) ON DELETE CASCADE,FOREIGN KEY(product_id) REFERENCES products(id));
    CREATE TABLE IF NOT EXISTS inventory_movements (id TEXT PRIMARY KEY,product_id TEXT NOT NULL,user_id TEXT NOT NULL,type TEXT NOT NULL,quantity REAL NOT NULL,reference_id TEXT,reason TEXT,created_at TEXT NOT NULL,FOREIGN KEY(product_id) REFERENCES products(id),FOREIGN KEY(user_id) REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS purchases (id TEXT PRIMARY KEY,store_id TEXT NOT NULL,supplier_id TEXT,user_id TEXT NOT NULL,reference_number TEXT NOT NULL,subtotal REAL NOT NULL,total REAL NOT NULL,status TEXT NOT NULL DEFAULT 'RECEIVED',created_at TEXT NOT NULL,FOREIGN KEY(store_id) REFERENCES stores(id),FOREIGN KEY(supplier_id) REFERENCES suppliers(id),FOREIGN KEY(user_id) REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS purchase_items (id TEXT PRIMARY KEY,purchase_id TEXT NOT NULL,product_id TEXT NOT NULL,quantity REAL NOT NULL,cost_price REAL NOT NULL,line_total REAL NOT NULL,FOREIGN KEY(purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,FOREIGN KEY(product_id) REFERENCES products(id));
    CREATE TABLE IF NOT EXISTS returns (id TEXT PRIMARY KEY,sale_id TEXT NOT NULL,user_id TEXT NOT NULL,total REAL NOT NULL,reason TEXT,created_at TEXT NOT NULL,FOREIGN KEY(sale_id) REFERENCES sales(id),FOREIGN KEY(user_id) REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY,user_id TEXT,action TEXT NOT NULL,entity_type TEXT NOT NULL,entity_id TEXT,details TEXT,created_at TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS hardware_devices (id TEXT PRIMARY KEY,store_id TEXT NOT NULL,type TEXT NOT NULL,name TEXT NOT NULL,connection TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',config_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS held_bills (id TEXT PRIMARY KEY,store_id TEXT NOT NULL,user_id TEXT NOT NULL,reference_number TEXT NOT NULL UNIQUE,item_json TEXT NOT NULL,discount REAL NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
    CREATE INDEX IF NOT EXISTS idx_held_bills_store ON held_bills(store_id,created_at);
  `);
  return database;
}
export function closeDatabase(){ if(database){ database.close(); database=null; } }
