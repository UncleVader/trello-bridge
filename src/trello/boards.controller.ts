import { Body, Controller, Post } from '@nestjs/common';
import { BoardsService } from './boards.service';
import { CreateBoardDto } from './dto/create-board.dto';

@Controller('boards')
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  /** Create a private board with an explicit ordered status-list set. */
  @Post()
  createBoard(@Body() dto: CreateBoardDto) {
    return this.boards.createBoard({
      name: dto.name,
      description: dto.description,
      lists: dto.lists,
    });
  }
}
