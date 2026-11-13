import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { env } from "./env.js";

/**
 * Provider API keys are stored encrypted, never in plaintext, and never handed
 * back to the browser (spec §13.5). AES-256-GCM: the auth tag makes a tampered
 * ciphertext fail loudly instead of decrypting into garbage.
 */

let warned = false;

function key(): Buffer {
  if (env.DATA_ENCRYPTION_KEY) return Buffer.from(env.DATA_ENCRYPTION_KEY, "hex");

  // Local development without an explicit key: derive one from SESSION_SECRET
  // so the feature works out of the box, and say so once on stderr.
  if (!warned) {
    warned = true;
    console.warn(
      "[fitplaner] DATA_ENCRYPTION_KEY is not set; deriving the key from SESSION_SECRET. Set a 64-hex-char key before real users store provider keys.",
    );
  }
  return scryptSync(env.SESSION_SECRET, "fitplaner-provider-keys", 32);
}

export type StoredSecret = { keyCipher: string; keyIv: string };

/** The auth tag travels appended to the ciphertext, which is what decrypt reads back. */
export function encryptSecret(plaintext: string): StoredSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    keyCipher: Buffer.concat([data, cipher.getAuthTag()]).toString("base64"),
    keyIv: iv.toString("base64"),
  };
}

export function decryptSecret(record: { keyCipher: string | null; keyIv: string | null }): string | null {
  if (!record.keyCipher || !record.keyIv) return null;
  const raw = Buffer.from(record.keyCipher, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(record.keyIv, "base64"));
  decipher.setAuthTag(raw.subarray(raw.length - 16));
  return Buffer.concat([decipher.update(raw.subarray(0, raw.length - 16)), decipher.final()]).toString("utf8");
}

/** "sk-…4f2a" — enough to recognise a key, not enough to use one. */
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 8) return "••••";
  return `${plaintext.slice(0, 3)}…${plaintext.slice(-4)}`;
}
