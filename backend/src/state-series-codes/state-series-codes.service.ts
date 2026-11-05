import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { INDIA_STATES } from '../common/india-states';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStateSeriesCodeDto } from './dto/create-state-series-code.dto';

// Each state's series is assumed to have room for up to this many JEOs
// before it would start colliding with the next state's block — matches
// exactly how the given example series (Telangana 4000, Andhra Pradesh
// 5000, Tamil Nadu 6000, Karnataka 7000, Kerala 8000, Maharashtra 9000) are
// spaced 1000 apart. Only enforced when an Administrator adds a new series
// (create()) as a sanity check against overlap, and by the JEO number
// itself (seriesStart + Sales Order sequence, which must stay below this) —
// see JobExecutionOrdersService.generateJeoNumber().
export const SERIES_BLOCK_SIZE = 1000;

// The very first series, if a state is ever auto-assigned before any has
// been configured (matches Telangana's 4000 in the original example set).
const FIRST_SERIES_START = 4000;

@Injectable()
export class StateSeriesCodesService {
  private readonly logger = new Logger(StateSeriesCodesService.name);

  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.stateSeriesCode.findMany({ orderBy: { seriesStart: 'asc' } });
  }

  async create(dto: CreateStateSeriesCodeDto) {
    // Same lock as seriesForState()'s automatic assignment, so an
    // Administrator adding a series and a JEO auto-assigning one can never
    // both pass the overlap check with the same block.
    return this.prisma.$transaction(async (tx) => {
      await lockSeriesTable(tx);
      const existing = await tx.stateSeriesCode.findUnique({ where: { state: dto.state } });
      if (existing) {
        throw new ConflictException(
          `${dto.state} already has a series configured (starting at ${existing.seriesStart}).`,
        );
      }

      const all = await tx.stateSeriesCode.findMany();
      const overlapping = all.find((row) => Math.abs(row.seriesStart - dto.seriesStart) < SERIES_BLOCK_SIZE);
      if (overlapping) {
        throw new ConflictException(
          `${dto.seriesStart} is too close to ${overlapping.state}'s series (starting at ${overlapping.seriesStart}). Series should be at least ${SERIES_BLOCK_SIZE} apart.`,
        );
      }

      return tx.stateSeriesCode.create({
        data: { state: dto.state, seriesStart: dto.seriesStart, nextNumber: dto.seriesStart },
      });
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.stateSeriesCode.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('State series code not found');
    }
    // JEOs already generated under this series keep their already-assigned
    // jeoNumber (immutable/historical) — deleting the config just means the
    // state's next JEO is auto-assigned a fresh series (seriesForState()),
    // unless an Administrator configures one first.
    return this.prisma.stateSeriesCode.delete({ where: { id } });
  }

  // Used by JobExecutionOrdersService.generateJeoNumber(): the series for
  // this state, assigned automatically the first time a JEO is generated
  // for a state nobody has configured yet — the next block above the
  // highest existing one (e.g. 4000…9000 configured → 10000), the same
  // SERIES_BLOCK_SIZE spacing create() enforces. The table lock serializes
  // concurrent first JEOs for different new states, which would otherwise
  // both pick the same block; the same state racing itself is settled by
  // the unique `state` column (re-read after the lock).
  async seriesForState(state: string): Promise<{ state: string; seriesStart: number }> {
    const canonical = INDIA_STATES.find((s) => s.toLowerCase() === state.trim().toLowerCase());
    if (!canonical) {
      throw new BadRequestException(
        `"${state}" is not a recognised Indian state or union territory, so no JEO number series can be assigned. Correct the customer's state first.`,
      );
    }
    const configured = await this.prisma.stateSeriesCode.findUnique({ where: { state: canonical } });
    if (configured) return configured;

    return this.prisma.$transaction(async (tx) => {
      await lockSeriesTable(tx);
      const raced = await tx.stateSeriesCode.findUnique({ where: { state: canonical } });
      if (raced) return raced;
      const highest = await tx.stateSeriesCode.aggregate({ _max: { seriesStart: true } });
      const seriesStart =
        highest._max.seriesStart == null ? FIRST_SERIES_START : highest._max.seriesStart + SERIES_BLOCK_SIZE;
      this.logger.log(`Assigned JEO series ${seriesStart} to ${canonical} automatically`);
      return tx.stateSeriesCode.create({ data: { state: canonical, seriesStart, nextNumber: seriesStart } });
    });
  }
}

// Blocks other writers (create(), seriesForState()) until the transaction
// ends; plain reads are unaffected.
function lockSeriesTable(tx: Prisma.TransactionClient) {
  return tx.$executeRaw`LOCK TABLE "StateSeriesCode" IN SHARE ROW EXCLUSIVE MODE`;
}
