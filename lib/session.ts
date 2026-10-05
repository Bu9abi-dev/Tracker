import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless session tokens: "<expiresAtMs>.<hmac>". The HMAC key mixes
 * SESSION_SECRET with a hash of DASHBOARD_PASSWORD, so rotating either one
 * signs every device out.
 */

export const SESSION_COOKIE = "tracker_session";
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;
export const MIN_PASSWORD_LENGTH = 12;

export interface AuthConfig {
  password: string;
  secret: string;
}

export type AuthConfigResult = { ok: true; config: AuthConfig } | { ok: false; reason: string };

export function readAuthConfig(env: Record<string, string | undefined> = process.env): AuthConfigResult {
  const password = env.DASHBOARD_PASSWORD ?? "";
  const secret = env.SESSION_SECRET ?? "";
  if (!password) return { ok: false, reason: "DASHBOARD_PASSWORD is not set." };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: `DASHBOARD_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (secret.length < 32) return { ok: false, reason: "SESSION_SECRET must be at least 32 characters." };
  return { ok: true, config: { password, secret } };
}

function key(config: AuthConfig): Buffer {
  const pw = createHash("sha256").update(config.password).digest("hex");
  return createHash("sha256").update(`${config.secret}:${pw}`).digest();
}

function sign(payload: string, config: AuthConfig): string {
  return createHmac("sha256", key(config)).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function createSessionToken(config: AuthConfig, now = Date.now()): string {
  const exp = String(now + SESSION_MAX_AGE_S * 1000);
  return `${exp}.${sign(exp, config)}`;
}

export function verifySessionToken(token: string | undefined, config: AuthConfig, now = Date.now()): boolean {
  if (!token) return false;
  const [exp, mac, extra] = token.split(".");
  if (!exp || !mac || extra !== undefined || !/^\d+$/.test(exp)) return false;
  if (!safeEqual(mac, sign(exp, config))) return false;
  return Number(exp) > now;
}

/** Constant-time password check (hashing first equalises lengths). */
export function checkPassword(input: string, config: AuthConfig): boolean {
  return safeEqual(input, config.password);
}

/** Only allow same-site relative redirects after login. */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
