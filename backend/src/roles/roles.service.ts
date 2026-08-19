import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

const ROLE_INCLUDE = {
  permissions: { include: { permission: true } },
  _count: { select: { users: true } },
};

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.role.findMany({
      include: ROLE_INCLUDE,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id }, include: ROLE_INCLUDE });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    return role;
  }

  async create(dto: CreateRoleDto) {
    const existing = await this.prisma.role.findUnique({ where: { name: dto.name.trim() } });
    if (existing) {
      throw new ConflictException('A role with this name already exists');
    }
    return this.prisma.role.create({
      data: {
        name: dto.name.trim(),
        description: dto.description,
        permissions: dto.permissionIds?.length
          ? { create: dto.permissionIds.map((permissionId) => ({ permissionId })) }
          : undefined,
      },
      include: ROLE_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateRoleDto) {
    await this.findOne(id);
    if (dto.name) {
      const existing = await this.prisma.role.findUnique({ where: { name: dto.name.trim() } });
      if (existing && existing.id !== id) {
        throw new ConflictException('A role with this name already exists');
      }
    }

    // Replacing the full permission set (rather than diffing add/remove) is
    // the simplest correct semantics for "save this role's permission
    // checklist" from the Role edit screen — same replace-the-whole-list
    // pattern used by Lead's products/Quotation's items elsewhere in this
    // codebase.
    return this.prisma.$transaction(async (tx) => {
      if (dto.permissionIds) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
      }
      return tx.role.update({
        where: { id },
        data: {
          ...(dto.name ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.permissionIds
            ? { permissions: { create: dto.permissionIds.map((permissionId) => ({ permissionId })) } }
            : {}),
        },
        include: ROLE_INCLUDE,
      });
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    // Cascades to RolePermission and UserRole rows for this role (see the
    // onDelete: Cascade relations in schema.prisma) — any user who only had
    // this role loses it, same as removing any other join-table row.
    return this.prisma.role.delete({ where: { id } });
  }
}
