import { PartialType } from '@nestjs/swagger';
import { CreateEmailTemplateDto } from './create-email-template.dto';

// `key` is technically editable via this PartialType (nothing blocks it at
// the DTO level), but EmailTemplatesService.update() below deliberately
// ignores any attempt to change it — the whole point of `key` is to be the
// stable lookup MailerService.send() uses, so it must never drift once a
// template row exists.
export class UpdateEmailTemplateDto extends PartialType(CreateEmailTemplateDto) {}
