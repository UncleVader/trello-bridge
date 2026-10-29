import { Module } from '@nestjs/common';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';
import { TrelloClientService } from './trello-client.service';

@Module({
  controllers: [CardsController, BoardsController],
  providers: [TrelloClientService, CardsService, BoardsService],
})
export class TrelloModule {}
