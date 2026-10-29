import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Text fields of the multipart upload (the file itself is field `file`). */
export class AddAttachmentDto {
  /** Attachment name on the card. Defaults to the uploaded file name. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  /** `true` replaces an attachment with the same name; otherwise 409. */
  @IsOptional()
  @IsIn(['true', 'false'])
  replace?: 'true' | 'false';
}
