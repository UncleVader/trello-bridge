import { IsNotEmpty, IsString } from 'class-validator';

export class RenameCardDto {
  /** New card title. Trimmed and rejected with 400 if blank. */
  @IsString()
  @IsNotEmpty()
  name!: string;
}
