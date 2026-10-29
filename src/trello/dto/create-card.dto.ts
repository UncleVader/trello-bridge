import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CreateChecklistDto } from './create-checklist.dto';

export class CreateCardDto {
  /** Card title. For tickets, use the standard `ID: Title` format
   * (`E2-1C-13: …`, `1C-12: …`, `FB-12: …`) — the stable id prefix doubles
   * as the duplicate guard. */
  @IsString()
  @IsNotEmpty()
  name!: string;

  /** Target list, resolved by name with the usual prefix-then-substring
   * rules ("Backlog", "Review"). */
  @IsString()
  @IsNotEmpty()
  list!: string;

  /** Card description (markdown). */
  @IsOptional()
  @IsString()
  description?: string;

  /** Optional checklist to create on the new card (same shape as
   * POST /cards/:query/checklists). */
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateChecklistDto)
  checklist?: CreateChecklistDto;
}
