import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

function deriveKey(): Buffer {
  const secret = process.env.META_TOKEN_ENCRYPTION_KEY?.trim() ?? "";
  if (secret.length < 16) {
    throw new Error(
      "META_TOKEN_ENCRYPTION_KEY must be set (min 16 chars) for Meta Page tokens"
    );
  }
  return scryptSync(secret, "tte-meta-token-v1", 32);
}

/** Encrypt Page access token for storage (AES-256-GCM). */
export function encryptMetaToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptMetaToken(encoded: string): string {
  const buf = Buffer.from(encoded, "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(), iv);
  decipher.setAuthTag(tag);
  return (
    decipher.update(data).toString("utf8") + decipher.final("utf8")
  );
}

export function isMetaTokenCryptoConfigured(): boolean {
  return (process.env.META_TOKEN_ENCRYPTION_KEY?.trim().length ?? 0) >= 16;
}
