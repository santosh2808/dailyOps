import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';

// Fixed singleton row id — there is deliberately only ever one AiSettings
// row (see schema.prisma comment). Upserted into existence on first
// read/write rather than requiring a seed step; every column has a
// schema-level default, so an empty create() is always valid.
const AI_SETTINGS_ID = 'default';

@Injectable()
export class AiSettingsService {
  constructor(private prisma: PrismaService) {}

  async get() {
    return this.prisma.aiSettings.upsert({
      where: { id: AI_SETTINGS_ID },
      update: {},
      create: { id: AI_SETTINGS_ID },
    });
  }

  async update(dto: UpdateAiSettingsDto, actorName?: string) {
    return this.prisma.aiSettings.upsert({
      where: { id: AI_SETTINGS_ID },
      update: { ...dto, updatedBy: actorName },
      create: { id: AI_SETTINGS_ID, ...dto, updatedBy: actorName },
    });
  }
}
