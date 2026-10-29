import { IsNotEmpty, IsString } from 'class-validator';

export class MoveCardDto {
  /** Target list, resolved by name with the usual prefix-then-substring
   * rules ("Backlog", "Review", "Swamp"). */
  @IsString()
  @IsNotEmpty()
  list!: string;
}
