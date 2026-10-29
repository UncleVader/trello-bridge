import { IsIn, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { CheckItemState } from './update-checkitems.dto';

/** At least one of the fields is required (checked in the service). */
export class UpdateCheckItemDto {
  /** New item text. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'name must not be blank' })
  name?: string;

  @IsOptional()
  @IsIn(['complete', 'incomplete'])
  state?: CheckItemState;
}
