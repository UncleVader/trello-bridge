import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString } from 'class-validator';

export class AddCheckItemsDto {
  /** Items to append, unticked, in the given order. Ones already on the
   * checklist (case-insensitive) are skipped. */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  items!: string[];
}
