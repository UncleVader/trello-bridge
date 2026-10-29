import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AmbiguousMatchError, NoMatchError } from './card-matcher';
import { TrelloUpstreamException } from './trello-client.service';
import {
  APPEND_SEPARATOR,
  CardsService,
  composeDescription,
} from './cards.service';
import { TrelloClientService } from './trello-client.service';

describe('composeDescription', () => {
  it('replace mode overwrites entirely', () => {
    expect(composeDescription('old', 'new', 'replace')).toBe('new');
  });

  it('append mode adds below the existing description with the standard divider', () => {
    expect(composeDescription('old', 'new', 'append')).toBe(
      `old${APPEND_SEPARATOR}new`,
    );
  });

  it('append onto an empty description is just the content', () => {
    expect(composeDescription('', 'new', 'append')).toBe('new');
    expect(composeDescription('   \n ', 'new', 'append')).toBe('new');
  });

  it('trims content and existing text before joining', () => {
    expect(composeDescription(' old \n', '\nnew ', 'append')).toBe(
      `old${APPEND_SEPARATOR}new`,
    );
  });

  it('honors a custom separator', () => {
    expect(composeDescription('a', 'b', 'append', '\n--\n')).toBe('a\n--\nb');
  });
});

describe('CardsService', () => {
  // Every :query call below carries this as the mandatory X-Trello-Board
  // value — the service has no configured/default board of its own.
  const BOARD = 'Test Board';

  const boardCards = [
    {
      id: 'id1',
      name: 'FB-1: Scaffold',
      desc: 'existing',
      shortUrl: 'u1',
      idList: 'l1',
    },
    {
      id: 'id2',
      name: 'FB-2: Auth',
      desc: '',
      shortUrl: 'u2',
      idList: 'l1',
    },
    {
      id: 'id2b',
      name: 'FB-2.1: Auth extras',
      desc: '',
      shortUrl: 'u2b',
      idList: 'l2',
    },
  ];

  let trello: jest.Mocked<
    Pick<
      TrelloClientService,
      | 'findBoardId'
      | 'getCardById'
      | 'listCards'
      | 'getChecklists'
      | 'getComments'
      | 'updateDescription'
      | 'addComment'
      | 'getAction'
      | 'updateComment'
      | 'deleteComment'
      | 'createChecklist'
      | 'addCheckItem'
      | 'setCheckItemState'
      | 'listLists'
      | 'createCard'
      | 'renameCard'
      | 'moveCard'
      | 'moveCardToBoard'
      | 'deleteChecklist'
      | 'renameChecklist'
      | 'updateCheckItem'
      | 'deleteCheckItem'
      | 'getAttachments'
      | 'addAttachment'
      | 'deleteAttachment'
    >
  >;
  let service: CardsService;

  beforeEach(() => {
    trello = {
      findBoardId: jest.fn().mockResolvedValue('board1'),
      getCardById: jest.fn(),
      listCards: jest.fn().mockResolvedValue(boardCards),
      getChecklists: jest.fn().mockResolvedValue([
        {
          id: 'cl1',
          name: 'Build',
          checkItems: [
            { id: 'c1', name: 'step one', state: 'complete' },
            { id: 'c2', name: 'step two', state: 'incomplete' },
          ],
        },
      ]),
      getComments: jest
        .fn()
        .mockResolvedValue([{ id: 'a1', date: 'd', member: 'm', text: 't' }]),
      updateDescription: jest.fn().mockResolvedValue(undefined),
      addComment: jest.fn().mockResolvedValue({ id: 'a-new' }),
      getAction: jest.fn().mockResolvedValue({
        id: 'a1',
        type: 'commentCard',
        idCard: 'id1',
        text: 'old text',
      }),
      updateComment: jest.fn().mockResolvedValue(undefined),
      deleteComment: jest.fn().mockResolvedValue(undefined),
      createChecklist: jest
        .fn()
        .mockResolvedValue({ id: 'cl-new', name: 'Build' }),
      addCheckItem: jest.fn().mockResolvedValue(undefined),
      setCheckItemState: jest.fn().mockResolvedValue(undefined),
      listLists: jest.fn().mockResolvedValue([
        { id: 'l1', name: 'Backlog' },
        { id: 'l2', name: 'Backend Foundation' },
        { id: 'l3', name: 'Review' },
      ]),
      createCard: jest.fn().mockResolvedValue({
        id: 'card-new',
        name: 'FB-12: New ticket',
        desc: '',
        shortUrl: 'u-new',
        idList: 'l1',
      }),
      renameCard: jest.fn().mockImplementation((_id: string, name: string) =>
        Promise.resolve({
          id: 'id1',
          name,
          desc: 'existing',
          shortUrl: 'u1',
          idList: 'l1',
        }),
      ),
      moveCard: jest.fn().mockResolvedValue(undefined),
      moveCardToBoard: jest.fn().mockImplementation(
        (_cardId: string, _boardId: string, listId: string) =>
          Promise.resolve({
            id: 'id1',
            name: 'FB-1: Scaffold',
            desc: 'existing',
            shortUrl: 'u1',
            idList: listId,
          }),
      ),
      deleteChecklist: jest.fn().mockResolvedValue(undefined),
      renameChecklist: jest.fn().mockResolvedValue(undefined),
      updateCheckItem: jest.fn().mockResolvedValue(undefined),
      deleteCheckItem: jest.fn().mockResolvedValue(undefined),
      getAttachments: jest.fn().mockResolvedValue([
        {
          id: 'att1',
          name: 'isu-response.md',
          url: 'https://trello.com/att1',
          bytes: 10,
          date: 'd',
          mimeType: 'text/markdown',
        },
      ]),
      addAttachment: jest.fn().mockImplementation((_cardId, file) =>
        Promise.resolve({
          id: 'att-new',
          name: file.name,
          url: 'https://trello.com/att-new',
          bytes: file.buffer.length,
          date: 'd2',
          mimeType: file.mimeType,
        }),
      ),
      deleteAttachment: jest.fn().mockResolvedValue(undefined),
    };
    service = new CardsService(trello as unknown as TrelloClientService);
  });

  it('getCard returns description, checklists and comments', async () => {
    const view = await service.getCard('FB-1', 5, BOARD);
    expect(view.name).toBe('FB-1: Scaffold');
    expect(view.description).toBe('existing');
    expect(view.checklists[0].items).toEqual([
      { name: 'step one', state: 'complete' },
      { name: 'step two', state: 'incomplete' },
    ]);
    expect(view.comments).toHaveLength(1);
    expect(view.attachments.map((a) => a.name)).toEqual(['isu-response.md']);
  });

  const upload = (name: string) => ({
    name,
    mimeType: 'text/markdown',
    buffer: Buffer.from('# answer'),
  });

  it('addAttachment uploads a new file', async () => {
    const result = await service.addAttachment(
      'FB-1',
      upload('contract.md'),
      false,
      BOARD,
    );
    expect(trello.addAttachment).toHaveBeenCalledWith('id1', upload('contract.md'));
    expect(trello.deleteAttachment).not.toHaveBeenCalled();
    expect(result.attachment.name).toBe('contract.md');
    expect(result.replaced).toBe(0);
  });

  it('addAttachment rejects a same-name file (case-insensitive) with 409', async () => {
    await expect(
      service.addAttachment('FB-1', upload('ISU-Response.md'), false, BOARD),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(trello.addAttachment).not.toHaveBeenCalled();
  });

  it('addAttachment replace uploads first, then deletes the old one', async () => {
    const order: string[] = [];
    trello.addAttachment.mockImplementationOnce(async () => {
      order.push('add');
      return {
        id: 'att-new',
        name: 'isu-response.md',
        url: 'u',
        bytes: 1,
        date: 'd',
        mimeType: null,
      };
    });
    trello.deleteAttachment.mockImplementationOnce(async () => {
      order.push('delete');
    });
    const result = await service.addAttachment(
      'FB-1',
      upload('isu-response.md'),
      true,
      BOARD,
    );
    expect(order).toEqual(['add', 'delete']);
    expect(trello.deleteAttachment).toHaveBeenCalledWith('id1', 'att1');
    expect(result.replaced).toBe(1);
  });

  it('addAttachment replace keeps the old file when the upload fails', async () => {
    trello.addAttachment.mockRejectedValueOnce(new Error('upstream'));
    await expect(
      service.addAttachment('FB-1', upload('isu-response.md'), true, BOARD),
    ).rejects.toThrow('upstream');
    expect(trello.deleteAttachment).not.toHaveBeenCalled();
  });

  it('deleteAttachment deletes by name and maps a miss to 404', async () => {
    const result = await service.deleteAttachment('FB-1', 'isu', BOARD);
    expect(trello.deleteAttachment).toHaveBeenCalledWith('id1', 'att1');
    expect(result).toEqual({ card: 'FB-1: Scaffold', attachment: 'isu-response.md' });
    await expect(
      service.deleteAttachment('FB-1', 'nope', BOARD),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getCard skips the comments call when limit is 0', async () => {
    const view = await service.getCard('FB-1', 0, BOARD);
    expect(view.comments).toEqual([]);
    expect(trello.getComments).not.toHaveBeenCalled();
  });

  it('updateDescription appends by default semantics of the caller', async () => {
    const result = await service.updateDescription(
      'FB-1',
      'more',
      'append',
      undefined,
      BOARD,
    );
    expect(trello.updateDescription).toHaveBeenCalledWith(
      'id1',
      `existing${APPEND_SEPARATOR}more`,
    );
    expect(result.card).toBe('FB-1: Scaffold');
  });

  it('updateDescription replace overwrites', async () => {
    await service.updateDescription('FB-1', 'fresh', 'replace', undefined, BOARD);
    expect(trello.updateDescription).toHaveBeenCalledWith('id1', 'fresh');
  });

  it('addComment posts to the resolved card and returns the comment id', async () => {
    const result = await service.addComment('FB-1', 'status update', BOARD);
    expect(trello.addComment).toHaveBeenCalledWith('id1', 'status update');
    expect(result).toEqual({ card: 'FB-1: Scaffold', id: 'a-new' });
  });

  it('updateComment replaces the text and returns the previous one', async () => {
    const result = await service.updateComment('FB-1', 'a1', 'new text', BOARD);
    expect(trello.getAction).toHaveBeenCalledWith('a1');
    expect(trello.updateComment).toHaveBeenCalledWith('id1', 'a1', 'new text');
    expect(result).toEqual({
      card: 'FB-1: Scaffold',
      id: 'a1',
      previousText: 'old text',
    });
  });

  it('deleteComment deletes and returns the deleted text', async () => {
    const result = await service.deleteComment('FB-1', 'a1', BOARD);
    expect(trello.deleteComment).toHaveBeenCalledWith('id1', 'a1');
    expect(result).toEqual({
      card: 'FB-1: Scaffold',
      id: 'a1',
      deletedText: 'old text',
    });
  });

  it('refuses a comment id that belongs to another card with 404', async () => {
    trello.getAction.mockResolvedValueOnce({
      id: 'a1',
      type: 'commentCard',
      idCard: 'other-card',
      text: 'x',
    });
    await expect(
      service.deleteComment('FB-1', 'a1', BOARD),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(trello.deleteComment).not.toHaveBeenCalled();
  });

  it('refuses an action id that is not a comment with 404', async () => {
    trello.getAction.mockResolvedValueOnce({
      id: 'a1',
      type: 'updateCard',
      idCard: 'id1',
    });
    await expect(
      service.updateComment('FB-1', 'a1', 'x', BOARD),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(trello.updateComment).not.toHaveBeenCalled();
  });

  it('maps an unknown comment id on Trello to 404', async () => {
    trello.getAction.mockRejectedValueOnce(
      new TrelloUpstreamException('GET', '/actions/zzz', 400, 'invalid id'),
    );
    await expect(
      service.deleteComment('FB-1', 'zzz', BOARD),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("maps Trello's refusal to change someone else's comment to 403", async () => {
    trello.updateComment.mockRejectedValueOnce(
      new TrelloUpstreamException(
        'PUT',
        '/cards/id1/actions/a1/comments',
        401,
        'unauthorized',
      ),
    );
    await expect(
      service.updateComment('FB-1', 'a1', 'x', BOARD),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('createChecklist creates the checklist and items in order', async () => {
    // FB-1's existing checklist is named 'Build' in the mock — use another
    // card-free name to avoid the duplicate guard.
    trello.getChecklists.mockResolvedValueOnce([]);
    const result = await service.createChecklist(
      'FB-1',
      'Build',
      ['one', 'two'],
      BOARD,
    );
    expect(trello.createChecklist).toHaveBeenCalledWith('id1', 'Build');
    expect(trello.addCheckItem.mock.calls).toEqual([
      ['cl-new', 'one'],
      ['cl-new', 'two'],
    ]);
    expect(result).toEqual({ card: 'FB-1: Scaffold', checklist: 'Build', items: 2 });
  });

  it('addCheckItems appends new items in order and skips existing ones', async () => {
    const result = await service.addCheckItems(
      'FB-1',
      'build',
      ['Step One ', 'step three', 'step four', 'step three'],
      BOARD,
    );
    expect(trello.createChecklist).not.toHaveBeenCalled();
    expect(trello.addCheckItem.mock.calls).toEqual([
      ['cl1', 'step three'],
      ['cl1', 'step four'],
    ]);
    expect(result).toEqual({
      card: 'FB-1: Scaffold',
      checklist: 'Build',
      added: ['step three', 'step four'],
      skipped: ['Step One ', 'step three'],
    });
  });

  it('renameChecklist renames and rejects a clash with another checklist', async () => {
    const result = await service.renameChecklist('FB-1', 'build', ' QA ', BOARD);
    expect(trello.renameChecklist).toHaveBeenCalledWith('cl1', 'QA');
    expect(result).toEqual({ card: 'FB-1: Scaffold', previousName: 'Build', checklist: 'QA' });
    trello.getChecklists.mockResolvedValueOnce([
      { id: 'cl1', name: 'Build', checkItems: [] },
      { id: 'cl2', name: 'QA', checkItems: [] },
    ]);
    await expect(
      service.renameChecklist('FB-1', 'Build', 'qa', BOARD),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updateCheckItem changes text only, keeping the state', async () => {
    const result = await service.updateCheckItem(
      'FB-1', 'Build', 'step two', { name: 'step 2' }, BOARD,
    );
    expect(trello.updateCheckItem).toHaveBeenCalledWith('id1', 'c2', {
      name: 'step 2',
      state: undefined,
    });
    expect(result.previousName).toBe('step two');
    expect(result.item).toEqual({ name: 'step 2', state: 'incomplete' });
  });

  it('updateCheckItem needs name or state; unknown item is 404', async () => {
    await expect(
      service.updateCheckItem('FB-1', 'Build', 'step one', {}, BOARD),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateCheckItem('FB-1', 'Build', 'nope', { state: 'complete' }, BOARD),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(trello.updateCheckItem).not.toHaveBeenCalled();
  });

  it('deleteCheckItem deletes the matched item; ambiguous query is 409', async () => {
    const result = await service.deleteCheckItem('FB-1', 'Build', 'step one', BOARD);
    expect(trello.deleteCheckItem).toHaveBeenCalledWith('cl1', 'c1');
    expect(result).toEqual({ card: 'FB-1: Scaffold', checklist: 'Build', item: 'step one' });
    await expect(
      service.deleteCheckItem('FB-1', 'Build', 'step', BOARD),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('addCheckItems maps an unknown checklist to 404 and adds nothing', async () => {
    await expect(
      service.addCheckItems('FB-1', 'QA', ['x'], BOARD),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(trello.addCheckItem).not.toHaveBeenCalled();
  });

  it('createChecklist rejects a duplicate name (case-insensitive) with 409', async () => {
    // Default mock: card already has a checklist named 'Build'.
    await expect(
      service.createChecklist('FB-1', 'build', ['x'], BOARD),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(trello.createChecklist).not.toHaveBeenCalled();
  });

  it('setCheckItemStates ticks matched items and skips already-complete ones', async () => {
    const result = await service.setCheckItemStates(
      'FB-1',
      { items: ['step one', 'step two'], state: 'complete' },
      BOARD,
    );
    // 'step one' is already complete in the mock — counted, not re-written.
    expect(trello.setCheckItemState.mock.calls).toEqual([
      ['id1', 'c2', 'complete'],
    ]);
    expect(result).toEqual({
      card: 'FB-1: Scaffold',
      state: 'complete',
      updated: ['step two'],
      alreadyInState: 1,
    });
  });

  it('setCheckItemStates all:true covers every item; unticking works', async () => {
    const result = await service.setCheckItemStates(
      'FB-1',
      { all: true, state: 'incomplete' },
      BOARD,
    );
    expect(trello.setCheckItemState.mock.calls).toEqual([
      ['id1', 'c1', 'incomplete'],
    ]);
    expect(result.updated).toEqual(['step one']);
    expect(result.alreadyInState).toBe(1);
  });

  it('setCheckItemStates rejects items+all together and neither', async () => {
    await expect(
      service.setCheckItemStates(
        'FB-1',
        { items: ['x'], all: true, state: 'complete' },
        BOARD,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setCheckItemStates('FB-1', { state: 'complete' }, BOARD),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(trello.setCheckItemState).not.toHaveBeenCalled();
  });

  it('setCheckItemStates maps unknown checklist/item to 404, ambiguous item to 409', async () => {
    await expect(
      service.setCheckItemStates(
        'FB-1',
        { checklist: 'QA', all: true, state: 'complete' },
        BOARD,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.setCheckItemStates(
        'FB-1',
        { items: ['no such item'], state: 'complete' },
        BOARD,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.setCheckItemStates(
        'FB-1',
        { items: ['step'], state: 'complete' },
        BOARD,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('createCard creates the card in the resolved list, with checklist', async () => {
    const result = await service.createCard(
      {
        name: 'FB-12: New ticket',
        list: 'backend',
        description: 'desc',
        checklist: { items: ['one', 'two'] },
      },
      BOARD,
    );
    expect(trello.createCard).toHaveBeenCalledWith(
      'l2',
      'FB-12: New ticket',
      'desc',
    );
    expect(trello.createChecklist).toHaveBeenCalledWith('card-new', 'Build');
    expect(trello.addCheckItem.mock.calls).toEqual([
      ['cl-new', 'one'],
      ['cl-new', 'two'],
    ]);
    expect(result).toEqual({
      card: 'FB-12: New ticket',
      list: 'Backend Foundation',
      shortUrl: 'u-new',
      checklist: { name: 'Build', items: 2 },
    });
  });

  it('createCard without checklist skips checklist creation', async () => {
    const result = await service.createCard(
      { name: 'Loose note', list: 'Backlog' },
      BOARD,
    );
    expect(trello.createCard).toHaveBeenCalledWith('l1', 'Loose note', '');
    expect(trello.createChecklist).not.toHaveBeenCalled();
    expect(result.checklist).toBeNull();
  });

  it('createCard rejects a duplicate ticket id with 409', async () => {
    // Board already has "FB-1: Scaffold" — same FB-1: ticket id.
    await expect(
      service.createCard({ name: 'FB-1: Rewrite', list: 'Backlog' }, BOARD),
    ).rejects.toBeInstanceOf(ConflictException);
    // Dotted ticket ids are guarded too ("FB-2.1: Auth extras" exists).
    await expect(
      service.createCard({ name: 'FB-2.1: Again', list: 'Backlog' }, BOARD),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(trello.createCard).not.toHaveBeenCalled();
  });

  it('createCard rejects duplicate Cyrillic and epic-scoped ids after a title change', async () => {
    trello.listCards.mockResolvedValueOnce([
      {
        id: 'e2',
        name: 'E2: Old title',
        desc: '',
        shortUrl: 'ue2',
        idList: 'l1',
      },
      {
        id: 'e2-13',
        name: 'E2-1C-13: Old title',
        desc: '',
        shortUrl: 'ue2-13',
        idList: 'l1',
      },
    ]);
    await expect(
      service.createCard({ name: 'E2-1C-13: New title', list: 'Backlog' }, BOARD),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(trello.createCard).not.toHaveBeenCalled();
  });

  it('createCard maps an unknown list to 404', async () => {
    await expect(
      service.createCard({ name: 'FB-12: New ticket', list: 'Done' }, BOARD),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(trello.createCard).not.toHaveBeenCalled();
  });

  it('renameCard renames and reports the diff', async () => {
    const result = await service.renameCard('FB-1', 'FB-1: New title', BOARD);
    expect(trello.renameCard).toHaveBeenCalledWith('id1', 'FB-1: New title');
    expect(result).toEqual({
      card: 'FB-1: New title',
      previousName: 'FB-1: Scaffold',
      name: 'FB-1: New title',
    });
  });

  it('renameCard trims the name before renaming', async () => {
    await service.renameCard('FB-1', '  FB-1: Trimmed  ', BOARD);
    expect(trello.renameCard).toHaveBeenCalledWith('id1', 'FB-1: Trimmed');
  });

  it('renameCard rejects a blank/whitespace-only name with 400 without resolving the card', async () => {
    await expect(
      service.renameCard('FB-1', '   ', BOARD),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(trello.listCards).not.toHaveBeenCalled();
    expect(trello.renameCard).not.toHaveBeenCalled();
  });

  it('renameCard maps an unknown card to 404', async () => {
    await expect(
      service.renameCard('FB-99', 'New title', BOARD),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(trello.renameCard).not.toHaveBeenCalled();
  });

  it('moveCard moves the card and reports the list it came from and went to', async () => {
    // FB-1 sits on l1 ("Backlog") in the mock; move it to Review (l3).
    const result = await service.moveCard('FB-1', 'Review', BOARD);
    expect(trello.moveCard).toHaveBeenCalledWith('id1', 'l3', 'top');
    expect(result).toEqual({
      card: 'FB-1: Scaffold',
      previousList: 'Backlog',
      list: 'Review',
    });
  });

  it('moveCard resolves the target list by prefix-then-substring', async () => {
    await service.moveCard('FB-2.1', 'backend', BOARD);
    // FB-2.1 sits on l2 ("Backend Foundation") already — still a valid,
    // idempotent move onto the same list. Not a top-on-move list, so no pos.
    expect(trello.moveCard).toHaveBeenCalledWith('id2b', 'l2', undefined);
  });

  it('moveCard drops a new card at the top of Review or Done, case-insensitively', async () => {
    trello.listLists.mockResolvedValueOnce([
      { id: 'l1', name: 'Backlog' },
      { id: 'l6', name: 'done' },
    ]);
    await service.moveCard('FB-1', 'done', BOARD);
    expect(trello.moveCard).toHaveBeenCalledWith('id1', 'l6', 'top');
  });

  it('moveCard does not force a position for lists outside the review/done set', async () => {
    await service.moveCard('FB-1', 'Backend Foundation', BOARD);
    expect(trello.moveCard).toHaveBeenCalledWith('id1', 'l2', undefined);
  });

  it('moveCard maps an unknown card to 404 without resolving the list', async () => {
    await expect(
      service.moveCard('FB-99', 'Review', BOARD),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(trello.moveCard).not.toHaveBeenCalled();
  });

  it('moveCard maps an unknown list to 404', async () => {
    await expect(
      service.moveCard('FB-1', 'Swamp', BOARD),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(trello.moveCard).not.toHaveBeenCalled();
  });

  it('moveCard maps an ambiguous list query to 409', async () => {
    trello.listLists.mockResolvedValueOnce([
      { id: 'l1', name: 'Backlog' },
      { id: 'l2', name: 'Backend Foundation' },
      { id: 'l4', name: 'Review' },
      { id: 'l5', name: 'Reviewed' },
    ]);
    // "Rev" prefix-matches both "Review" and "Reviewed"; neither is an
    // exact match, so this stays ambiguous rather than resolving.
    await expect(
      service.moveCard('FB-1', 'Rev', BOARD),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(trello.moveCard).not.toHaveBeenCalled();
  });

  it('moveCardToBoard preserves card identity and targets the resolved board/list', async () => {
    trello.findBoardId
      .mockResolvedValueOnce('board1')
      .mockResolvedValueOnce('board2');
    trello.listCards
      .mockResolvedValueOnce(boardCards)
      .mockResolvedValueOnce([]);
    const result = await service.moveCardToBoard(
      'FB-1',
      'Target Board',
      'Backlog',
      BOARD,
    );
    expect(trello.moveCardToBoard).toHaveBeenCalledWith(
      'id1',
      'board2',
      'l1',
      undefined,
    );
    expect(result).toEqual({
      card: 'FB-1: Scaffold',
      previousBoard: BOARD,
      board: 'Target Board',
      list: 'Backlog',
      shortUrl: 'u1',
    });
  });

  it('moveCardToBoard rejects a stable-id duplicate on the target board', async () => {
    trello.findBoardId
      .mockResolvedValueOnce('board1')
      .mockResolvedValueOnce('board2');
    trello.listCards
      .mockResolvedValueOnce([
        {
          id: 'source',
          name: 'E2-1C-13: New title',
          desc: '',
          shortUrl: 'source-url',
          idList: 'l1',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'target',
          name: 'E2-1C-13: Old title',
          desc: '',
          shortUrl: 'target-url',
          idList: 'l1',
        },
      ]);
    await expect(
      service.moveCardToBoard(
        'E2-1C-13',
        'Target Board',
        'Backlog',
        BOARD,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(trello.moveCardToBoard).not.toHaveBeenCalled();
  });

  it('moveCardToBoard rejects a same-board request', async () => {
    trello.findBoardId.mockResolvedValue('board1');
    await expect(
      service.moveCardToBoard('FB-1', BOARD, 'Backlog', BOARD),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(trello.moveCardToBoard).not.toHaveBeenCalled();
  });

  it('deleteChecklist deletes the matched checklist and reports items deleted', async () => {
    const result = await service.deleteChecklist('FB-1', 'Build', BOARD);
    expect(trello.deleteChecklist).toHaveBeenCalledWith('cl1');
    expect(result).toEqual({
      card: 'FB-1: Scaffold',
      checklist: 'Build',
      itemsDeleted: 2,
    });
  });

  it('deleteChecklist maps an unknown checklist name to 404', async () => {
    await expect(
      service.deleteChecklist('FB-1', 'QA', BOARD),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(trello.deleteChecklist).not.toHaveBeenCalled();
  });

  it('deleteChecklist resolves an exact name match even when it also prefixes another checklist', async () => {
    // "Build" is a prefix of "Build v2 (Cryptomus)", so both match the
    // query — matchByName must prefer the exact match rather than 409.
    trello.getChecklists.mockResolvedValueOnce([
      { id: 'cl1', name: 'Build', checkItems: [] },
      { id: 'cl2', name: 'Build v2 (Cryptomus)', checkItems: [] },
    ]);
    const result = await service.deleteChecklist('FB-1', 'Build', BOARD);
    expect(trello.deleteChecklist).toHaveBeenCalledWith('cl1');
    expect(result).toEqual({
      card: 'FB-1: Scaffold',
      checklist: 'Build',
      itemsDeleted: 0,
    });
  });

  it('deleteChecklist maps a genuinely ambiguous checklist name to 409', async () => {
    trello.getChecklists.mockResolvedValueOnce([
      { id: 'cl1', name: 'Build', checkItems: [] },
      { id: 'cl2', name: 'Build v2 (Cryptomus)', checkItems: [] },
    ]);
    // "uild" substring-matches both and is an exact match for neither.
    await expect(
      service.deleteChecklist('FB-1', 'uild', BOARD),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(trello.deleteChecklist).not.toHaveBeenCalled();
  });

  it('maps no match to 404', async () => {
    await expect(service.getCard('FB-99', 5, BOARD)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('maps ambiguous match to 409', async () => {
    await expect(service.getCard('FB-2', 5, BOARD)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('maps an unresolvable board name to 404, not a raw 500', async () => {
    trello.findBoardId.mockRejectedValueOnce(
      new NoMatchError('Some Board', ['Other Board']),
    );
    await expect(service.getCard('FB-1', 5, BOARD)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('maps an ambiguous board name to 409, not a raw 500', async () => {
    trello.findBoardId.mockRejectedValueOnce(
      new AmbiguousMatchError('Board', ['Board One', 'Board Two']),
    );
    await expect(
      service.createCard({ name: 'FB-12: New ticket', list: 'Backlog' }, BOARD),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects with 400 when X-Trello-Board is missing, without calling Trello', async () => {
    await expect(service.getCard('FB-1', 5)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(trello.findBoardId).not.toHaveBeenCalled();
  });

  it('rejects with 400 when X-Trello-Board is blank/whitespace-only', async () => {
    await expect(service.getCard('FB-1', 5, '   ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(trello.findBoardId).not.toHaveBeenCalled();
  });

  it('a percent-encoded board (non-ASCII names) is decoded before resolving', async () => {
    await service.getCard('FB-1', 0, encodeURIComponent('Café board ✓'));
    expect(trello.findBoardId).toHaveBeenCalledWith('Café board ✓');
  });

  it('createCard requires X-Trello-Board too', async () => {
    await expect(
      service.createCard({ name: 'Loose note', list: 'Backlog' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(trello.findBoardId).not.toHaveBeenCalled();
  });

  describe('shortLink / card URL', () => {
    const shortCard = {
      id: 'card-short',
      name: 'From link',
      desc: 'body',
      shortUrl: 'https://trello.com/c/dKOgYxWs',
      idList: 'l1',
      idBoard: 'board-from-card',
      shortLink: 'dKOgYxWs',
    };

    beforeEach(() => {
      trello.getCardById.mockResolvedValue(shortCard);
    });

    it('getCard by shortLink returns checklists and comments without a board header', async () => {
      const view = await service.getCard('dKOgYxWs', 5);
      expect(trello.getCardById).toHaveBeenCalledWith('dKOgYxWs');
      expect(trello.findBoardId).not.toHaveBeenCalled();
      expect(trello.listCards).not.toHaveBeenCalled();
      expect(trello.getComments).toHaveBeenCalledWith('card-short', 5);
      expect(trello.getChecklists).toHaveBeenCalledWith('card-short');
      expect(view).toMatchObject({
        id: 'card-short',
        name: 'From link',
        shortUrl: 'https://trello.com/c/dKOgYxWs',
        description: 'body',
        comments: [{ id: 'a1', date: 'd', member: 'm', text: 't' }],
        checklists: [
          {
            name: 'Build',
            items: [
              { name: 'step one', state: 'complete' },
              { name: 'step two', state: 'incomplete' },
            ],
          },
        ],
      });
    });

    it('getCard by a card URL extracts the shortLink and ignores a wrong board header', async () => {
      await service.getCard(
        'https://trello.com/c/dKOgYxWs/12-some-card',
        5,
        'Wrong Board',
      );
      expect(trello.getCardById).toHaveBeenCalledWith('dKOgYxWs');
      expect(trello.findBoardId).not.toHaveBeenCalled();
      expect(trello.listCards).not.toHaveBeenCalled();
    });

    it('addComment posts on the card resolved by shortLink', async () => {
      const result = await service.addComment('dKOgYxWs', 'status update');
      expect(trello.addComment).toHaveBeenCalledWith(
        'card-short',
        'status update',
      );
      expect(trello.findBoardId).not.toHaveBeenCalled();
      expect(result).toEqual({ card: 'From link', id: 'a-new' });
    });

    it('setCheckItemStates ticks a checklist item resolved by shortLink', async () => {
      const result = await service.setCheckItemStates('dKOgYxWs', {
        items: ['step two'],
        state: 'complete',
      });
      expect(trello.setCheckItemState).toHaveBeenCalledWith(
        'card-short',
        'c2',
        'complete',
      );
      expect(trello.findBoardId).not.toHaveBeenCalled();
      expect(result.card).toBe('From link');
      expect(result.updated).toEqual(['step two']);
    });

    it('maps a missing shortLink to 404', async () => {
      trello.getCardById.mockRejectedValueOnce(
        new TrelloUpstreamException('GET', '/cards/dKOgYxWs', 404, 'missing'),
      );
      await expect(service.getCard('dKOgYxWs', 5)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(trello.findBoardId).not.toHaveBeenCalled();
      expect(trello.listCards).not.toHaveBeenCalled();
    });

    it('keeps a non-404 upstream failure as 502', async () => {
      trello.getCardById.mockRejectedValueOnce(
        new TrelloUpstreamException(
          'GET',
          '/cards/dKOgYxWs',
          401,
          'invalid token',
        ),
      );
      await expect(service.getCard('dKOgYxWs', 1)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });

    it('moveCard uses the card board from the shortLink lookup', async () => {
      const result = await service.moveCard('dKOgYxWs', 'Review');
      expect(trello.findBoardId).not.toHaveBeenCalled();
      expect(trello.listLists).toHaveBeenCalledWith('board-from-card');
      expect(trello.moveCard).toHaveBeenCalledWith('card-short', 'l3', 'top');
      expect(result.card).toBe('From link');
    });
  });

  it('an ambiguous name still requires the board header and does not call Trello', async () => {
    await expect(service.getCard('FB-2', 5)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(trello.getCardById).not.toHaveBeenCalled();
    expect(trello.findBoardId).not.toHaveBeenCalled();
    expect(trello.listCards).not.toHaveBeenCalled();
  });
});
