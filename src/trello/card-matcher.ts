/**
 * Name-matching logic shared by board/card lookups.
 *
 * Prefix match first, then substring match; a query that matches nothing or matches more
 * than one item is an error (listing candidates) rather than a guess.
 */

export interface Named {
  name: string;
}

export class NoMatchError extends Error {
  constructor(
    public readonly query: string,
    public readonly candidates: string[],
  ) {
    super(
      `No item matching "${query}" found. Available: ${candidates.join(', ')}`,
    );
    this.name = 'NoMatchError';
  }
}

export class AmbiguousMatchError extends Error {
  constructor(
    public readonly query: string,
    public readonly candidates: string[],
  ) {
    super(
      `"${query}" matches multiple items, be more specific: ${candidates.join(', ')}`,
    );
    this.name = 'AmbiguousMatchError';
  }
}

/**
 * Resolve `query` against `items` by name.
 *
 * - Tries case-insensitive prefix matches first; falls back to substring.
 * - Exactly one match → returned.
 * - Multiple matches, but exactly one is an exact (case-insensitive,
 *   trimmed) match → that one is returned rather than treated as ambiguous.
 *   Needed for names that are themselves a prefix of another name on the
 *   same board/card — e.g. a checklist named "Build" next to one named
 *   "Build v2 (Cryptomus)": every query that matches "Build" also matches
 *   "Build v2 (Cryptomus)", so without this, "Build" could never be
 *   selected on its own.
 * - Zero matches → NoMatchError (lists every item name).
 * - Multiple matches, none or more than one exact → AmbiguousMatchError
 *   (lists the conflicting names).
 */
export function matchByName<T extends Named>(items: T[], query: string): T {
  const q = query.trim().toLowerCase();
  let matches = items.filter((i) => i.name.trim().toLowerCase().startsWith(q));
  if (matches.length === 0) {
    matches = items.filter((i) => i.name.trim().toLowerCase().includes(q));
  }
  if (matches.length === 0) {
    throw new NoMatchError(
      query,
      items.map((i) => i.name),
    );
  }
  if (matches.length > 1) {
    const exact = matches.filter((i) => i.name.trim().toLowerCase() === q);
    if (exact.length === 1) {
      return exact[0];
    }
    throw new AmbiguousMatchError(
      query,
      matches.map((i) => i.name),
    );
  }
  return matches[0];
}
