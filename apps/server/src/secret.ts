import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "./env";

const ALGO = "aes-256-gcm";

function loadKey(): Buffer {
  if (env.secretKey) {
    return createHash("sha256").update(env.secretKey).digest();
  }
  const file = join(env.dataDir, ".secret");
  if (existsSync(file)) return Buffer.from(readFileSync(file, "utf8").trim(), "hex");
  mkdirSync(env.dataDir, { recursive: true });
  const key = randomBytes(32);
  writeFileSync(file, key.toString("hex"), { mode: 0o600 });
  return key;
}

const key = loadKey();

export function hashSecret(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function signPayload(value: string): string {
  const sig = createHmac("sha256", key).update(value).digest("base64url");
  return `${value}.${sig}`;
}

export function verifyPayload(token: string): string | null {
  const i = token.lastIndexOf(".");
  if (i < 0) return null;
  const value = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expected = createHmac("sha256", key).update(value).digest("base64url");
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let n = 0; n < sig.length; n++) diff |= sig.charCodeAt(n) ^ expected.charCodeAt(n);
  return diff === 0 ? value : null;
}
