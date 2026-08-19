import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Read-only catalog — Permissions are seeded (see prisma/seed.ts), not
// managed through the UI. This service exists solely to back the
// Permissions screen and to let RolesService validate permissionIds.
@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
  }
}
