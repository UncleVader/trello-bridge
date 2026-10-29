import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CardsService, CardView } from './cards.service';
import { AddCheckItemsDto } from './dto/add-checkitems.dto';
import { AddAttachmentDto } from './dto/add-attachment.dto';
import { AddCommentDto } from './dto/add-comment.dto';
import { CreateCardDto } from './dto/create-card.dto';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { MoveCardDto } from './dto/move-card.dto';
import { MoveCardBoardDto } from './dto/move-card-board.dto';
import { RenameCardDto } from './dto/rename-card.dto';
import { RenameChecklistDto } from './dto/rename-checklist.dto';
import { UpdateCheckItemDto } from './dto/update-checkitem.dto';
import { UpdateCheckItemsDto } from './dto/update-checkitems.dto';
import { UpdateDescriptionDto } from './dto/update-description.dto';

/** Trello's per-file limit on free workspaces. */
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** The fields of multer's in-memory file this controller uses (avoids a
 * dependency on @types/multer). */
interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

/**
 * Card endpoints. `:query` is either:
 * - a Trello shortLink (`dKOgYxWs`), a 24-hex card id, or a card URL
 *   containing `/c/<shortLink>` (percent-encode the URL so it stays one
 *   path segment) — resolved with `GET /1/cards/{id}` and no board header;
 * - or a card-name query: case-insensitive prefix match first, then substring
 *   ("FB-2", "FF-2.1", ...). No match → 404, ambiguous → 409, both listing
 *   candidates in the error message. Name queries require `X-Trello-Board`.
 *
 * `X-Trello-Board` (percent-encoded board name): required for name lookups
 * and for `POST /cards`. The bridge has no configured/default board.
 * Missing/blank header on a name query → 400. Ignored when `:query` is a
 * shortLink or card URL — a wrong board must not hide that card.
 */
@Controller('cards')
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  /** Create a card in a list (resolved by name), optionally with a
   * description and a checklist. 409 on a duplicate ticket id / name. */
  @Post()
  createCard(
    @Body() dto: CreateCardDto,
    @Headers('x-trello-board') board?: string,
  ) {
    return this.cards.createCard(
      {
        name: dto.name,
        list: dto.list,
        description: dto.description,
        checklist: dto.checklist,
      },
      board,
    );
  }

  /** Read a card: description, checklists with tick state, latest comments. */
  @Get(':query')
  getCard(
    @Param('query') query: string,
    @Query('comments', new DefaultValuePipe(5), ParseIntPipe)
    comments: number,
    @Headers('x-trello-board') board?: string,
  ): Promise<CardView> {
    return this.cards.getCard(query, comments, board);
  }

  /** Rename a card. Rejects a blank/whitespace name with 400; the DTO
   * whitelist keeps this from touching any other card field. */
  @Patch(':query')
  renameCard(
    @Param('query') query: string,
    @Body() dto: RenameCardDto,
    @Headers('x-trello-board') board?: string,
  ) {
    return this.cards.renameCard(query, dto.name, board);
  }

  /** Move a card to a different list (resolved by name, prefix-then-
   * substring). Reports the list it moved from as well as the one it moved
   * to. */
  @Patch(':query/list')
  moveCard(
    @Param('query') query: string,
    @Body() dto: MoveCardDto,
    @Headers('x-trello-board') board?: string,
  ) {
    return this.cards.moveCard(query, dto.list, board);
  }

  /** Move a card, preserving identity and content, to a list on another
   * board. X-Trello-Board identifies the source board. */
  @Patch(':query/board')
  moveCardToBoard(
    @Param('query') query: string,
    @Body() dto: MoveCardBoardDto,
    @Headers('x-trello-board') board?: string,
  ) {
    return this.cards.moveCardToBoard(query, dto.board, dto.list, board);
  }

  /** Update the description. Append mode by default — nothing is lost. */
  @Patch(':query/description')
  updateDescription(
    @Param('query') query: string,
    @Body() dto: UpdateDescriptionDto,
    @Headers('x-trello-board') board?: string,
  ) {
    return this.cards.updateDescription(
      query,
      dto.content,
      dto.mode ?? 'append',
      dto.separator,
      board,
    );
  }

  /** Post a status-update comment (does not touch the description). */
  @Post(':query/comments')
  addComment(
    @Param('query') query: string,
    @Body() dto: AddCommentDto,
    @Headers('x-trello-board') board?: string,
  ) {
    return this.cards.addComment(query, dto.text, board);
  }

  /** Replace the text of one comment by its id (from `GET` / `POST`).
   * 404 if the id is not a comment on this card. */
  @Patch(':query/comments/:commentId')
  updateComment(
    @Param('query') query: string,
    @Param('commentId') commentId: string,
    @Body() dto: AddCommentDto,
    @Headers('x-trello-board') board?: string,
  ) {
    return this.cards.updateComment(query, commentId, dto.text, board);
  }

  /** Delete one comment by its id. 404 if it is not on this card. */
  @Delete(':query/comments/:commentId')
  deleteComment(
    @Param('query') query: string,
    @Param('commentId') commentId: string,
    @Headers('x-trello-board') board?: string,
  ) {
    return this.cards.deleteComment(query, commentId, board);
  }

  /** Upload a file (multipart field `file`) as an attachment. `name`
   * overrides the file name; an existing attachment with that name is 409
   * unless `replace=true`. */
  @Post(':query/attachments')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES } }),
  )
  addAttachment(
    @Param('query') query: string,
    @UploadedFile() file: UploadedFileLike | undefined,
    @Body() dto: AddAttachmentDto,
    @Headers('x-trello-board') board?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Multipart field "file" is required.');
    }
    // multer reads the multipart filename as latin1; Cyrillic names need
    // to be re-decoded as UTF-8.
    const original = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const name = dto.name?.trim() || original;
    return this.cards.addAttachment(
      query,
      {
        name,
        mimeType: file.mimetype || 'application/octet-stream',
        buffer: file.buffer,
      },
      dto.replace === 'true',
      board,
    );
  }

  /** Delete one attachment by name (prefix-then-substring; 404/409). */
  @Delete(':query/attachments/:name')
  deleteAttachment(
    @Param('query') query: string,
    @Param('name') name: string,
    @Headers('x-trello-board') board?: string,
  ) {
    return this.cards.deleteAttachment(query, name, board);
  }

  /** Create a checklist (default name `Build`) with unticked items.
   * 409 if a checklist with that name already exists on the card. */
  @Post(':query/checklists')
  createChecklist(
    @Param('query') query: string,
    @Body() dto: CreateChecklistDto,
    @Headers('x-trello-board') board?: string,
  ) {
    return this.cards.createChecklist(
      query,
      dto.name ?? 'Build',
      dto.items,
      board,
    );
  }

  /** Append unticked items to an existing checklist (by name,
   * prefix-then-substring; 404/409). Items already on it are skipped. */
  @Post(':query/checklists/:name/items')
  addCheckItems(
    @Param('query') query: string,
    @Param('name') name: string,
    @Body() dto: AddCheckItemsDto,
    @Headers('x-trello-board') board?: string,
  ) {
    return this.cards.addCheckItems(query, name, dto.items, board);
  }

  /** Rename a checklist (by name; 404/409, 409 on a name clash). */
  @Patch(':query/checklists/:name')
  renameChecklist(
    @Param('query') query: string,
    @Param('name') name: string,
    @Body() dto: RenameChecklistDto,
    @Headers('x-trello-board') board?: string,
  ) {
    return this.cards.renameChecklist(query, name, dto.name, board);
  }

  /** Edit one item's text and/or state. `:item` is matched by name inside
   * the checklist (prefix-then-substring; 404/409). */
  @Patch(':query/checklists/:name/items/:item')
  updateCheckItem(
    @Param('query') query: string,
    @Param('name') name: string,
    @Param('item') item: string,
    @Body() dto: UpdateCheckItemDto,
    @Headers('x-trello-board') board?: string,
  ) {
    return this.cards.updateCheckItem(
      query,
      name,
      item,
      { name: dto.name, state: dto.state },
      board,
    );
  }

  /** Delete one item (matched by name inside the checklist; 404/409). */
  @Delete(':query/checklists/:name/items/:item')
  deleteCheckItem(
    @Param('query') query: string,
    @Param('name') name: string,
    @Param('item') item: string,
    @Headers('x-trello-board') board?: string,
  ) {
    return this.cards.deleteCheckItem(query, name, item, board);
  }

  /** Delete one checklist by name (prefix-then-substring; 404 no match,
   * 409 ambiguous, both listing candidates). */
  @Delete(':query/checklists/:name')
  deleteChecklist(
    @Param('query') query: string,
    @Param('name') name: string,
    @Headers('x-trello-board') board?: string,
  ) {
    return this.cards.deleteChecklist(query, name, board);
  }

  /** Tick (default) or untick checklist items: `items` queries or
   * `all: true`, optionally scoped to one `checklist` by name. */
  @Patch(':query/checkitems')
  updateCheckItems(
    @Param('query') query: string,
    @Body() dto: UpdateCheckItemsDto,
    @Headers('x-trello-board') board?: string,
  ) {
    return this.cards.setCheckItemStates(
      query,
      {
        checklist: dto.checklist,
        items: dto.items,
        all: dto.all,
        state: dto.state ?? 'complete',
      },
      board,
    );
  }
}
