import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ApprovalDecisionsService } from './approval-decisions.service';
import { DecideOverrideApprovalDto } from './dto/decide-override-approval.dto';

// Override Approval workflow — the public, no-login counterpart to
// PublicQuotationsController: reached from an email link by Santosh or
// Amarpal, neither of whom has (or needs) a DailyOps account. No auth
// guards at all, same as PublicQuotationsController — every method on
// ApprovalDecisionsService this calls re-validates the token/expiry/status
// itself, so nothing here relies on the absence of a guard for correctness,
// only for letting the request in at all.
@ApiTags('public-approvals')
@Controller('api/v1/public/approvals')
export class PublicApprovalsController {
  constructor(private approvalDecisionsService: ApprovalDecisionsService) {}

  @Get(':token')
  getApproval(@Param('token') token: string, @Req() req: Request) {
    return this.approvalDecisionsService.getPublicView(token, req.ip || 'unknown');
  }

  @Post(':token/approve')
  approve(@Param('token') token: string, @Body() dto: DecideOverrideApprovalDto, @Req() req: Request) {
    return this.approvalDecisionsService.approve(token, dto, req);
  }

  @Post(':token/reject')
  reject(@Param('token') token: string, @Body() dto: DecideOverrideApprovalDto, @Req() req: Request) {
    return this.approvalDecisionsService.reject(token, dto, req);
  }
}
