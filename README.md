# trello-bridge

Localhost-only NestJS HTTP bridge to Trello. Board-agnostic: it wraps the
Trello REST API in a small set of card-oriented endpoints, so an AI
assistant (or any local tool) can read and write cards over plain HTTP
instead of calling the Trello API with credentials of its own. The bridge itself has no configured board.
A name lookup says which board it means via `X-Trello-Board`. A shortLink
or a `https://trello.com/c/<shortLink>` URL does not: the bridge loads that
card directly. The same running instance can serve several projects with
one Trello key/token.

Scope: create a private epic board, read a card, update its description (append/replace), post, edit and delete comments,
create a checklist with items (0.3.0), tick/untick checklist items (0.4.0),
create cards (0.5.0), rename a card and delete a checklist (0.6.0), a
mandatory per-request `X-Trello-Board` header so one running instance can
serve several projects at once (0.8.0), move a card between lists (0.9.0),
move cards between boards and recognize Unicode epic-scoped ticket ids such
as `E2-1C-13` in the duplicate guard (0.10.0), resolve a card by shortLink
or card URL without a board header (0.10.1), full checklist CRUD — append, edit and delete items, rename a checklist — and file attachments (0.12.0).

### `X-Trello-Board` — required for name lookups

The bridge has no default/configured board. `X-Trello-Board` is mandatory
when `:query` is a card name and on `POST /cards`; missing or blank → `400`.
It is optional when `:query` is a shortLink, a 24-hex card id, or a card
URL — those resolve with `GET /1/cards/{id}`. A header that is present is
ignored, so a wrong board does not 404 the card. (`GET /health` never requires the
header, so the Docker `HEALTHCHECK` — which calls it with no headers —
keeps reporting `healthy`.)

```bash
curl -s "http://127.0.0.1:4646/cards/dKOgYxWs?comments=5"
curl -s http://127.0.0.1:4646/cards/TICKET-2 -H 'X-Trello-Board: My Project Board'
```

Requires the same Trello key/token to have access to every board involved —
the header only picks which board, not which credentials. HTTP header
values are ISO-8859-1 only (RFC 7230), so a non-ASCII board name (Cyrillic,
etc.) must be percent-encoded, the same way you'd encode a URL component:

```bash
curl -s http://127.0.0.1:4646/cards/TICKET-2 \
  -H "X-Trello-Board: $(node -e "process.stdout.write(encodeURIComponent(process.argv[1]))" 'Café board ✓')"
```

## Security model

- Binds to `127.0.0.1` only — never exposed beyond the local machine.
- No auth of its own; the Trello key/token stay server-side (loaded from
  a `.env` file or the environment) and are never present in
  request/response bodies or logs.
- If you ever need to bind wider, add token auth first (see the note in
  `src/main.ts`).

## Run

Get an API key and token at https://trello.com/power-ups/admin (Power-Up →
API key → generate a token), then:

```bash
cp .env.example .env   # fill in TRELLO_KEY and TRELLO_TOKEN
npm install
npm run build
npm run start:prod # or: npm run start:dev
```

Server starts on `http://127.0.0.1:4646` (override with `PORT`). Credentials
(`TRELLO_KEY`/`TRELLO_TOKEN`) are picked up from the nearest `.env` in this
directory or any parent directory; real env vars take priority. There is no board env var — name lookups supply their board via
`X-Trello-Board`; a shortLink or card URL does not (see above).

### Docker

```bash
docker build -t trello-bridge .
docker run -d --name trello-bridge \
  --env-file .env \
  -p 127.0.0.1:4646:4646 \
  --restart unless-stopped \
  trello-bridge
```

Credentials are injected via `--env-file` (the walk-up `.env` lookup can't
see host files from inside the container). Inside the container the app
binds `0.0.0.0` (`HOST` env, set in the Dockerfile) — that's required for
the published port to work; localhost-only is preserved by publishing on
`127.0.0.1` explicitly. The image has a `HEALTHCHECK` hitting `/health`
(`docker ps` shows `healthy`). Stop any host instance first — both use
port 4646.

**This port is shared across every local project.** By design, one running
instance on `127.0.0.1:4646` serves all local checkouts of this bridge
(each request supplies its own board via `X-Trello-Board`) — don't start a
second instance from a different project's checkout "just for this repo."
Before starting anything, check what's actually listening:

```bash
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}' | grep trello-bridge
lsof -nP -i :4646   # macOS/Linux: whose process actually holds the port
```

Don't trust the version `/health` reports blindly. A bare
`node`/`npm run start:prod` instance left running from an older checkout
of *any* project can grab port 4646 before Docker's own proxy does, so
`docker ps` shows the container `healthy` while requests are actually
answered by the stale bare process (confirmed incident, 2026-10-24:
`/health` reported `0.10.0` although the container's `package.json` was
`0.10.1` — a leftover bare process from a different project's checkout
had the port). If `/health`'s version doesn't match the container's
`package.json` (`docker exec <container> cat package.json`), look for a
stray bare process first — kill it, then `docker restart <container>` so
Docker's proxy reclaims the port, and re-check `/health`.

## API

`:query` is either a card reference or a card-name query.

- **shortLink / id / URL** — an 8-character shortLink (`dKOgYxWs`), a 24-hex
  card id, or a string containing `/c/<shortLink>` (a full
  `https://trello.com/c/dKOgYxWs` or `…/c/dKOgYxWs/<slug>` URL). Percent-encode
  a URL so it stays a single path segment. The bridge calls
  `GET /1/cards/{idOrShortLink}`. No `X-Trello-Board`. Unknown card → `404`.
  The same `:query` works on comment and checklist routes.
- **Name** — resolved like `CARD_QUERY` in the scripts: case-insensitive
  prefix match first, then substring (`TICKET-2`, `TICKET-2.1`). No match →
  `404`, ambiguous → `409`; both list candidates in the message. Requires
  `X-Trello-Board`; `400` without it.

Trello API failures other than a missing card-by-id surface as `502` with
the upstream status/body.

### `GET /health`

Liveness probe, no `X-Trello-Board` needed. →
`{ "status": "ok", "version": "0.10.1", "board": null }`, or
`{ "status": "ok", "version": "0.10.1", "board": "…" }` if you send the
header — `version` is the running bridge's own `package.json` version (so
you can tell which build is actually deployed without shelling into the
container), `board` just echoes the header back, for a quick sanity check
that percent-encoding round-trips correctly.

### `POST /boards`

Body: `{ "name": "E2: Runner", "description"?: "…", "lists"?: ["Backlog", "Refine", "Coding", "Review", "Done"] }`

Creates a private board without Trello's default lists, then creates the
requested lists in order. `lists` defaults to the status flow shown above.
An exact existing board name or duplicate list names return `409`. This
endpoint does not take `X-Trello-Board`, because the new board is identified
by `name` in the body. →
`{ "board", "shortUrl", "lists" }`

### `GET /cards/:query?comments=N`

Full card state: description, checklists with tick state, latest N comments
(default 5, `comments=0` to skip). By shortLink the board header is omitted:

```bash
curl -s "http://127.0.0.1:4646/cards/dKOgYxWs?comments=5"
curl -s "http://127.0.0.1:4646/cards/$(node -e "process.stdout.write(encodeURIComponent(process.argv[1]))" 'https://trello.com/c/dKOgYxWs')?comments=5"
```

```json
{
  "id": "…", "name": "TICKET-2: Auth module", "shortUrl": "https://trello.com/c/…",
  "description": "…markdown…",
  "checklists": [{ "name": "Build", "items": [{ "name": "…", "state": "complete" }] }],
  "comments": [{ "id": "…", "date": "…", "member": "…", "text": "…" }]
}
```

### `PATCH /cards/:query`

Body: `{ "name": "TICKET-46: New title" }`

Renames the card. Rejects a blank/whitespace-only name with `400`. The DTO
is whitelisted to `name` only — it cannot touch the description or any
other field. → `{ "card", "previousName", "name" }` (`card` is the
post-rename name, for chaining; `previousName`/`name` give the diff).

### `PATCH /cards/:query/list`

Body: `{ "list": "Review" }`

Moves the card to a different list, resolved by name (usual
prefix-then-substring rules; `404`/`409` with candidates). `previousList` is
read off the card's own current `idList`, not echoed from the request, so
it reflects where the card actually was. Landing in `Review` or `Done`
(case-insensitive, exact name match against the resolved list) places the
card at the **top** of the list instead of Trello's default bottom — a
card entering a review queue should be the next thing looked at, not
queued behind everything already there. Every other list keeps Trello's
default (bottom). → `{ "card", "previousList", "list" }`

### `PATCH /cards/:query/board`

Body: `{ "board": "E2: Runner", "list": "Backlog" }`

Moves the existing card to a list on another board by updating its Trello
`idBoard` and `idList`; it does not copy/recreate the card, so URL,
description, comments and checklists remain attached. For a name query,
`X-Trello-Board` identifies the source board. For a shortLink or card URL
the source is the card's own board and the header is optional. The target
board/list use the normal matching
rules. A card with the same stable ticket id on the target board returns
`409`. → `{ "card", "previousBoard", "board", "list", "shortUrl" }`

### `PATCH /cards/:query/description`

Body: `{ "content": "…markdown…", "mode": "append" | "replace", "separator"?: "…" }`

`mode` defaults to `append`: content is added below the existing description
under the same `**Update — implementation notes:**` divider the scripts use —
nothing is lost. `replace` overwrites the whole description. → `{ "card", "mode", "length" }`

### `POST /cards/:query/comments`

Body: `{ "text": "…" }`. Posts a timestamped comment — the right way to log a
status update ("e2e tests passed locally") instead of re-editing the
description. → `{ "card", "id" }` (`id` is the comment id for the routes below)

### `PATCH /cards/:query/comments/:commentId`

Body: `{ "text": "…" }`. Replaces the text of one comment. `:commentId` is the
`id` from `GET /cards/:query` or `POST …/comments`. The bridge checks the id
is a comment on this card first: another card's comment or a non-comment
action → `404`. Trello lets the token owner change only their own comments;
otherwise → `403`. → `{ "card", "id", "previousText" }`

### `DELETE /cards/:query/comments/:commentId`

Deletes one comment, same checks and errors as `PATCH`. Trello keeps no
trash for comments, so the response carries the deleted text.
→ `{ "card", "id", "deletedText" }`

### `POST /cards/:query/checklists`

Body: `{ "name"?: "Build", "items": ["…", "…"] }`

Creates a checklist (default name `Build`) with unticked items in the given order. `409` if a checklist
with that name already exists on the card (case-insensitive) — delete it on
the board or pick another name. → `{ "card", "checklist", "items" }`

### `POST /cards/:query/checklists/:name/items`

Body: `{ "items": ["…", "…"] }`

Appends unticked items to the bottom of an existing checklist (0.12.0+).
`:name` is resolved like in `DELETE` below (`404` no match, `409`
ambiguous; percent-encode spaces). Items already on that checklist
(case-insensitive, trimmed) and repeats inside the request are skipped, so
a retry does not duplicate them. To start a new checklist use
`POST /cards/:query/checklists`. → `{ "card", "checklist", "added": [...], "skipped": [...] }`

### `PATCH /cards/:query/checklists/:name`

Body: `{ "name": "New title" }`

Renames a checklist (`:name` matched as below). `409` if another checklist
on the card already has that name. → `{ "card", "previousName", "checklist" }`

### `PATCH /cards/:query/checklists/:name/items/:item`

Body: `{ "name"?: "new text", "state"?: "complete" | "incomplete" }` (at least one)

Edits one item. `:item` is matched by name inside that checklist
(prefix-then-substring, `404` / `409`; percent-encode it — a short unique
prefix is enough). → `{ "card", "checklist", "previousName", "item": { "name", "state" } }`

### `DELETE /cards/:query/checklists/:name/items/:item`

Deletes one item, matched the same way. → `{ "card", "checklist", "item" }`

### `DELETE /cards/:query/checklists/:name`

Deletes one checklist by name (`:name` resolved with the same
prefix-then-substring rules as `:query`; `404` no match, `409` ambiguous,
both listing candidates). If several checklists match but exactly one is
an *exact* (case-insensitive) name match — e.g. `"Build"` next to `"Build
v2 (Cryptomus)"`, where every query matching the former also matches the
latter — the exact match wins instead of 409ing (`matchByName`, shared by
every `:query` endpoint). Deleting a checklist that does not exist is a
`404`, not a silent success. → `{ "card", "checklist", "itemsDeleted" }`

### `POST /cards/:query/attachments`

Multipart: `file` (required, up to 10 MB), `name`? (defaults to the file
name), `replace`? (`true` / `false`).

```bash
curl -s -X POST "http://127.0.0.1:4646/cards/322utD2h/attachments" \
  -F "file=@docs/integrations/isu-response.md;type=text/markdown" -F replace=true
```

Uploads a file as an attachment (never as the cover). An attachment with
the same name (case-insensitive) is `409` unless `replace=true`; then the
new file is uploaded first and the old one is deleted only after that, so
a failed upload never leaves the card without the file.
→ `{ "card", "attachment": { "id", "name", "url", "bytes", "date", "mimeType" }, "replaced" }`

`GET /cards/:query` lists `attachments` in the same shape. Trello serves
attachment `url`s only to authorized members of the board.

### `DELETE /cards/:query/attachments/:name`

Deletes one attachment by name (prefix-then-substring, `404` / `409`).
→ `{ "card", "attachment" }`

### `PATCH /cards/:query/checkitems`

Body: `{ "items"?: ["…", "…"], "all"?: true, "checklist"?: "Build", "state"?: "complete" | "incomplete" }`

Ticks (default `state: "complete"`) or unticks checklist items. Provide
exactly one of `items` — item-name queries, each resolved with the same
prefix-then-substring rules as `:query` (404 on no match, 409 on ambiguity)
— or `all: true` to set every item.
`checklist` scopes matching to one checklist by name (case-insensitive);
omit to match across all of the card's checklists. Items already in the
target state are counted in `alreadyInState`, not re-written.
→ `{ "card", "state", "updated": ["…"], "alreadyInState" }`

### `POST /cards`

Body: `{ "name": "TICKET-12: Title", "list": "Backlog", "description"?: "…", "checklist"?: { "name"?: "Build", "items": ["…"] } }`

Creates a card in the list (resolved by name, usual prefix-then-substring
rules; 404/409 with candidates). Duplicate guard recognizes legacy ids
(`1C-12`, `WEB-8`, `FB-2.1`), epic ids (`E2`) and epic-scoped ids
(`E2-1C-13`) and returns `409` even when the existing card has a different
title; non-ticket names are compared exactly. `checklist` creates a checklist on the new card in the
same shape as `POST /cards/:query/checklists`.
→ `{ "card", "list", "shortUrl", "checklist": { "name", "items" } | null }`

## Examples

```bash
BOARD='My Project Board'

curl -s "http://127.0.0.1:4646/cards/dKOgYxWs?comments=5" | jq .
curl -s -X POST http://127.0.0.1:4646/cards/dKOgYxWs/comments \
  -H 'Content-Type: application/json' \
  -d '{"text": "e2e tests passed locally"}'

curl -s http://127.0.0.1:4646/cards/TICKET-2 -H "X-Trello-Board: $BOARD" | jq .
curl -s "http://127.0.0.1:4646/cards/TICKET-2.1?comments=0" -H "X-Trello-Board: $BOARD" | jq .description -r

curl -s -X PATCH http://127.0.0.1:4646/cards/TICKET-2/description \
  -H "X-Trello-Board: $BOARD" \
  -H 'Content-Type: application/json' \
  -d '{"content": "New notes here", "mode": "append"}'

curl -s -X POST http://127.0.0.1:4646/cards/TICKET-2/comments \
  -H "X-Trello-Board: $BOARD" \
  -H 'Content-Type: application/json' \
  -d '{"text": "e2e tests passed locally"}'

curl -s -X PATCH http://127.0.0.1:4646/cards/TICKET-46 \
  -H "X-Trello-Board: $BOARD" \
  -H 'Content-Type: application/json' \
  -d '{"name": "TICKET-46: New title"}'

curl -s -X DELETE "http://127.0.0.1:4646/cards/TICKET-46/checklists/Build" -H "X-Trello-Board: $BOARD"

curl -s -X PATCH http://127.0.0.1:4646/cards/TICKET-46/list \
  -H "X-Trello-Board: $BOARD" \
  -H 'Content-Type: application/json' \
  -d '{"list": "Review"}'
```

## Tests

```bash
npm test
```

Unit tests (Jest + ts-jest) cover the card/board matcher, description
composition, service behavior with a mocked Trello client, and env
validation. No e2e suite: the only external dependency is the Trello API,
which is mocked.

## Edge cases

- Long descriptions are sent in the form-encoded request **body**, not the
  URL — descriptions in the query string previously hit Trello CloudFront's
  HTTP 414 limit.
- The board id is cached per process; restart the bridge if the board is
  renamed.
- Rebuilding after source changes: `npm run build` (output in `dist/`).

## License

MIT — see [LICENSE](LICENSE).
