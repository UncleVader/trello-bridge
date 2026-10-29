import {
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateChecklistDto {
  /** Checklist title. Defaults to `Build`. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  /** Check items, created unticked, in the given order. */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  items!: string[];
}
