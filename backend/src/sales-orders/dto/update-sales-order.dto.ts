import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateSalesOrderDto } from './create-sales-order.dto';

// Excludes `quotationId`: once a Sales Order is created, the Quotation it
// was generated from is immutable — it is never reassigned via update.
export class UpdateSalesOrderDto extends PartialType(
  OmitType(CreateSalesOrderDto, ['quotationId'] as const),
) {}
