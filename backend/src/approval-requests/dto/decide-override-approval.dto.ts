import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { DISPATCH_OVERRIDE_APPROVERS } from '../../sales-orders/dispatch-override-approvers';

// Body for POST /api/v1/public/approvals/:token/approve and .../reject.
// `approverName` must be one of the two fixed named approvers — same
// @IsIn(DISPATCH_OVERRIDE_APPROVERS) allow-list the old self-declare
// dropdown validated against, except now it's who's actually clicking the
// link (proven by holding the unguessable emailed token), not a free
// self-declaration typed into an authenticated staff member's own form.
export class DecideOverrideApprovalDto {
  @IsIn(DISPATCH_OVERRIDE_APPROVERS as unknown as string[])
  approverName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
