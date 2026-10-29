/**
 * Extract a stable card id from the mandatory `ID: title` prefix.
 *
 * Supported forms:
 * - family ids: `1C-12`, `WEB-8`, `FB-2.1`, `EPIC-1`;
 * - epic ids: `E2`;
 * - epic-scoped ids: `E2-1C-13`, `E2-WEB-9`.
 *
 * Family and epic codes are not restricted to ASCII (Unicode property
 * escapes): boards in other scripts use look-alike letters, e.g. Cyrillic
 * U+0415 for the epic `E` and U+0421 for `C`. Both the Latin and the
 * Cyrillic epic letter are recognized.
 */
const TICKET_ID_PATTERN =
  /^((?:[E\u0415]\d+(?:-[\p{L}\d]+-[\p{L}\d.]+)?|[\p{L}\d]+-[\p{L}\d.]+)):/iu;

export function extractTicketId(name: string): string | null {
  const match = TICKET_ID_PATTERN.exec(name.trim().normalize('NFC'));
  return match ? match[1].toLocaleLowerCase() : null;
}

/** True when two names represent the same stable card identity. */
export function sameCardIdentity(left: string, right: string): boolean {
  const leftId = extractTicketId(left);
  const rightId = extractTicketId(right);
  if (leftId !== null || rightId !== null) {
    return leftId !== null && leftId === rightId;
  }
  return (
    left.trim().normalize('NFC').toLocaleLowerCase() ===
    right.trim().normalize('NFC').toLocaleLowerCase()
  );
}
