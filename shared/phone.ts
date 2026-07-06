/**
 * Normalize a Tunisian phone number to E.164 format (+216XXXXXXXX).
 * - 8 digits → +216XXXXXXXX
 * - 216XXXXXXXX (no +) → +216XXXXXXXX
 * - +216XXXXXXXX → unchanged
 * - Strips whitespace
 */
export function normalizePhone(raw: string): string {
  const s = raw.trim();
  if (s.startsWith("+")) return s;
  if (/^216\d{8}$/.test(s)) return `+${s}`;
  if (/^\d{8}$/.test(s)) return `+216${s}`;
  // fallback: return as-is with + if it looks like an international number
  if (/^\d{11,15}$/.test(s)) return `+${s}`;
  return s;
}
