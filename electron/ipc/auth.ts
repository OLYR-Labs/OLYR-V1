import { randomUUID } from "node:crypto";
import { getDatabase } from "../database/database";
import { verifyPassword } from "../security/password";

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthenticatedSession {
  sessionId: string;
  expiresAt: string;
  user: { id: string; name: string; email: string; role: string };
  business: { id: string; name: string; currency: string };
  store: { id: string; name: string; address: string };
}

const sessions = new Map<string, { expiresAt: number; userId: string }>();
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

export function login(rawInput: LoginInput): AuthenticatedSession {
  const email = rawInput.email.trim().toLowerCase();
  const password = rawInput.password;

  if (!email || !password) throw new Error("Enter your email and password.");

  const db = getDatabase();
  const row = db.prepare(`
    SELECT
      u.id AS user_id, u.name AS user_name, u.email AS user_email, u.role AS user_role,
      u.password_hash, u.password_salt,
      b.id AS business_id, b.name AS business_name, b.currency AS business_currency,
      s.id AS store_id, s.name AS store_name, s.address AS store_address
    FROM users u
    INNER JOIN businesses b ON b.id = u.business_id
    INNER JOIN stores s ON s.id = u.store_id
    WHERE lower(u.email) = ?
    LIMIT 1
  `).get(email) as {
    user_id: string; user_name: string; user_email: string; user_role: string;
    password_hash: string; password_salt: string;
    business_id: string; business_name: string; business_currency: string;
    store_id: string; store_name: string; store_address: string;
  } | undefined;

  if (!row || !verifyPassword(password, row.password_hash, row.password_salt)) {
    throw new Error("The email or password is incorrect.");
  }

  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const sessionId = randomUUID();
  sessions.set(sessionId, { expiresAt, userId: row.user_id });

  return {
    sessionId,
    expiresAt: new Date(expiresAt).toISOString(),
    user: { id: row.user_id, name: row.user_name, email: row.user_email, role: row.user_role },
    business: { id: row.business_id, name: row.business_name, currency: row.business_currency },
    store: { id: row.store_id, name: row.store_name, address: row.store_address },
  };
}

export function logout(sessionId: string): void {
  sessions.delete(sessionId);
}

export function requireSession(sessionId: string): { userId: string } {
  const session = sessions.get(sessionId);
  if (!session || session.expiresAt <= Date.now()) {
    if (session) sessions.delete(sessionId);
    throw new Error("Your session has expired. Please sign in again.");
  }
  return { userId: session.userId };
}
