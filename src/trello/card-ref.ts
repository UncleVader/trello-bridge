/**
 * Decide whether `:query` is a Trello card id / shortLink (or a card URL
 * that contains one) or an ordinary name query.
 *
 * A shortLink is the 8-character token in `https://trello.com/c/<shortLink>`
 * (optional `/<slug>` after it). Trello also accepts the 24-hex card id on
 * `GET /1/cards/{idOrShortLink}`. Either form identifies one card globally,
 * so the bridge can load it without `X-Trello-Board`.
 *
 * Anything else stays a name query and still needs the board header:
 * prefix-then-substring matching is per board and can be ambiguous.
 */

export type CardRef =
  | { kind: 'id'; id: string }
  | { kind: 'name'; name: string };

/** `/c/<8 alnum>` bounded so a longer token is not truncated into a shortLink. */
const CARD_URL_SHORT_LINK = /\/c\/([A-Za-z0-9]{8})(?=[/?#]|$)/;
const SHORT_LINK = /^[A-Za-z0-9]{8}$/;
const CARD_ID = /^[a-fA-F0-9]{24}$/;

function decodeQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed.includes('%')) return trimmed;
  try {
    return decodeURIComponent(trimmed).trim();
  } catch {
    return trimmed;
  }
}

export function parseCardRef(query: string): CardRef {
  const text = decodeQuery(query);
  const fromUrl = CARD_URL_SHORT_LINK.exec(text);
  if (fromUrl) return { kind: 'id', id: fromUrl[1] };
  if (SHORT_LINK.test(text)) return { kind: 'id', id: text };
  if (CARD_ID.test(text)) return { kind: 'id', id: text };
  return { kind: 'name', name: text };
}
