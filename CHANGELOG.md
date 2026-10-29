# Changelog — trello-bridge

## 0.13.0 — 2026-10-29

- `GET /cards` (with `X-Trello-Board`) lists every open card on the board
  with the list it sits in, in board list order:
  `[{ "name", "shortUrl", "list" }]`. `?list=` narrows to one list (matched
  by name like every `:query`, 404 / 409). Replaces the "409 on a prefix"
  trick for seeing what is on a board.
- `GET /cards/:query` now returns `list` — the name of the card's list.

## 0.12.0 — 2026-10-29

- Items can be appended to an existing checklist:
  `POST /cards/:query/checklists/:name/items` (body `{ "items": ["…"] }`).
  `:name` resolves like `DELETE /cards/:query/checklists/:name` (404 / 409).
  New items go to the bottom, unticked, in order; items already on that
  checklist (case-insensitive, trimmed) are skipped, so a re-run does not
  duplicate them. → `{ "card", "checklist", "added", "skipped" }`.
- Full checklist CRUD: `PATCH /cards/:query/checklists/:name` renames a
  checklist (409 on a clash); `PATCH /cards/:query/checklists/:name/items/:item`
  changes an item's text and/or state; `DELETE …/items/:item` deletes one
  item. Checklist and item are matched by name like every `:query`.
- Attachments: `POST /cards/:query/attachments` (multipart field `file`,
  optional `name`, `replace=true`) uploads a file up to 10 MB. Same name is
  409 unless `replace=true`; replace uploads the new file first and deletes
  the old one only after that. `DELETE /cards/:query/attachments/:name`
  deletes one. `GET /cards/:query` now lists `attachments`
  (`id`, `name`, `url`, `bytes`, `date`, `mimeType`).
- 110 unit tests total across 8 suites.

## 0.11.0 — 2026-10-29

- Comments can be edited and deleted: `PATCH /cards/:query/comments/:commentId`
  (body `{ "text": "…" }`) and `DELETE /cards/:query/comments/:commentId`.
  The bridge first checks that the id is a comment on *that* card — an id
  from another card or a non-comment action is `404`, never a silent change
  elsewhere. Trello allows changing only the token owner's own comments; its
  refusal comes back as `403`. Responses carry the previous / deleted text.
- `GET /cards/:query` comments now include `id`; `POST /cards/:query/comments`
  returns `{ "card", "id" }`.
- 99 unit tests total across 8 suites.

## 0.10.1 — 2026-09-26

- `:query` accepts a Trello shortLink (`dKOgYxWs`), a 24-hex card id, or a
  card URL containing `/c/<shortLink>` (percent-encode the URL so it is one
  path segment). The bridge loads that card with `GET /1/cards/{id}` and
  does not require `X-Trello-Board` — a wrong or missing board header no
  longer hides the card. Comments, checklists and the other `:query`
  routes use the same resolution. Name queries are unchanged: still
  prefix-then-substring on the board from the header, `400` without it,
  `409` when the name is ambiguous.
- 93 unit tests total across 8 suites.

## 0.10.0 — 2026-08-22

- Added `POST /boards` to create a private epic board with an explicit
  ordered list set (default: `Backlog`, `Refine`, `Coding`, `Review`,
  `Done`) and an exact-name duplicate guard.
- Added `PATCH /cards/:query/board` for identity-preserving cross-board
  moves using Trello `idBoard` + `idList`. The source board remains explicit
  in `X-Trello-Board`; target board and list are explicit in the body.
- Replaced the ASCII-only ticket regex with a Unicode-aware stable-id
  extractor. Duplicate protection now covers legacy `1C-12`/`WEB-8`, epic
  `E2` and epic-scoped `E2-1C-13` ids even after a card title changes.
- Cross-board moves check the target board for the same stable id before
  changing anything.
- 80 unit tests total across 7 suites; strict Nest/TypeScript build is green.

## 0.9.2 — 2026-08-21

- `GET /health` now returns `version` (the bridge's own `package.json`
  version) alongside `status`/`board`, so a caller can tell which build is
  actually running without shelling into the container. Read via
  `require('../package.json')` at runtime, which needed the final Docker
  stage to also copy `package.json` (previously only `node_modules` and
  `dist` were copied — the compiled `dist/health.controller.js` had no
  `package.json` one level up to read).
- 64 unit tests total (was 62; net new coverage: `HealthController` — ok
  status with and without a board header, both carrying `version`).

## 0.9.1 — 2026-08-21

- FT-2: (bridge — move a card between lists) a card moved into `Review` or
  `Done` (case-insensitive exact match on the resolved list name) now
  lands at the **top** of the list (`pos: "top"` on the underlying Trello
  `PUT`) instead of Trello's default bottom — those are review queues, so
  the newest arrival should be the next thing looked at, not queued behind
  everything already there. Every other list keeps the default bottom
  placement. `TrelloClientService.moveCard` takes an optional `pos`
  parameter; `CardsService.moveCard` decides it via the new
  `TOP_ON_MOVE_INTO_LISTS` constant.
- 62 unit tests total (was 60; net new coverage: top-of-list placement
  into Review/Done, no forced position for lists outside that set).

## 0.9.0 — 2026-08-21

- FT-2: (bridge — move a card between lists) `PATCH /cards/:query/list` — moves a card to a different list, both
  resolved by name (same prefix-then-substring rules as every other
  `:query`; `404`/`409` with candidates on miss/ambiguity). Added because
  the board-status workflow (`Backlog`/`Refine`/`Vadym`/`Oleg`/`Review`/
  `Done`, plus per-project lists like `Swamp` for dead/superseded cards)
  needed a way to move a card without leaving the bridge for a one-off
  script — every other per-card operation already went through it.
  `TrelloCard` gained an `idList` field (now requested on every
  `listCards`/`listLists` call) so `previousList` in the response reflects
  the card's real prior list rather than a caller-echoed value.
- 60 unit tests total (was 55; net new coverage for `moveCard`: happy
  path, idempotent same-list move, unknown card, unknown list, ambiguous
  list query).

## 0.8.0 — 2026-08-13

- **Breaking:** dropped `TRELLO_BOARD_NAME` entirely — the bridge no longer
  has a configured/default board. Every `/cards` request now supplies its
  own board via the `X-Trello-Board` header (`400` if missing/blank),
  percent-encoded (`encodeURIComponent`) since HTTP header values are
  ISO-8859-1 only (RFC 7230) and board names may be non-ASCII (Cyrillic,
  etc.) — `decodeBoardHeader()` decodes it back on the way in, falling back
  to the raw value on a malformed sequence rather than 500ing. Lets one
  running instance serve several projects with the same Trello key/token,
  each always explicit about which board it means — no silent default to
  get wrong. `GET /health` is the one exception: still always `200` with no
  header required (so the Docker `HEALTHCHECK`, which calls it with no
  headers, keeps reporting `healthy`); `board` in its response just echoes
  the header back if one was sent, `null` otherwise.
- 55 unit tests total (was 48; net new coverage for the header
  decode/require behavior, offset by dropping the now-irrelevant
  configured-board tests).

## 0.7.0 — 2026-08-13

- Ported into the `dieselservice-conf` project (previously lived in a
  different project's repo). Genericized as part of the move: `TRELLO_BOARD_NAME`
  is now required with no default — it previously defaulted to the
  originating project's board name, which would have silently pointed the
  bridge at the wrong board here. Package name, description, and Docker
  image tag no longer reference the originating project either; the bridge
  is now a board-agnostic drop-in tool, configured entirely via `.env`.
- fix: an unresolvable/ambiguous `TRELLO_BOARD_NAME` (e.g. wrong or
  unmatched board name) now maps to `404`/`409` like every other `:query`,
  instead of an opaque `500 Internal server error`. `TrelloClientService
  .findBoardId`'s `NoMatchError`/`AmbiguousMatchError` went uncaught before
  reaching `CardsService`'s existing `matchOrThrow` mapping — new
  `resolveBoardId()` wraps both board-lookup call sites with the same
  mapping. Surfaced now that the board name has no default and misconfigured
  boards are a real, reachable case rather than a near-impossible one.
- 48 unit tests total (was 46).

## 0.6.1 — 2026-08-12

- `matchByName` (shared by every `:query` endpoint — cards, lists, check
  items, checklists) now prefers an exact case-insensitive name match over
  throwing `AmbiguousMatchError` when multiple candidates match by prefix
  or substring. Fixes the limitation found while shipping 0.6.0: a
  checklist named `"Build"` next to one named `"Build v2 (Cryptomus)"`
  could never be selected on its own, because `"Build"` is a strict prefix
  of the other name and every query matching it also matched the other.
  Still 409s when zero or more than one candidate is an exact match (e.g.
  two checklists both literally named `"Build"`).
- 45 unit tests total (was 40).

## 0.6.0 — 2026-08-12

- FT-1: (bridge — rename card, delete checklist) New endpoints:
  `PATCH /cards/:query` renames a card (blank/whitespace name → 400; the
  DTO whitelist keeps it from touching any other field, e.g. `desc`) and
  `DELETE /cards/:query/checklists/:name` deletes one checklist by name
  (same prefix-then-substring matching as every other `:query`; 404 no
  match, 409 ambiguous). `TrelloClientService.request` now accepts
  `DELETE`; `TrelloChecklist` gained an `id` field (the read path
  previously only needed names/item state) — `GET /cards/:query` still
  does not leak checklist ids into its response shape.
- Closes the gap that forced `scripts/oneoff/finish_cryptomus_rewrite.py`
  to exist: the 2026-08-12 crypto-first (Cryptomus) rewrite needed to
  rename six cards and delete a superseded `Build` checklist, and the
  bridge could do neither over HTTP. That script is now dead weight and
  is deleted in this release.
- Known limitation found while finishing that cleanup: `DELETE
  /cards/:query/checklists/:name`'s prefix-then-substring matching cannot
  disambiguate `"Build"` from `"Build v2 (Cryptomus)"` on the same card —
  `"Build"` is a strict prefix of the other name, so no query string
  matches one without the other, and the request 409s. The six renames
  went through the bridge; the six stale-`"Build"`-checklist deletions
  were done with a direct, one-off Trello API call (checklist looked up
  by exact name via `GET /cards/{id}/checklists`, deleted by id) rather
  than the bridge endpoint. Not fixed here — `matchByName` is shared by
  every `:query` endpoint (cards, lists, check items), so widening it to
  prefer an exact match over a prefix match is a separate, broader change
  than this ticket scoped.
- 40 unit tests total (was 33).

- FB-17: Node runtime upgrade to v22. `Dockerfile` (both stages) bumped
  `node:20-alpine` → `node:22-alpine`; `package.json` gained
  `"engines": { "node": ">=22.0.0" }` (none before). Verified under Node
  22.20.0: `npm ci`, `npm run build`, `npm test` (3/3 suites, 33/33 tests)
  all green, no code changes required.

## 0.5.0 — 2026-07-11

- New endpoint: `POST /cards` — create a card in a list (resolved by
  name, usual prefix-then-substring rules), with optional description
  and checklist (same shape as `POST /cards/:query/checklists`).
  Duplicate guard mirrors the create_* scripts: a name starting with a
  ticket id ("FB-12: …") is rejected with 409 if any card already
  carries that ticket id; non-ticket names 409 only on an exact match.
  The bridge now covers every per-card operation; the Python scripts
  remain for bulk FF-card workflows.
- `matchOrThrow` helper: the matchByName→404/409 mapping is now shared
  by card, list, and check-item resolution.
- 33 unit tests total (was 29).

## 0.4.0 — 2026-07-11

- New endpoint: `PATCH /cards/:query/checkitems` — tick (default) or
  untick (`state: "incomplete"`) checklist items. Body takes either
  `items` (each query resolved with the same prefix-then-substring rules
  as `:query`; 404/409 on miss/ambiguity) or `all: true` (the `ALL=1`
  mode of `mark_checklist_items.py`), optionally scoped to one
  `checklist` by name. Items already in the target state are counted,
  not re-written. Checklist ticking no longer requires the Python
  scripts; only card creation still does.
- 29 unit tests total (was 25).

## 0.3.0 — 2026-07-11

- New endpoint: `POST /cards/:query/checklists` — creates a checklist
  (default name `Build`) with unticked items in the given order. 409 if a
  checklist with that name (case-insensitive) already exists on the card,
  mirroring the create_* scripts' don't-duplicate-on-re-run stance. Items
  are created sequentially so Trello preserves ordering.
- 25 unit tests total (was 23).
- Note for assistant environments: the Cowork sandbox cannot reach the
  host's `127.0.0.1` (shell and web_fetch both fail silently) — the working
  path from Cowork is the Claude in Chrome extension (`javascript_tool`
  fetch against `http://127.0.0.1:4646`). Claude Code on the host reaches
  the bridge directly.

## 0.2.0 — 2026-07-11

- Docker support: multi-stage `Dockerfile` (`node:20-alpine`, prod-only
  deps, non-root, `HEALTHCHECK` on `/health`) + `.dockerignore`.
  Credentials via `--env-file ../.env`; port published on `127.0.0.1`
  only.
- `main.ts`: bind host configurable via `HOST` env (default stays
  `127.0.0.1`; the Dockerfile sets `0.0.0.0` inside the container, where
  localhost-only is enforced by the port publish instead).
- Verified end-to-end from the container: read card FB-11:, replaced its
  (empty) description from the new `cards/backend/fb11_description.md`,
  posted a status comment, read it back.

## 0.1.1 — 2026-07-11

- fix: load `.env` (walk-up) in `app.module.ts` before the `@Module`
  decorator instead of inside `bootstrap()` — `ConfigModule.forRoot()`
  runs at import time, so validation fired against an empty
  `process.env` and startup failed with "TRELLO_KEY: Required" even
  when `trello/.env` was present.

## 0.1.0 — 2026-07-11

- Initial version: localhost-only NestJS bridge to the "Flexi Bro" Trello
  board, replacing per-task script invocations with a local HTTP API.
- Endpoints: `GET /health`, `GET /cards/:query` (description + checklists +
  comments), `PATCH /cards/:query/description` (append/replace, same
  append divider as `scripts/update_trello_card.py`), `POST
  /cards/:query/comments`.
- Card/board resolution ported from `trello_lib.py` (prefix → substring,
  404 on no match, 409 on ambiguous match, candidates listed).
- Credentials reused from `trello/.env` via walk-up dotenv loading; env
  validated with zod (fail-fast). Binds to `127.0.0.1` only.
- 23 unit tests (matcher, description composition, service with mocked
  Trello client, env validation); `tsc --strict` clean.
