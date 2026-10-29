import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { matchByName } from './card-matcher';

/**
 * Thin typed wrapper over the Trello REST API.
 *
 * Auth always rides in the query string, but for PUT/POST every other
 * parameter goes in the form-encoded body — long descriptions in the URL
 * previously tripped Trello's CloudFront with HTTP 414.
 */

const API = 'https://api.trello.com/1';

export interface TrelloBoard {
  id: string;
  name: string;
  url: string;
  shortUrl: string;
}

export interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  shortUrl: string;
  idList: string;
  /** Present on a direct `GET /cards/{idOrShortLink}` lookup. */
  idBoard?: string;
  shortLink?: string;
}

/** Trello responded with a non-2xx. Still a 502 to callers of the bridge;
 * `upstreamStatus` lets card-by-id lookup turn a 404 into a 404. */
export class TrelloUpstreamException extends BadGatewayException {
  readonly upstreamStatus: number;

  constructor(
    method: string,
    path: string,
    upstreamStatus: number,
    body: string,
  ) {
    super(`Trello API ${method} ${path} -> HTTP ${upstreamStatus}: ${body}`);
    this.upstreamStatus = upstreamStatus;
  }
}

export interface TrelloList {
  id: string;
  name: string;
}

export interface TrelloChecklist {
  id: string;
  name: string;
  checkItems: { id: string; name: string; state: 'complete' | 'incomplete' }[];
}

export interface TrelloAttachment {
  id: string;
  name: string;
  url: string;
  bytes: number | null;
  date: string;
  mimeType: string | null;
}

/** A file to upload as an attachment (bytes already in memory). */
export interface AttachmentUpload {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

export interface TrelloComment {
  /** Trello action id — the `:commentId` of the edit/delete routes. */
  id: string;
  date: string;
  member: string;
  text: string;
}

@Injectable()
export class TrelloClientService {
  private readonly logger = new Logger(TrelloClientService.name);
  private readonly key: string;
  private readonly token: string;
  /** Board id cache: board membership doesn't change mid-session. */
  private boardIdCache = new Map<string, string>();

  constructor(config: ConfigService) {
    this.key = config.getOrThrow<string>('TRELLO_KEY');
    this.token = config.getOrThrow<string>('TRELLO_TOKEN');
  }

  private async request<T>(
    method: 'GET' | 'PUT' | 'POST' | 'DELETE',
    path: string,
    params: Record<string, string> | FormData = {},
  ): Promise<T> {
    const auth = new URLSearchParams({ key: this.key, token: this.token });
    let url: string;
    const init: RequestInit = { method };

    if (params instanceof FormData) {
      // Multipart (attachments): fetch sets the boundary Content-Type itself.
      url = `${API}${path}?${auth}`;
      init.body = params;
    } else if (method === 'GET') {
      const qs = new URLSearchParams({ ...params });
      qs.set('key', this.key);
      qs.set('token', this.token);
      url = `${API}${path}?${qs}`;
    } else {
      url = `${API}${path}?${auth}`;
      init.body = new URLSearchParams(params);
      init.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    }

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (err) {
      this.logger.error(`Trello API ${method} ${path} network error`, err);
      throw new BadGatewayException(
        `Trello API unreachable: ${(err as Error).message}`,
      );
    }
    if (!response.ok) {
      const body = await response.text();
      // Never log/expose the URL — it carries the key/token query string.
      this.logger.error(
        `Trello API ${method} ${path} -> HTTP ${response.status}: ${body}`,
      );
      throw new TrelloUpstreamException(method, path, response.status, body);
    }
    return (await response.json()) as T;
  }

  /** Prefix-then-substring board lookup, cached by name for the process. */
  async findBoardId(boardName: string): Promise<string> {
    const cached = this.boardIdCache.get(boardName);
    if (cached) return cached;
    const boards = await this.listBoards();
    const board = matchByName(boards, boardName);
    this.boardIdCache.set(boardName, board.id);
    return board.id;
  }

  async listBoards(): Promise<TrelloBoard[]> {
    return this.request<TrelloBoard[]>('GET', '/members/me/boards', {
      fields: 'name,id,url,shortUrl',
      filter: 'open',
    });
  }

  /** Create a private board without Trello's default To do/Doing/Done lists. */
  async createBoard(name: string, desc: string): Promise<TrelloBoard> {
    const board = await this.request<TrelloBoard>('POST', '/boards', {
      name,
      desc,
      defaultLabels: 'false',
      defaultLists: 'false',
      prefs_permissionLevel: 'private',
    });
    this.boardIdCache.set(name, board.id);
    return board;
  }

  async createList(boardId: string, name: string): Promise<TrelloList> {
    return this.request<TrelloList>('POST', '/lists', {
      idBoard: boardId,
      name,
      pos: 'bottom',
    });
  }

  /**
   * One card by Trello id or shortLink (`GET /1/cards/{idOrShortLink}`).
   * Does not need a board id — the response carries `idBoard`.
   */
  async getCardById(idOrShortLink: string): Promise<TrelloCard> {
    return this.request<TrelloCard>(
      'GET',
      `/cards/${encodeURIComponent(idOrShortLink)}`,
      { fields: 'name,id,desc,shortUrl,idList,idBoard,shortLink' },
    );
  }

  async listCards(boardId: string): Promise<TrelloCard[]> {
    return this.request<TrelloCard[]>('GET', `/boards/${boardId}/cards`, {
      fields: 'name,id,desc,shortUrl,idList',
    });
  }

  async listLists(boardId: string): Promise<TrelloList[]> {
    return this.request<TrelloList[]>('GET', `/boards/${boardId}/lists`, {
      fields: 'name,id',
    });
  }

  async createCard(
    listId: string,
    name: string,
    desc: string,
  ): Promise<TrelloCard> {
    return this.request<TrelloCard>('POST', '/cards', {
      idList: listId,
      name,
      desc,
    });
  }

  async getChecklists(cardId: string): Promise<TrelloChecklist[]> {
    return this.request<TrelloChecklist[]>(
      'GET',
      `/cards/${cardId}/checklists`,
      {
        checkItems: 'all',
        checkItem_fields: 'name,state',
        fields: 'name',
      },
    );
  }

  async getComments(cardId: string, limit: number): Promise<TrelloComment[]> {
    interface CommentAction {
      id: string;
      date?: string;
      memberCreator?: { fullName?: string };
      data?: { text?: string };
    }
    const actions = await this.request<CommentAction[]>(
      'GET',
      `/cards/${cardId}/actions`,
      { filter: 'commentCard', limit: String(limit) },
    );
    return actions.map((a) => ({
      id: a.id,
      date: a.date ?? '',
      member: a.memberCreator?.fullName ?? '?',
      text: a.data?.text ?? '',
    }));
  }

  async updateDescription(cardId: string, desc: string): Promise<void> {
    await this.request('PUT', `/cards/${cardId}`, { desc });
  }

  async renameCard(cardId: string, name: string): Promise<TrelloCard> {
    return this.request<TrelloCard>('PUT', `/cards/${cardId}`, { name });
  }

  async moveCard(
    cardId: string,
    listId: string,
    pos?: 'top' | 'bottom',
  ): Promise<TrelloCard> {
    const params: Record<string, string> = { idList: listId };
    if (pos) params.pos = pos;
    return this.request<TrelloCard>('PUT', `/cards/${cardId}`, params);
  }

  async moveCardToBoard(
    cardId: string,
    boardId: string,
    listId: string,
    pos?: 'top' | 'bottom',
  ): Promise<TrelloCard> {
    const params: Record<string, string> = {
      idBoard: boardId,
      idList: listId,
    };
    if (pos) params.pos = pos;
    return this.request<TrelloCard>('PUT', `/cards/${cardId}`, params);
  }

  async renameChecklist(checklistId: string, name: string): Promise<void> {
    await this.request('PUT', `/checklists/${checklistId}`, { name });
  }

  /** Change an item's text and/or state; like setCheckItemState, the item
   * is addressed through the card. */
  async updateCheckItem(
    cardId: string,
    checkItemId: string,
    fields: { name?: string; state?: 'complete' | 'incomplete' },
  ): Promise<void> {
    const params: Record<string, string> = {};
    if (fields.name !== undefined) params.name = fields.name;
    if (fields.state !== undefined) params.state = fields.state;
    await this.request(
      'PUT',
      `/cards/${cardId}/checkItem/${checkItemId}`,
      params,
    );
  }

  async deleteCheckItem(
    checklistId: string,
    checkItemId: string,
  ): Promise<void> {
    await this.request(
      'DELETE',
      `/checklists/${checklistId}/checkItems/${checkItemId}`,
    );
  }

  async deleteChecklist(checklistId: string): Promise<void> {
    await this.request('DELETE', `/checklists/${checklistId}`);
  }

  async createChecklist(
    cardId: string,
    name: string,
  ): Promise<{ id: string; name: string }> {
    return this.request<{ id: string; name: string }>('POST', '/checklists', {
      idCard: cardId,
      name,
    });
  }

  async addCheckItem(checklistId: string, name: string): Promise<void> {
    await this.request('POST', `/checklists/${checklistId}/checkItems`, {
      name,
    });
  }

  /** The item is addressed through
   * the card, not the checklist. */
  async setCheckItemState(
    cardId: string,
    checkItemId: string,
    state: 'complete' | 'incomplete',
  ): Promise<void> {
    await this.request('PUT', `/cards/${cardId}/checkItem/${checkItemId}`, {
      state,
    });
  }

  async addComment(cardId: string, text: string): Promise<{ id: string }> {
    const action = await this.request<{ id: string }>(
      'POST',
      `/cards/${cardId}/actions/comments`,
      { text },
    );
    return { id: action.id };
  }

  /** One action by id: enough to check it is a comment on a given card. */
  async getAction(
    actionId: string,
  ): Promise<{ id: string; type: string; idCard?: string; text?: string }> {
    interface Action {
      id: string;
      type: string;
      data?: { card?: { id?: string }; text?: string };
    }
    const action = await this.request<Action>(
      'GET',
      `/actions/${encodeURIComponent(actionId)}`,
      { fields: 'type,data' },
    );
    return {
      id: action.id,
      type: action.type,
      idCard: action.data?.card?.id,
      text: action.data?.text,
    };
  }

  async updateComment(
    cardId: string,
    actionId: string,
    text: string,
  ): Promise<void> {
    await this.request(
      'PUT',
      `/cards/${cardId}/actions/${encodeURIComponent(actionId)}/comments`,
      { text },
    );
  }

  async getAttachments(cardId: string): Promise<TrelloAttachment[]> {
    const raw = await this.request<Partial<TrelloAttachment>[]>(
      'GET',
      `/cards/${cardId}/attachments`,
      { fields: 'id,name,url,bytes,date,mimeType' },
    );
    return raw.map(toAttachment);
  }

  /** Multipart upload; `setCover=false` so a file never becomes the card
   * cover. */
  async addAttachment(
    cardId: string,
    file: AttachmentUpload,
  ): Promise<TrelloAttachment> {
    const form = new FormData();
    form.set('name', file.name);
    form.set('mimeType', file.mimeType);
    form.set('setCover', 'false');
    form.set(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: file.mimeType }),
      file.name,
    );
    const raw = await this.request<Partial<TrelloAttachment>>(
      'POST',
      `/cards/${cardId}/attachments`,
      form,
    );
    return toAttachment(raw);
  }

  async deleteAttachment(cardId: string, attachmentId: string): Promise<void> {
    await this.request(
      'DELETE',
      `/cards/${cardId}/attachments/${encodeURIComponent(attachmentId)}`,
    );
  }

  async deleteComment(cardId: string, actionId: string): Promise<void> {
    await this.request(
      'DELETE',
      `/cards/${cardId}/actions/${encodeURIComponent(actionId)}/comments`,
    );
  }
}

function toAttachment(a: Partial<TrelloAttachment>): TrelloAttachment {
  return {
    id: a.id ?? '',
    name: a.name ?? '',
    url: a.url ?? '',
    bytes: a.bytes ?? null,
    date: a.date ?? '',
    mimeType: a.mimeType ?? null,
  };
}
