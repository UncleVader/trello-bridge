/**
 * HTTP header values are restricted to ISO-8859-1 (RFC 7230) — a raw
 * non-ASCII board name (e.g. Cyrillic) in `X-Trello-Board` either gets
 * mangled in transit or rejected outright by strict HTTP clients. Callers
 * must percent-encode the value (`encodeURIComponent`); this decodes it
 * back on the way in. A malformed sequence falls back to the raw value
 * rather than failing the request — board resolution will 404 on it either
 * way, with a clearer error than a decode exception would give.
 */
export function decodeBoardHeader(raw?: string): string | undefined {
  if (raw === undefined) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
