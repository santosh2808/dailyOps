import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.department.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!department) {
      throw new NotFoundException('Department not found');
    }
    return department;
  }

  async create(dto: CreateDepartmentDto) {
    const existing = await this.prisma.department.findUnique({ where: { name: dto.name.trim() } });
    if (existing) {
      throw new ConflictException('A department with this name already exists');
    }
    return this.prisma.department.create({
      data: { name: dto.name.trim(), description: dto.description },
    });
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    await this.findOne(id);
    if (dto.name) {
      const existing = await this.prisma.department.findUnique({ where: { name: dto.name.trim() } });
      if (existing && existing.id !== id) {
        throw new ConflictException('A department with this name already exists');
      }
    }
    return this.prisma.department.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    // Any User referencing this department has its departmentId set to
    // null automatically (see the onDelete: SetNull relation in
    // schema.prisma) — deleting a department never fails or orphans a user.
    return this.prisma.department.delete({ where: { id } });
  }
}
