import { IsNotEmpty, IsString } from 'class-validator';

export class AddCommentDto {
  /** Comment body (markdown). Comments are additive and timestamped by
   * Trello — the right place for status updates instead of re-editing the
   * description. */
  @IsString()
  @IsNotEmpty()
  text!: string;
}
