import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { z } from 'zod';

/**
 * Environment loading & validation.
 *
 * Walks up from this project's root looking
 * for a `.env` file, so the bridge picks up a sibling `.env` (TRELLO_KEY /
 * TRELLO_TOKEN) without duplicating credentials. Values already present in
 * the real environment always win.
 *
 * No board is configured here at all. Name lookups carry their own
 * `X-Trello-Board` header (required, 400 without it) — see
 * `CardsService.resolveBoardId`. A shortLink or card URL does not: the
 * bridge loads the card directly. That's what lets one running instance
 * serve several projects/boards with the same credentials.
 */

const envSchema = z.object({
  TRELLO_KEY: z.string().min(1, 'TRELLO_KEY is required'),
  TRELLO_TOKEN: z.string().min(1, 'TRELLO_TOKEN is required'),
  PORT: z.coerce.number().int().positive().default(4646),
});

export type Env = z.infer<typeof envSchema>;

/** Parse KEY=VALUE lines; ignores comments/blank lines; strips quotes. */
function parseDotenv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    const key = line.slice(0, idx).trim();
    const value = line
      .slice(idx + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    out[key] = value;
  }
  return out;
}

/**
 * Load `.env` files by walking up from `startDir` until the filesystem root.
 * Files closer to `startDir` take priority over files further up; the real
 * environment takes priority over all files.
 */
export function loadDotenvUpwards(startDir: string): void {
  let dir = resolve(startDir);
  for (;;) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      const parsed = parseDotenv(readFileSync(candidate, 'utf-8'));
      for (const [key, value] of Object.entries(parsed)) {
        if (process.env[key] === undefined) process.env[key] = value;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

/** Validate the (already loaded) environment; throws with a clear message. */
export function validateEnv(raw: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${details}`);
  }
  return result.data;
}
