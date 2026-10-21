import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { IMAGE_ALT_MAX_LENGTH } from '../content.constants';

// Stored image
export class ContentImageDto {
  @ApiProperty({ example: 'content/spyro/2026/10/3f0c2a9e-0a4b-4c7e-9a51-2d8f1b6c9e10.jpg' })
  @IsString()
  @IsNotEmpty({ message: 'Image is required' })
  key: string;

  @ApiPropertyOptional({ example: 'Two HVLS fans above a packing line', description: 'Required to publish' })
  @IsOptional()
  @IsString()
  @MaxLength(IMAGE_ALT_MAX_LENGTH, { message: `Image description must be ${IMAGE_ALT_MAX_LENGTH} characters or fewer` })
  alt?: string;
}
