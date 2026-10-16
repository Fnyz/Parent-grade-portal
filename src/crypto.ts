// Small crypto helpers on Web Crypto. Also imported by scripts/teacher.mjs
// under Node, so this file uses no Worker-only APIs.

const enc = new TextEncoder();

/** Workers caps PBKDF2 at 100,000 iterations. */
export const PBKDF2_ITERATIONS = 100_000;

export interface PasswordRecord {
  salt: string;
  hash: string;
  iter: number;
}

export function b64u(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64u(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function randomToken(n = 32): string {
  return b64u(randomBytes(n));
}

export async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function pbkdf2(password: string, salt: Uint8Array, iter: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<PasswordRecord> {
  const salt = randomBytes(16);
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return { salt: b64u(salt), hash: b64u(hash), iter: PBKDF2_ITERATIONS };
}

export async function verifyPassword(password: string, rec: PasswordRecord): Promise<boolean> {
  const got = await pbkdf2(password, fromB64u(rec.salt), rec.iter);
  return sameBytes(got, fromB64u(rec.hash));
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** Signs a small JSON payload as `payload.signature`, both base64url. */
export async function signToken(secret: string, payload: unknown): Promise<string> {
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body));
  return body + "." + b64u(sig);
}

export async function readToken(secret: string, token: string): Promise<unknown | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromB64u(sig), enc.encode(body));
    if (!ok) return null;
    return JSON.parse(new TextDecoder().decode(fromB64u(body)));
  } catch {
    return null;
  }
}

// Access codes: ten characters with no look-alikes (no 0/O, 1/I/L), shown as XXXXX-XXXXX.
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomChars(n: number, alphabet: string): string {
  // Rejection sampling keeps every character equally likely.
  const limit = 256 - (256 % alphabet.length);
  let out = "";
  while (out.length < n) {
    for (const b of randomBytes(n * 2)) {
      if (b < limit && out.length < n) out += alphabet[b % alphabet.length];
    }
  }
  return out;
}

export function newAccessCode(): string {
  const c = randomChars(10, CODE_ALPHABET);
  return c.slice(0, 5) + "-" + c.slice(5);
}

/** Tidies what a parent typed. Returns XXXXX-XXXXX, or null if it cannot be a code. */
export function normaliseCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 40) return null;
  const c = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (c.length !== 10) return null;
  for (const ch of c) if (!CODE_ALPHABET.includes(ch)) return null;
  return c.slice(0, 5) + "-" + c.slice(5);
}

/** IDs the system generates. Typed text never becomes part of a key. */
export function newId(prefix: string): string {
  return prefix + "_" + randomChars(12, "abcdefghjkmnpqrstuvwxyz23456789");
}
