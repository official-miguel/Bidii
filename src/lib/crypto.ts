import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

/// AES-256-GCM encryption for secrets we have to store but never want to
/// leak in a raw database dump — currently just each school's own
/// third-party API keys (Gemini, SMS, WhatsApp, Email, ...). Not used for
/// passwords, which stay hashed (one-way) via bcrypt in auth.ts; this is for
/// values the app needs to read back in plaintext to actually call the
/// provider's API.
///
/// INTEGRATION_ENCRYPTION_KEY must be set in the server environment — any
/// long random string works, it's hashed down to a 32-byte key below so the
/// env var itself doesn't have to be exactly 32 bytes. Losing/rotating this
/// value makes every previously-saved key unreadable, so treat it like any
/// other production secret: set it once, back it up, don't commit it.
function getKey(): Buffer {
  const secret = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "INTEGRATION_ENCRYPTION_KEY is not set. Add a long random string to your .env — see .env.example."
    );
  }
  return createHash("sha256").update(secret).digest();
}

const IV_LENGTH = 12; // recommended IV size for GCM

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Store iv + authTag + ciphertext together, base64-encoded, so there's
  // only one column to persist and no risk of the parts getting out of sync.
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const key = getKey();
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
  const encrypted = raw.subarray(IV_LENGTH + 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

/// Last 4 characters only — enough for a Principal to recognize "yes, that's
/// the key I saved" without the UI ever displaying (or the server ever
/// re-sending) the full secret after the initial save.
export function previewSecret(plaintext: string): string {
  return plaintext.length <= 4 ? plaintext : plaintext.slice(-4);
}
