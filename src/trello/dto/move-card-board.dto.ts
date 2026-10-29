import { IsNotEmpty, IsString } from 'class-validator';

export class MoveCardBoardDto {
  /** Target board, resolved by the usual prefix-then-substring rules. */
  @IsString()
  @IsNotEmpty()
  board!: string;

  /** Target list on that board. */
  @IsString()
  @IsNotEmpty()
  list!: string;
}
