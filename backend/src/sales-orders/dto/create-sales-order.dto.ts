import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { SalesOrderItemInputDto } from './sales-order-item-input.dto';

export class CreateSalesOrderDto {
  @ApiProperty({ description: 'Id (uuid) of the ACCEPTED Quotation this Sales Order is created from' })
  @IsUUID()
  quotationId: string;

  @ApiProperty({
    type: [SalesOrderItemInputDto],
    description:
      'Must cover the same products as the linked Quotation. Quantity is the only field a user is expected to edit before saving.',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'A sales order needs at least one item' })
  @ValidateNested({ each: true })
  @Type(() => SalesOrderItemInputDto)
  items: SalesOrderItemInputDto[];

  @ApiPropertyOptional({ example: '2026-08-01', description: 'Defaults to today if omitted' })
  @IsOptional()
  @IsDateString()
  orderDate?: string;

  @ApiPropertyOptional({ example: '2026-09-15' })
  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @ApiPropertyOptional({ example: '50% advance, balance before dispatch' })
  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @ApiPropertyOptional({ example: 50, description: 'Percentage of the grand total expected as advance' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  advancePercentage?: number;

  @ApiPropertyOptional({ example: 18, default: 18, description: 'GST percentage applied to each line item' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'GST percent must be a positive number' })
  gstPercent?: number;

  // Removed: a separate order-level "Additional Discount" field used to
  // live here, on top of each line's own discount. Dropped per QA SC-004 —
  // Quotation already has its own discount mechanism (Quotation.discount),
  // which is what's negotiated before a Sales Order even exists and already
  // flows through into this Sales Order's grandTotal (see
  // SalesOrdersService.freezeToQuotationTotalsIfUnmodified()). Stacking a
  // second, independent order-level discount on top of that was redundant
  // and — because it wasn't clamped against the subtotal — could drive
  // grandTotal negative. Per-line item discounts (SalesOrderItemInputDto.discount)
  // are unaffected and remain the one discounting mechanism at this stage.

  // QA bug fix (SC-005): Billing/Shipping Address are required for every
  // manually created/edited Sales Order — dispatch, installation and
  // invoicing all depend on having a real address, and previously these
  // fields could be left blank entirely. Kept TS-optional (`?`) rather than
  // required, though: SalesOrdersService.createFromQuotation() auto-creates
  // a Sales Order the instant a Quotation is Accepted, before staff have
  // had a chance to enter any address, and that internal call bypasses the
  // HTTP ValidationPipe entirely (it's a direct method call, not a
  // @Body()-bound request) — so making the TS type itself required would
  // break that call's compile-time shape for no runtime benefit. The
  // @IsNotEmpty() below is what actually enforces "required" for the two
  // HTTP-facing paths that do go through the ValidationPipe: manual
  // POST /sales-orders and PATCH /sales-orders/:id (whenever the field is
  // included in the request body at all — see UpdateSalesOrderDto's
  // PartialType, which still leaves an explicitly-empty value rejected).
  @ApiProperty({
    example: 'Acme Corp, 123 Industrial Estate, Pune',
    description: 'Required for manual create/update — see comment above for the one exception.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Billing Address is required.' })
  billingAddress?: string;

  @ApiProperty({
    example: 'Acme Corp Warehouse, Plot 4, MIDC, Pune',
    description:
      'Required for manual create/update — same as Billing Address if delivery goes to the billing location.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Shipping Address is required.' })
  shippingAddress?: string;

  @ApiPropertyOptional({ example: 'Deliver during working hours only' })
  @IsOptional()
  @IsString()
  specialInstructions?: string;

  @ApiPropertyOptional({ example: 'Customer requested expedited production' })
  @IsOptional()
  @IsString()
  remarks?: string;
}
