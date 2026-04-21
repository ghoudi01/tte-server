export function unwrapTrpcJsonEnvelope(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if ("json" in record && Object.keys(record).length === 1) {
    return record.json;
  }
  return value;
}

export function normalizeTrpcBatchBody(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;

  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    normalized[key] = unwrapTrpcJsonEnvelope(value);
  }
  return normalized;
}

export function normalizeTrpcBatchQueryInput(rawInput: unknown): unknown {
  if (typeof rawInput !== "string") return rawInput;

  try {
    const parsed = JSON.parse(rawInput) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return rawInput;

    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      normalized[key] = unwrapTrpcJsonEnvelope(value);
    }
    return JSON.stringify(normalized);
  } catch {
    return rawInput;
  }
}

