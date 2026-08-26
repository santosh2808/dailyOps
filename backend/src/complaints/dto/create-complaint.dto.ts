import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

// complaintNumber is deliberately absent — always auto-generated server-side
// (ComplaintsService.generateComplaintNumber()), same convention as
// Lead.leadNumber / Supplier.supplierCode. status also isn't settable here —
// every complaint starts OPEN; use PATCH /:id/status to move it along.
export class CreateComplaintDto {
  @ApiProperty({ description: 'The Sales Order this complaint is about (customer and invoice are derived from it)' })
  @IsUUID()
  salesOrderId: string;

  @ApiProperty({ example: 'Fan making unusual noise after installation' })
  @IsString()
  @IsNotEmpty({ message: 'Subject is required' })
  subject: string;

  @ApiPropertyOptional({ example: 'Customer reports a rattling sound within a week of dispatch.' })
  @IsOptional()
  @IsString()
  description?: string;
}
