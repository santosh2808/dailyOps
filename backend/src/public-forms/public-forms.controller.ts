import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { PublicFormsService } from './public-forms.service';
import { CreatePublicFormSubmissionDto } from './dto/create-public-form-submission.dto';

// The public, unauthenticated counterpart to FormConfigurationController —
// reached directly by anonymous visitors on an external marketing website's
// contact/enquiry form. Deliberately NO auth guards at all, same posture as
// PublicQuotationsController. CORS for this path is handled separately by a
// scoped allowlist delegate in main.ts (PUBLIC_FORM_CORS_ORIGINS), not the
// app-wide `app.enableCors(...)` call. ThrottlerGuard is applied only to
// this controller (not globally — see app.module.ts) since this is the
// one anonymous, high-abuse-risk surface in the app.
@ApiTags('public-forms')
@UseGuards(ThrottlerGuard)
@Controller('api/v1/public/forms')
export class PublicFormsController {
  constructor(private publicFormsService: PublicFormsService) {}

  @Get(':publicFormKey')
  getPublicForm(@Param('publicFormKey') publicFormKey: string) {
    return this.publicFormsService.getPublicForm(publicFormKey);
  }

  // 201 for a newly created submission; 200 (not 201) on an idempotent
  // replay — the submission was not newly created, it's returning the
  // original reference number.
  @Post(':publicFormKey/submissions')
  async createSubmission(
    @Param('publicFormKey') publicFormKey: string,
    @Body() dto: CreatePublicFormSubmissionDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.publicFormsService.submit(publicFormKey, dto);
    res.status(result.replay ? 200 : 201);
    // Response shape is a hard requirement (plan §5 step 12): only ever
    // { referenceNumber } — never the Lead/Complaint id, classification, or
    // any routing internals, and email delivery status is never mentioned
    // either way.
    return { referenceNumber: result.referenceNumber };
  }
}
