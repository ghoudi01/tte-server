/** Normalize Tunisian mobile to 8-digit national form or null. */
export function normalizeTunisiaMobile(input: string): string | null {
  let s = input.replace(/[\s-.]/g, "");
  if (!s) return null;

  if (s.startsWith("+216")) s = s.slice(4);
  else if (s.startsWith("00216")) s = s.slice(5);
  else if (s.startsWith("216") && s.length >= 11) s = s.slice(3);

  if (s.startsWith("0") && s.length === 9) s = s.slice(1);

  if (/^[2-9]\d{7}$/.test(s)) return s;
  return null;
}

export function e164TunisiaFromNational(digits8: string): string {
  return `+216${digits8}`;
}
