import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStateSeriesCodeDto } from './dto/create-state-series-code.dto';

// Each state's series is assumed to have room for up to this many JEOs
// before it would start colliding with the next state's block — matches
// exactly how the given example series (Telangana 4000, Andhra Pradesh
// 5000, Tamil Nadu 6000, Karnataka 7000, Kerala 8000, Maharashtra 9000) are
// spaced 1000 apart. Only enforced when an Administrator adds a new series
// (create()) as a sanity check against overlap; the running counter itself
// (nextNumber) is never hard-capped once in use — see the module comment
// on JobExecutionOrdersService.generateJeoNumber().
export const SERIES_BLOCK_SIZE = 1000;

@Injectable()
export class StateSeriesCodesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.stateSeriesCode.findMany({ orderBy: { seriesStart: 'asc' } });
  }

  async create(dto: CreateStateSeriesCodeDto) {
    const existing = await this.prisma.stateSeriesCode.findUnique({ where: { state: dto.state } });
    if (existing) {
      throw new ConflictException(
        `${dto.state} already has a series configured (starting at ${existing.seriesStart}).`,
      );
    }

    const all = await this.prisma.stateSeriesCode.findMany();
    const overlapping = all.find((row) => Math.abs(row.seriesStart - dto.seriesStart) < SERIES_BLOCK_SIZE);
    if (overlapping) {
      throw new ConflictException(
        `${dto.seriesStart} is too close to ${overlapping.state}'s series (starting at ${overlapping.seriesStart}). Series should be at least ${SERIES_BLOCK_SIZE} apart.`,
      );
    }

    return this.prisma.stateSeriesCode.create({
      data: { state: dto.state, seriesStart: dto.seriesStart, nextNumber: dto.seriesStart },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.stateSeriesCode.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('State series code not found');
    }
    // JEOs already generated under this series keep their already-assigned
    // jeoNumber (immutable/historical) — deleting the config just means
    // future JEOs for this state fall back to the original
    // JEO-YYYY-NNNNNN scheme again until a new series is configured.
    return this.prisma.stateSeriesCode.delete({ where: { id } });
  }

  // Used by JobExecutionOrdersService.generateJeoNumber() — atomically
  // claims and returns the next number for this state's series, or null if
  // no series is configured for it yet (caller falls back to the original
  // scheme in that case). The increment-then-read-back pattern below is
  // safe under concurrent JEO creation: Postgres row-level locking on the
  // UPDATE means each concurrent caller gets a distinct post-increment
  // value, so `updated.nextNumber - 1` is unique per caller without needing
  // a separate SELECT ... FOR UPDATE.
  async claimNextNumber(state: string): Promise<number | null> {
    const config = await this.prisma.stateSeriesCode.findUnique({ where: { state } });
    if (!config) return null;
    const updated = await this.prisma.stateSeriesCode.update({
      where: { id: config.id },
      data: { nextNumber: { increment: 1 } },
      select: { nextNumber: true },
    });
    return updated.nextNumber - 1;
  }
}
