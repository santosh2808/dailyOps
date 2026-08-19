import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMaterialCategoryDto } from './dto/create-material-category.dto';

@Injectable()
export class MaterialCategoriesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.materialCategory.findMany({ orderBy: { name: 'asc' } });
  }

  async create(dto: CreateMaterialCategoryDto) {
    const existing = await this.prisma.materialCategory.findUnique({
      where: { name: dto.name.trim() },
    });
    if (existing) {
      throw new ConflictException('A material category with this name already exists');
    }
    try {
      return await this.prisma.materialCategory.create({
        data: { name: dto.name.trim(), description: dto.description },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A material category with this name already exists');
      }
      throw error;
    }
  }
}
