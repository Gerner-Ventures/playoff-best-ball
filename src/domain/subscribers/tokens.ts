import { createHash, randomBytes } from "node:crypto";

/** 32 random bytes as base64url: 43 URL-safe characters. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** sha256 hex. Confirm tokens are stored only as this hash; the raw token lives in the email. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Cheap shape check before any database lookup. It accepts newToken() output and the
 * migration's 64-hex backfill tokens, and turns away truncated or mangled links
 * (email clients wrap long URLs) without a query.
 */
export function isWellFormedToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(token);
}

/** Trim + lowercase. Every read and write of EmailSubscriber.email goes through this. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
