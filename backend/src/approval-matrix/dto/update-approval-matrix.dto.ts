import { PartialType } from '@nestjs/swagger';
import { CreateApprovalMatrixDto } from './create-approval-matrix.dto';

export class UpdateApprovalMatrixDto extends PartialType(CreateApprovalMatrixDto) {}
