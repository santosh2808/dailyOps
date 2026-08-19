import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMaterialUnitDto } from './dto/create-material-unit.dto';

@Injectable()
export class MaterialUnitsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.materialUnit.findMany({ orderBy: { name: 'asc' } });
  }

  async create(dto: CreateMaterialUnitDto) {
    const existing = await this.prisma.materialUnit.findUnique({
      where: { name: dto.name.trim() },
    });
    if (existing) {
      throw new ConflictException('A material unit with this name already exists');
    }
    try {
      return await this.prisma.materialUnit.create({
        data: { name: dto.name.trim(), symbol: dto.symbol },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A material unit with this name already exists');
      }
      throw error;
    }
  }
}
