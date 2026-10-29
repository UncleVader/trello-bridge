import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export type CheckItemState = 'complete' | 'incomplete';

export class UpdateCheckItemsDto {
  /** Restrict matching to one checklist (by name, case-insensitive).
   * Omit to match items across all of the card's checklists. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  checklist?: string;

  /** Item queries, resolved like `:query` (prefix, then substring; each
   * must match exactly one item). Provide either this or `all: true`. */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  items?: string[];

  /** Set every item on the matched checklist(s). Mutually exclusive with
   * `items`. */
  @IsOptional()
  @IsBoolean()
  all?: boolean;

  /** Target state; defaults to `complete` (ticking). */
  @IsOptional()
  @IsIn(['complete', 'incomplete'])
  state?: CheckItemState;
}
