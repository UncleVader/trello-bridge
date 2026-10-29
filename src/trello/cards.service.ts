import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AmbiguousMatchError,
  matchByName,
  Named,
  NoMatchError,
} from './card-matcher';
import { parseCardRef } from './card-ref';
import { decodeBoardHeader } from './board-header';
import {
  AttachmentUpload,
  TrelloAttachment,
  TrelloCard,
  TrelloChecklist,
  TrelloClientService,
  TrelloComment,
  TrelloUpstreamException,
} from './trello-client.service';
import { DescriptionMode } from './dto/update-description.dto';
import { CheckItemState } from './dto/update-checkitems.dto';
import { sameCardIdentity } from './ticket-id';

/** Divider placed between the old and the new text in append mode. */
export const APPEND_SEPARATOR =
  '\n\n---\n\n**Update — implementation notes:**\n\n';

/**
 * Lists where a freshly-moved-in card should land at the top rather than
 * Trello's default (bottom): these are review queues, so the newest arrival
 * — the thing most likely to need a look next — should be the first thing
 * a human sees, not buried under everything already sitting there.
 */
export const TOP_ON_MOVE_INTO_LISTS = ['review', 'done'];

/** One row of `GET /cards`: a card and the list it sits in. */
export interface CardSummary {
  name: string;
  shortUrl: string;
  list: string;
}

export interface CardView {
  id: string;
  name: string;
  shortUrl: string;
  /** Name of the list the card sits in. */
  list: string;
  description: string;
  checklists: {
    name: string;
    items: { name: string; state: 'complete' | 'incomplete' }[];
  }[];
  comments: TrelloComment[];
  attachments: TrelloAttachment[];
}

/** Compose the new description; exported for direct unit testing. */
export function composeDescription(
  existing: string,
  content: string,
  mode: DescriptionMode,
  separator: string = APPEND_SEPARATOR,
): string {
  const next = content.trim();
  if (mode === 'replace') return next;
  const current = existing.trim();
  return current ? `${current}${separator}${next}` : next;
}

@Injectable()
export class CardsService {
  constructor(private readonly trello: TrelloClientService) {}

  /** NoMatchError → 404, AmbiguousMatchError → 409 (both list candidates);
   * anything else rethrown as-is. Shared by matchOrThrow and board
   * resolution, which hits the same matchByName under the hood. */
  private mapMatchError(err: unknown): never {
    if (err instanceof NoMatchError) {
      throw new NotFoundException(err.message);
    }
    if (err instanceof AmbiguousMatchError) {
      throw new ConflictException(err.message);
    }
    throw err;
  }

  /** matchByName with its errors mapped to HTTP: no match → 404,
   * ambiguous → 409 (both list candidates). */
  private matchOrThrow<T extends Named>(items: T[], query: string): T {
    try {
      return matchByName(items, query);
    } catch (err) {
      this.mapMatchError(err);
    }
  }

  /** Resolve the board id from the `X-Trello-Board` header — mandatory, no
   * fallback: the bridge has no notion of a "default" board, so every
   * project sharing one instance must always say which board it means.
   * Missing/blank → 400. A board name the header points at but that
   * doesn't resolve on Trello gets the same 404/409 mapping as any other
   * :query. */
  private async resolveBoardId(boardOverride?: string): Promise<string> {
    const boardName = decodeBoardHeader(boardOverride)?.trim();
    if (!boardName) {
      throw new BadRequestException(
        'X-Trello-Board header is required (percent-encoded board name).',
      );
    }
    try {
      return await this.trello.findBoardId(boardName);
    } catch (err) {
      this.mapMatchError(err);
    }
  }

  /** Direct Trello lookup by shortLink or card id. A missing card is 404;
   * any other upstream failure stays a 502. */
  private async fetchCardById(id: string): Promise<TrelloCard> {
    try {
      return await this.trello.getCardById(id);
    } catch (err) {
      if (err instanceof TrelloUpstreamException && err.upstreamStatus === 404) {
        throw new NotFoundException(`No card matching shortLink or id "${id}".`);
      }
      throw err;
    }
  }

  /**
   * shortLink, 24-hex card id, or a URL containing `/c/<shortLink>`: load
   * that card directly. `X-Trello-Board` is ignored — the id is global, and
   * a wrong board header must not hide the card.
   * Anything else: prefix-then-substring name match on the board from the
   * header (required).
   */
  private async resolveCard(
    query: string,
    boardOverride?: string,
  ): Promise<TrelloCard> {
    const ref = parseCardRef(query);
    if (ref.kind === 'id') {
      return this.fetchCardById(ref.id);
    }
    const boardId = await this.resolveBoardId(boardOverride);
    const cards = await this.trello.listCards(boardId);
    return this.matchOrThrow(cards, ref.name);
  }

  /**
   * Every open card on the board with its list, in board list order. An
   * optional list query (prefix-then-substring, 404 / 409) narrows it to
   * one list.
   */
  async listBoardCards(
    boardOverride?: string,
    listQuery?: string,
  ): Promise<CardSummary[]> {
    const boardId = await this.resolveBoardId(boardOverride);
    const [cards, lists] = await Promise.all([
      this.trello.listCards(boardId),
      this.trello.listLists(boardId),
    ]);
    const shown = listQuery?.trim()
      ? [this.matchOrThrow(lists, listQuery.trim())]
      : lists;
    return shown.flatMap((l) =>
      cards
        .filter((c) => c.idList === l.id)
        .map((c) => ({ name: c.name, shortUrl: c.shortUrl, list: l.name })),
    );
  }

  /** Full card state: description + checklists (tick state) + comments. */
  async getCard(
    query: string,
    commentLimit: number,
    boardOverride?: string,
  ): Promise<CardView> {
    const card = await this.resolveCard(query, boardOverride);
    const [list, checklists, comments, attachments] = await Promise.all([
      this.trello.getList(card.idList),
      this.trello.getChecklists(card.id),
      commentLimit > 0
        ? this.trello.getComments(card.id, commentLimit)
        : Promise.resolve([]),
      this.trello.getAttachments(card.id),
    ]);
    return {
      id: card.id,
      name: card.name,
      shortUrl: card.shortUrl,
      list: list.name,
      description: card.desc ?? '',
      checklists: checklists.map((cl: TrelloChecklist) => ({
        name: cl.name,
        items: cl.checkItems.map((i) => ({ name: i.name, state: i.state })),
      })),
      comments,
      attachments,
    };
  }

  async updateDescription(
    query: string,
    content: string,
    mode: DescriptionMode,
    separator?: string,
    boardOverride?: string,
  ): Promise<{ card: string; mode: DescriptionMode; length: number }> {
    const card = await this.resolveCard(query, boardOverride);
    const next = composeDescription(card.desc ?? '', content, mode, separator);
    await this.trello.updateDescription(card.id, next);
    return { card: card.name, mode, length: next.length };
  }

  async addComment(
    query: string,
    text: string,
    boardOverride?: string,
  ): Promise<{ card: string; id: string }> {
    const card = await this.resolveCard(query, boardOverride);
    const comment = await this.trello.addComment(card.id, text);
    return { card: card.name, id: comment.id };
  }

  /**
   * Resolve the card and check that `commentId` is a comment on *that*
   * card before touching it: an id copied from another card must be a 404,
   * not a silent edit/delete elsewhere. Trello's 404/400 on a bad id → 404.
   */
  private async resolveComment(
    query: string,
    commentId: string,
    boardOverride?: string,
  ): Promise<{ card: TrelloCard; previousText: string }> {
    const card = await this.resolveCard(query, boardOverride);
    let action: Awaited<ReturnType<TrelloClientService['getAction']>>;
    try {
      action = await this.trello.getAction(commentId);
    } catch (err) {
      if (
        err instanceof TrelloUpstreamException &&
        (err.upstreamStatus === 404 || err.upstreamStatus === 400)
      ) {
        throw new NotFoundException(`No comment with id "${commentId}".`);
      }
      throw err;
    }
    if (action.type !== 'commentCard' || action.idCard !== card.id) {
      throw new NotFoundException(
        `No comment with id "${commentId}" on card "${card.name}".`,
      );
    }
    return { card, previousText: action.text ?? '' };
  }

  /** Trello lets a member edit/delete only their own comments: 401/403 from
   * upstream is a 403 here, not a 502. */
  private mapCommentWriteError(err: unknown, commentId: string): never {
    if (
      err instanceof TrelloUpstreamException &&
      (err.upstreamStatus === 401 || err.upstreamStatus === 403)
    ) {
      throw new ForbiddenException(
        `Trello refused to change comment "${commentId}" (only the author's own comments can be changed).`,
      );
    }
    throw err;
  }

  /** Replace a comment's text. Response carries the previous text so the
   * caller can log or undo the edit. */
  async updateComment(
    query: string,
    commentId: string,
    text: string,
    boardOverride?: string,
  ): Promise<{ card: string; id: string; previousText: string }> {
    const { card, previousText } = await this.resolveComment(
      query,
      commentId,
      boardOverride,
    );
    try {
      await this.trello.updateComment(card.id, commentId, text);
    } catch (err) {
      this.mapCommentWriteError(err, commentId);
    }
    return { card: card.name, id: commentId, previousText };
  }

  /** Delete a comment. Trello has no trash for comments, so the deleted
   * text is returned for the caller's log. */
  async deleteComment(
    query: string,
    commentId: string,
    boardOverride?: string,
  ): Promise<{ card: string; id: string; deletedText: string }> {
    const { card, previousText } = await this.resolveComment(
      query,
      commentId,
      boardOverride,
    );
    try {
      await this.trello.deleteComment(card.id, commentId);
    } catch (err) {
      this.mapCommentWriteError(err, commentId);
    }
    return { card: card.name, id: commentId, deletedText: previousText };
  }

  /**
   * Rename a card. `card` in the response reflects the post-rename name
   * (useful for chaining); `previousName`/`name` give the explicit diff for
   * logging. Blank/whitespace-only names are rejected before the card is
   * even resolved.
   */
  async renameCard(
    query: string,
    name: string,
    boardOverride?: string,
  ): Promise<{ card: string; previousName: string; name: string }> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException('Card name must not be empty.');
    }
    const card = await this.resolveCard(query, boardOverride);
    const renamed = await this.trello.renameCard(card.id, trimmed);
    return { card: renamed.name, previousName: card.name, name: renamed.name };
  }

  /**
   * Move a card to a different list, both resolved by name
   * (prefix-then-substring, 404/409 on miss/ambiguity). `previousList`
   * comes from the card's current `idList` matched against the board's own
   * list set, so it's always the board's own list name, not a caller-echoed
   * value. Landing in `Review` or `Done` (`TOP_ON_MOVE_INTO_LISTS`) places
   * the card at the top of the list instead of Trello's default bottom —
   * the point of moving something into a review queue is that it gets
   * looked at, not that it queues behind everything already there.
   */
  async moveCard(
    query: string,
    listQuery: string,
    boardOverride?: string,
  ): Promise<{ card: string; previousList: string; list: string }> {
    const ref = parseCardRef(query);
    let boardId: string;
    let card: TrelloCard;
    let lists: { id: string; name: string }[];
    if (ref.kind === 'id') {
      card = await this.fetchCardById(ref.id);
      if (!card.idBoard) {
        throw new BadGatewayException(
          `Trello card "${ref.id}" response has no idBoard.`,
        );
      }
      boardId = card.idBoard;
      lists = await this.trello.listLists(boardId);
    } else {
      boardId = await this.resolveBoardId(boardOverride);
      const [cards, boardLists] = await Promise.all([
        this.trello.listCards(boardId),
        this.trello.listLists(boardId),
      ]);
      card = this.matchOrThrow(cards, ref.name);
      lists = boardLists;
    }
    const target = this.matchOrThrow(lists, listQuery);
    const previous = lists.find((l) => l.id === card.idList);
    const pos = TOP_ON_MOVE_INTO_LISTS.includes(
      target.name.trim().toLowerCase(),
    )
      ? 'top'
      : undefined;
    await this.trello.moveCard(card.id, target.id, pos);
    return {
      card: card.name,
      previousList: previous?.name ?? '?',
      list: target.name,
    };
  }

  /**
   * Move a card between boards without copying it, preserving its Trello id,
   * URL, description, comments and checklists. For a name query the source
   * board is `X-Trello-Board`; for a shortLink/URL the source is the card's
   * own board. The target board/list are explicit in the body.
   */
  async moveCardToBoard(
    query: string,
    targetBoardQuery: string,
    targetListQuery: string,
    boardOverride?: string,
  ): Promise<{
    card: string;
    previousBoard: string;
    board: string;
    list: string;
    shortUrl: string;
  }> {
    const ref = parseCardRef(query);
    const headerBoard = decodeBoardHeader(boardOverride)?.trim();
    let sourceBoardId: string;
    let card: TrelloCard | undefined;
    if (ref.kind === 'id') {
      card = await this.fetchCardById(ref.id);
      if (!card.idBoard) {
        throw new BadGatewayException(
          `Trello card "${ref.id}" response has no idBoard.`,
        );
      }
      sourceBoardId = card.idBoard;
    } else {
      sourceBoardId = await this.resolveBoardId(boardOverride);
    }
    let targetBoardId: string;
    try {
      targetBoardId = await this.trello.findBoardId(targetBoardQuery.trim());
    } catch (err) {
      this.mapMatchError(err);
    }
    if (sourceBoardId === targetBoardId) {
      throw new ConflictException(
        'Source and target board are the same; use PATCH /cards/:query/list.',
      );
    }

    // Source cards are requested first so name-match stays on the same
    // listCards order as before (source, then target).
    const sourceCardsPromise =
      ref.kind === 'name' ? this.trello.listCards(sourceBoardId) : undefined;
    const [targetCards, targetLists] = await Promise.all([
      this.trello.listCards(targetBoardId),
      this.trello.listLists(targetBoardId),
    ]);
    if (ref.kind === 'name') {
      card = this.matchOrThrow(await sourceCardsPromise!, ref.name);
    }
    if (!card) {
      throw new BadGatewayException('Card was not resolved.');
    }
    const previousBoard =
      headerBoard || (ref.kind === 'id' ? sourceBoardId : '?');
    const clash = targetCards.find((candidate) =>
      sameCardIdentity(candidate.name, card.name),
    );
    if (clash) {
      throw new ConflictException(
        `Card "${clash.name}" already exists on the target board.`,
      );
    }
    const targetList = this.matchOrThrow(targetLists, targetListQuery);
    const pos = TOP_ON_MOVE_INTO_LISTS.includes(
      targetList.name.trim().toLowerCase(),
    )
      ? 'top'
      : undefined;
    const moved = await this.trello.moveCardToBoard(
      card.id,
      targetBoardId,
      targetList.id,
      pos,
    );
    return {
      card: moved.name ?? card.name,
      previousBoard: previousBoard ?? '?',
      board: targetBoardQuery.trim(),
      list: targetList.name,
      shortUrl: moved.shortUrl ?? card.shortUrl,
    };
  }

  /** Delete one checklist by name (prefix-then-substring, 404/409 on
   * miss/ambiguity, same as every other `:query`). */
  async deleteChecklist(
    query: string,
    checklistQuery: string,
    boardOverride?: string,
  ): Promise<{ card: string; checklist: string; itemsDeleted: number }> {
    const card = await this.resolveCard(query, boardOverride);
    const checklists = await this.trello.getChecklists(card.id);
    const target = this.matchOrThrow(checklists, checklistQuery);
    await this.trello.deleteChecklist(target.id);
    return {
      card: card.name,
      checklist: target.name,
      itemsDeleted: target.checkItems.length,
    };
  }

  /**
   * Create a checklist on the card with the given items (unticked, in
   * order). Refuses (409) if a checklist with the same name already exists
   * — a re-run must not duplicate it.
   */
  async createChecklist(
    query: string,
    name: string,
    items: string[],
    boardOverride?: string,
  ): Promise<{ card: string; checklist: string; items: number }> {
    const card = await this.resolveCard(query, boardOverride);
    const existing = await this.trello.getChecklists(card.id);
    const clash = existing.find(
      (cl) => cl.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    if (clash) {
      throw new ConflictException(
        `Checklist "${clash.name}" already exists on ${card.name} — delete it on the board first or use a different name.`,
      );
    }
    const created = await this.trello.createChecklist(card.id, name);
    // Sequential on purpose: Trello orders items by creation time.
    for (const item of items) {
      await this.trello.addCheckItem(created.id, item);
    }
    return { card: card.name, checklist: created.name, items: items.length };
  }

  /** Rename a checklist (matched by name, 404/409). 409 if another
   * checklist on the card already has the new name. */
  async renameChecklist(
    query: string,
    checklistQuery: string,
    name: string,
    boardOverride?: string,
  ): Promise<{ card: string; previousName: string; checklist: string }> {
    const card = await this.resolveCard(query, boardOverride);
    const checklists = await this.trello.getChecklists(card.id);
    const target = this.matchOrThrow(checklists, checklistQuery);
    const next = name.trim();
    const clash = checklists.find(
      (cl) =>
        cl.id !== target.id && cl.name.trim().toLowerCase() === next.toLowerCase(),
    );
    if (clash) {
      throw new ConflictException(
        `Checklist "${clash.name}" already exists on ${card.name}.`,
      );
    }
    await this.trello.renameChecklist(target.id, next);
    return { card: card.name, previousName: target.name, checklist: next };
  }

  /** Change one item's text and/or tick state. The checklist and the item
   * are both matched by name (prefix-then-substring, 404/409). */
  async updateCheckItem(
    query: string,
    checklistQuery: string,
    itemQuery: string,
    fields: { name?: string; state?: CheckItemState },
    boardOverride?: string,
  ): Promise<{
    card: string;
    checklist: string;
    previousName: string;
    item: { name: string; state: CheckItemState };
  }> {
    if (fields.name === undefined && fields.state === undefined) {
      throw new BadRequestException('Provide "name" and/or "state".');
    }
    const card = await this.resolveCard(query, boardOverride);
    const checklists = await this.trello.getChecklists(card.id);
    const list = this.matchOrThrow(checklists, checklistQuery);
    const item = this.matchOrThrow(list.checkItems, itemQuery);
    const next = {
      name: fields.name?.trim() ?? item.name,
      state: fields.state ?? item.state,
    };
    await this.trello.updateCheckItem(card.id, item.id, {
      name: fields.name === undefined ? undefined : next.name,
      state: fields.state,
    });
    return {
      card: card.name,
      checklist: list.name,
      previousName: item.name,
      item: next,
    };
  }

  /** Delete one item (checklist and item matched by name, 404/409). */
  async deleteCheckItem(
    query: string,
    checklistQuery: string,
    itemQuery: string,
    boardOverride?: string,
  ): Promise<{ card: string; checklist: string; item: string }> {
    const card = await this.resolveCard(query, boardOverride);
    const checklists = await this.trello.getChecklists(card.id);
    const list = this.matchOrThrow(checklists, checklistQuery);
    const item = this.matchOrThrow(list.checkItems, itemQuery);
    await this.trello.deleteCheckItem(list.id, item.id);
    return { card: card.name, checklist: list.name, item: item.name };
  }

  /**
   * Append items to an existing checklist (matched by name, prefix-then-
   * substring; 404/409 on miss/ambiguity). Items already on that checklist
   * (case-insensitive, trimmed) are skipped, so a re-run does not duplicate
   * them. New items are created unticked, at the bottom, in order.
   */
  async addCheckItems(
    query: string,
    checklistQuery: string,
    items: string[],
    boardOverride?: string,
  ): Promise<{
    card: string;
    checklist: string;
    added: string[];
    skipped: string[];
  }> {
    const card = await this.resolveCard(query, boardOverride);
    const checklists = await this.trello.getChecklists(card.id);
    const target = this.matchOrThrow(checklists, checklistQuery);
    const seen = new Set(
      target.checkItems.map((i) => i.name.trim().toLowerCase()),
    );
    const added: string[] = [];
    const skipped: string[] = [];
    // Sequential on purpose: Trello orders items by creation time.
    for (const item of items) {
      const key = item.trim().toLowerCase();
      if (seen.has(key)) {
        skipped.push(item);
        continue;
      }
      await this.trello.addCheckItem(target.id, item);
      seen.add(key);
      added.push(item);
    }
    return { card: card.name, checklist: target.name, added, skipped };
  }

  /**
   * Upload a file as an attachment. An attachment with the same name
   * (case-insensitive, trimmed) is a 409 unless `replace` is set; then the
   * new file is uploaded first and only after that the old one(s) are
   * deleted, so a failed upload never leaves the card without the file.
   */
  async addAttachment(
    query: string,
    file: AttachmentUpload,
    replace: boolean,
    boardOverride?: string,
  ): Promise<{
    card: string;
    attachment: TrelloAttachment;
    replaced: number;
  }> {
    const card = await this.resolveCard(query, boardOverride);
    const key = file.name.trim().toLowerCase();
    const existing = (await this.trello.getAttachments(card.id)).filter(
      (a) => a.name.trim().toLowerCase() === key,
    );
    if (existing.length > 0 && !replace) {
      throw new ConflictException(
        `Attachment "${existing[0].name}" already exists on ${card.name} — pass replace=true to replace it.`,
      );
    }
    const attachment = await this.trello.addAttachment(card.id, file);
    for (const old of existing) {
      await this.trello.deleteAttachment(card.id, old.id);
    }
    return { card: card.name, attachment, replaced: existing.length };
  }

  /** Delete one attachment by name (prefix-then-substring, 404/409). */
  async deleteAttachment(
    query: string,
    nameQuery: string,
    boardOverride?: string,
  ): Promise<{ card: string; attachment: string }> {
    const card = await this.resolveCard(query, boardOverride);
    const attachments = await this.trello.getAttachments(card.id);
    const target = this.matchOrThrow(attachments, nameQuery);
    await this.trello.deleteAttachment(card.id, target.id);
    return { card: card.name, attachment: target.name };
  }

  /**
   * Tick/untick checklist items. Either `items` (each query resolved with
   * the same prefix-then-substring rules as `:query`; 404/409 on
   * miss/ambiguity) or `all: true` (every item on the matched
   * checklist(s)). Items already in the target state are counted, not
   * re-written.
   */
  async setCheckItemStates(
    query: string,
    opts: {
      checklist?: string;
      items?: string[];
      all?: boolean;
      state: CheckItemState;
    },
    boardOverride?: string,
  ): Promise<{
    card: string;
    state: CheckItemState;
    updated: string[];
    alreadyInState: number;
  }> {
    const useAll = opts.all === true;
    if (useAll === (opts.items !== undefined && opts.items.length > 0)) {
      throw new BadRequestException(
        'Provide exactly one of "items" (queries to tick) or "all": true.',
      );
    }
    const card = await this.resolveCard(query, boardOverride);
    let checklists = await this.trello.getChecklists(card.id);
    if (opts.checklist !== undefined) {
      const wanted = opts.checklist.trim().toLowerCase();
      checklists = checklists.filter(
        (cl) => cl.name.trim().toLowerCase() === wanted,
      );
      if (checklists.length === 0) {
        throw new NotFoundException(
          `No checklist named "${opts.checklist}" on ${card.name}.`,
        );
      }
    }
    const pool = checklists.flatMap((cl) => cl.checkItems);
    if (pool.length === 0) {
      throw new NotFoundException(`No checklist items on ${card.name}.`);
    }

    let targets: typeof pool;
    if (useAll) {
      targets = pool;
    } else {
      targets = (opts.items as string[]).map((itemQuery) =>
        this.matchOrThrow(pool, itemQuery),
      );
    }

    const updated: string[] = [];
    let alreadyInState = 0;
    const seen = new Set<string>();
    for (const item of targets) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      if (item.state === opts.state) {
        alreadyInState += 1;
        continue;
      }
      // Sequential on purpose, same as item creation.
      await this.trello.setCheckItemState(card.id, item.id, opts.state);
      updated.push(item.name);
    }
    return { card: card.name, state: opts.state, updated, alreadyInState };
  }

  /**
   * Create a card in a list (resolved by name), optionally with a
   * description and a checklist. Duplicate guard, so a re-run does not
   * create a second card: if the name starts with a
   * stable ticket id (including Unicode/epic-scoped ids such as
   * "E2-1C-13: …"), 409 when any existing card already carries that id;
   * otherwise 409 on an exact normalized name match.
   */
  async createCard(
    spec: {
      name: string;
      list: string;
      description?: string;
      checklist?: { name?: string; items: string[] };
    },
    boardOverride?: string,
  ): Promise<{
    card: string;
    list: string;
    shortUrl: string;
    checklist: { name: string; items: number } | null;
  }> {
    const boardId = await this.resolveBoardId(boardOverride);
    const lists = await this.trello.listLists(boardId);
    const list = this.matchOrThrow(lists, spec.list);

    const cards = await this.trello.listCards(boardId);
    const name = spec.name.trim();
    const clash = cards.find((card) => sameCardIdentity(card.name, name));
    if (clash) {
      throw new ConflictException(
        `Card "${clash.name}" already exists — refusing to create a duplicate.`,
      );
    }

    const card = await this.trello.createCard(
      list.id,
      name,
      spec.description ?? '',
    );
    let checklist: { name: string; items: number } | null = null;
    if (spec.checklist) {
      const created = await this.trello.createChecklist(
        card.id,
        spec.checklist.name ?? 'Build',
      );
      // Sequential on purpose: Trello orders items by creation time.
      for (const item of spec.checklist.items) {
        await this.trello.addCheckItem(created.id, item);
      }
      checklist = { name: created.name, items: spec.checklist.items.length };
    }
    return {
      card: card.name,
      list: list.name,
      shortUrl: card.shortUrl,
      checklist,
    };
  }
}
