import { ConflictException } from '@nestjs/common';
import { BoardsService, DEFAULT_BOARD_LISTS } from './boards.service';
import { TrelloClientService } from './trello-client.service';

describe('BoardsService', () => {
  let trello: jest.Mocked<
    Pick<TrelloClientService, 'listBoards' | 'createBoard' | 'createList'>
  >;
  let service: BoardsService;

  beforeEach(() => {
    trello = {
      listBoards: jest.fn().mockResolvedValue([]),
      createBoard: jest.fn().mockResolvedValue({
        id: 'board2',
        name: 'E2: Runner',
        url: 'https://trello.com/b/board2',
        shortUrl: 'https://trello.com/b/board2',
      }),
      createList: jest.fn().mockImplementation((_id: string, name: string) =>
        Promise.resolve({ id: `list-${name}`, name }),
      ),
    };
    service = new BoardsService(trello as unknown as TrelloClientService);
  });

  it('creates a private board and the default status lists in order', async () => {
    const result = await service.createBoard({ name: ' E2: Runner ' });
    expect(trello.createBoard).toHaveBeenCalledWith('E2: Runner', '');
    expect(trello.createList.mock.calls).toEqual(
      DEFAULT_BOARD_LISTS.map((name) => ['board2', name]),
    );
    expect(result).toEqual({
      board: 'E2: Runner',
      shortUrl: 'https://trello.com/b/board2',
      lists: DEFAULT_BOARD_LISTS,
    });
  });

  it('rejects an existing board by exact normalized name', async () => {
    trello.listBoards.mockResolvedValueOnce([
      {
        id: 'board2',
        name: 'E2: Runner',
        url: 'u',
        shortUrl: 'u',
      },
    ]);
    await expect(
      service.createBoard({ name: 'e2: runner' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(trello.createBoard).not.toHaveBeenCalled();
  });

  it('rejects duplicate list names before creating the board', async () => {
    await expect(
      service.createBoard({ name: 'E2: Runner', lists: ['Backlog', 'backlog'] }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(trello.listBoards).not.toHaveBeenCalled();
    expect(trello.createBoard).not.toHaveBeenCalled();
  });
});
