import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

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

  // Bug fix (TC-042/TC-048): Log Complaint previously never asked for an
  // invoice number at all, so a manually-logged complaint could only ever
  // be verified later via the separate Invoice Verification lookup/link
  // step on the Details page. Optional here (a complaint can still be
  // logged before the customer has the number handy) — when supplied,
  // ComplaintsService.create() auto-runs the same TaxInvoice lookup
  // findInvoiceForLookup()/linkInvoice() already use, right at creation
  // time, instead of requiring a separate manual step.
  @ApiPropertyOptional({ example: 'TI-2026-000123' })
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  // Bug fix (TC-063): lets staff skip the acknowledgement email this create()
  // would otherwise send (see ComplaintsService.create()) — e.g. when
  // logging a complaint on the customer's behalf and they don't want an
  // email. Defaults to true (unchanged behavior) when omitted.
  @ApiPropertyOptional({ default: true, description: 'Send the acknowledgement email to the customer on creation' })
  @IsOptional()
  @IsBoolean()
  sendConfirmationEmail?: boolean = true;
}
