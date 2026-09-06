import { randomUUID } from "node:crypto";
import { getDatabase } from "../database/database";
import { hashPassword } from "../security/password";

export interface SetupInput {
  businessName: string;
  businessPhone: string;
  currency: string;
  storeName: string;
  storeAddress: string;
  adminName: string;
  adminEmail: string;
  password: string;
}

const allowedCurrencies = new Set(["LKR", "USD", "EUR"]);

function clean(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

function validateSetup(input: SetupInput): SetupInput {
  const result: SetupInput = {
    businessName: clean(input.businessName, 160),
    businessPhone: clean(input.businessPhone, 40),
    currency: clean(input.currency, 3).toUpperCase(),
    storeName: clean(input.storeName, 160),
    storeAddress: clean(input.storeAddress, 300),
    adminName: clean(input.adminName, 120),
    adminEmail: clean(input.adminEmail, 254).toLowerCase(),
    password: input.password,
  };

  if (!result.businessName || !result.storeName || !result.storeAddress || !result.adminName || !result.adminEmail) {
    throw new Error("Please complete all required setup fields.");
  }
  if (!allowedCurrencies.has(result.currency)) {
    throw new Error("That currency is not supported yet.");
  }
  if (!/^\S+@\S+\.\S+$/.test(result.adminEmail)) {
    throw new Error("Please enter a valid administrator email address.");
  }
  if (result.password.length < 8 || result.password.length > 256) {
    throw new Error("Password must be between 8 and 256 characters.");
  }

  return result;
}

export function getSetupStatus() {
  const db = getDatabase();
  const business = db.prepare("SELECT id, name, phone, currency FROM businesses ORDER BY created_at LIMIT 1").get() as
    | { id: string; name: string; phone: string | null; currency: string }
    | undefined;

  if (!business) return { isSetupComplete: false as const };

  const store = db.prepare("SELECT id, name, address FROM stores WHERE business_id = ? ORDER BY created_at LIMIT 1").get(business.id) as
    | { id: string; name: string; address: string }
    | undefined;

  const user = db.prepare("SELECT id, name, email, role FROM users WHERE business_id = ? ORDER BY created_at LIMIT 1").get(business.id) as
    | { id: string; name: string; email: string; role: string }
    | undefined;

  return {
    isSetupComplete: Boolean(store && user),
    business: { id: business.id, name: business.name, phone: business.phone ?? "", currency: business.currency },
    store: store ? { id: store.id, name: store.name, address: store.address } : null,
    user: user ? { id: user.id, name: user.name, email: user.email, role: user.role } : null,
  };
}

export function completeSetup(rawInput: SetupInput) {
  const input = validateSetup(rawInput);
  const db = getDatabase();

  if (getSetupStatus().isSetupComplete) {
    throw new Error("OLYR POS has already been set up on this device.");
  }

  const now = new Date().toISOString();
  const businessId = randomUUID();
  const storeId = randomUUID();
  const userId = randomUUID();
  const { hash, salt } = hashPassword(input.password);

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      "INSERT INTO businesses (id, name, phone, currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(businessId, input.businessName, input.businessPhone || null, input.currency, now, now);

    db.prepare(
      "INSERT INTO stores (id, business_id, name, address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(storeId, businessId, input.storeName, input.storeAddress, now, now);

    db.prepare(
      "INSERT INTO users (id, business_id, store_id, name, email, role, password_hash, password_salt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(userId, businessId, storeId, input.adminName, input.adminEmail, "ADMINISTRATOR", hash, salt, now, now);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return getSetupStatus();
}
