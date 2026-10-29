import { ConflictException, Injectable } from '@nestjs/common';
import { TrelloClientService } from './trello-client.service';

export const DEFAULT_BOARD_LISTS = [
  'Backlog',
  'Refine',
  'Coding',
  'Review',
  'Done',
];

@Injectable()
export class BoardsService {
  constructor(private readonly trello: TrelloClientService) {}

  async createBoard(spec: {
    name: string;
    description?: string;
    lists?: string[];
  }): Promise<{
    board: string;
    shortUrl: string;
    lists: string[];
  }> {
    const name = spec.name.trim();
    const lists = (spec.lists ?? DEFAULT_BOARD_LISTS).map((item) =>
      item.trim(),
    );
    const normalizedLists = lists.map((item) => item.toLocaleLowerCase());
    if (new Set(normalizedLists).size !== lists.length) {
      throw new ConflictException('Board list names must be unique.');
    }

    const boards = await this.trello.listBoards();
    const clash = boards.find(
      (board) =>
        board.name.trim().normalize('NFC').toLocaleLowerCase() ===
        name.normalize('NFC').toLocaleLowerCase(),
    );
    if (clash) {
      throw new ConflictException(
        `Board "${clash.name}" already exists — refusing to create a duplicate.`,
      );
    }

    const board = await this.trello.createBoard(
      name,
      spec.description?.trim() ?? '',
    );
    for (const list of lists) {
      await this.trello.createList(board.id, list);
    }
    return { board: board.name, shortUrl: board.shortUrl, lists };
  }
}
