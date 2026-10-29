import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export type DescriptionMode = 'append' | 'replace';

export class UpdateDescriptionDto {
  /** Markdown content to write into the card description. */
  @IsString()
  @IsNotEmpty()
  content!: string;

  /**
   * `append` (default) adds the content below the existing description,
   * separated by the standard "Update — implementation notes" divider.
   * `replace` overwrites the
   * description entirely.
   */
  @IsOptional()
  @IsIn(['append', 'replace'])
  mode?: DescriptionMode;

  /** Optional custom separator for append mode (rarely needed). */
  @IsOptional()
  @IsString()
  separator?: string;
}
