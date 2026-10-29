import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class RenameChecklistDto {
  /** New checklist title; blank/whitespace-only is rejected. */
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'name must not be blank' })
  name!: string;
}
