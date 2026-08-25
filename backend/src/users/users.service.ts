import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { QuickCreateUserDto } from './dto/quick-create-user.dto';

const USER_LIST_INCLUDE = {
  department: true,
  roles: { include: { role: true } },
};

// Lead Assignment dropdown is scoped to exactly these two roles (requirement
// #3 of the Lead Assignment enhancement) — used by both findAssignable()
// and quickCreate()'s role restriction below.
const ASSIGNABLE_ROLE_NAMES = ['Sales Executive', 'Sales Manager'];

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // Unchanged — used by AuthService during login when the identifier typed
  // looks like an email. Still returns the raw row (including the password
  // hash), exactly as before.
  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findByUsername(username: string) {
    return this.prisma.user.findUnique({ where: { username } });
  }

  // Enterprise RBAC (login by Username or Email): the single lookup
  // AuthService.validateUser() calls — matches whichever of the two the
  // typed identifier turns out to be, so the login form only needs one
  // input field. Both sides of the OR are compared lowercased, same
  // normalization applied when a user/username is created.
  findByUsernameOrEmail(identifier: string) {
    const value = identifier.trim().toLowerCase();
    return this.prisma.user.findFirst({
      where: { OR: [{ email: value }, { username: value }] },
    });
  }

  // Unchanged signature/behavior — kept for any other caller that only
  // wants the bare row. JwtStrategy now calls findByIdWithAccess() below
  // instead, so this one is no longer on that path, but nothing about it
  // was altered.
  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  // Enterprise RBAC: resolves the union of Permission codes (and Role names)
  // across every Role this user currently holds. Queried fresh on every
  // call (JwtStrategy calls this on every authenticated request), so a
  // permission/role change takes effect on the user's very next request —
  // no re-login required. `username`/`mustChangePassword` come along for
  // free as plain scalar columns on `user`.
  async findByIdWithAccess(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        department: true,
        roles: {
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
      },
    });
    if (!user) {
      return null;
    }

    const roleNames = user.roles.map((userRole) => userRole.role.name);
    const permissionCodes = Array.from(
      new Set(
        user.roles.flatMap((userRole) =>
          userRole.role.permissions.map((rolePermission) => rolePermission.permission.code),
        ),
      ),
    );

    return { ...user, roleNames, permissionCodes };
  }

  findAll(query: QueryUserDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { username: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    return Promise.all([
      this.prisma.user.findMany({
        where,
        include: USER_LIST_INCLUDE,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]).then(([data, total]) => ({
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    }));
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: USER_LIST_INCLUDE });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async create(dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    const username = dto.username.trim().toLowerCase();

    const [existingEmail, existingUsername] = await Promise.all([
      this.findByEmail(email),
      this.findByUsername(username),
    ]);
    if (existingEmail) {
      throw new ConflictException('A user with this email already exists');
    }
    if (existingUsername) {
      throw new ConflictException('A user with this username already exists');
    }

    const hashed = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        username,
        email,
        password: hashed,
        phone: dto.phone?.trim() || undefined,
        departmentId: dto.departmentId,
        // Every user created here (there's no other way to create one —
        // "All other users must be created dynamically through
        // Administration -> Users") starts with a temporary password set by
        // the Administrator, so they're always required to set their own on
        // first login, same as the seeded System Administrator account.
        mustChangePassword: true,
        roles: dto.roleIds?.length
          ? { create: dto.roleIds.map((roleId) => ({ roleId })) }
          : undefined,
      },
      include: USER_LIST_INCLUDE,
    });
  }

  // Lead Assignment dropdown — active users holding either Sales role.
  // Deliberately returns only the fields needed to display/select a user
  // (never the password hash).
  findAssignable() {
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        roles: { some: { role: { name: { in: ASSIGNABLE_ROLE_NAMES } } } },
      },
      select: { id: true, name: true, email: true, username: true },
      orderBy: { name: 'asc' },
    });
  }

  // "+ Add User" quick-create, opened from the Lead Assignment picker.
  // Deliberately a smaller field set than create() above (no
  // username/password collected from whoever is filling this in), but
  // preserves every existing User invariant: unique username (generated
  // from the email, with a numeric-suffix retry on conflict — same retry
  // convention used for Lead/Quotation number generation), a hashed random
  // temporary password, and mustChangePassword forced true. Restricted to
  // the two roles the Lead Assignment dropdown is scoped to — use the full
  // Administration -> Users screen to create a user with any other role.
  async quickCreate(dto: QuickCreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    const existingEmail = await this.findByEmail(email);
    if (existingEmail) {
      throw new ConflictException('A user with this email already exists');
    }

    const role = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
    if (!role || !ASSIGNABLE_ROLE_NAMES.includes(role.name)) {
      throw new BadRequestException('Role must be Sales Executive or Sales Manager');
    }

    const username = await this.generateUniqueUsername(email);
    // Never returned to the client — this account's real password is meant
    // to be set via the normal Reset Password action if/when this person
    // needs to log in themselves; mustChangePassword ensures that's forced
    // regardless.
    const temporaryPassword = crypto.randomBytes(9).toString('base64url');
    const hashed = await bcrypt.hash(temporaryPassword, 10);

    return this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        username,
        email,
        password: hashed,
        phone: dto.phone?.trim() || undefined,
        departmentId: dto.departmentId,
        isActive: dto.isActive ?? true,
        mustChangePassword: true,
        roles: { create: [{ roleId: dto.roleId }] },
      },
      include: USER_LIST_INCLUDE,
    });
  }

  private async generateUniqueUsername(email: string): Promise<string> {
    const base = email.split('@')[0].replace(/[^a-z0-9_.]/g, '').slice(0, 28) || 'user';
    const seed = base.length >= 3 ? base : `${base}user`.slice(0, 32);
    let candidate = seed;
    let suffix = 1;
    while (await this.findByUsername(candidate)) {
      suffix += 1;
      candidate = `${seed}${suffix}`.slice(0, 32);
    }
    return candidate;
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);

    if (dto.email) {
      const existing = await this.findByEmail(dto.email.trim().toLowerCase());
      if (existing && existing.id !== id) {
        throw new ConflictException('A user with this email already exists');
      }
    }
    if (dto.username) {
      const existing = await this.findByUsername(dto.username.trim().toLowerCase());
      if (existing && existing.id !== id) {
        throw new ConflictException('A user with this username already exists');
      }
    }

    // Replaces the full role set in one go when roleIds is provided — same
    // "PATCH with the full list" convention as RolesService.update()'s
    // permissionIds handling. Note: password is deliberately not settable
    // here — that's Reset Password's job (see resetPassword() below), kept
    // as its own distinct action/endpoint rather than folded into general
    // edit.
    return this.prisma.$transaction(async (tx) => {
      if (dto.roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } });
      }
      return tx.user.update({
        where: { id },
        data: {
          ...(dto.name ? { name: dto.name.trim() } : {}),
          ...(dto.email ? { email: dto.email.trim().toLowerCase() } : {}),
          ...(dto.username ? { username: dto.username.trim().toLowerCase() } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
          ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.roleIds
            ? { roles: { create: dto.roleIds.map((roleId) => ({ roleId })) } }
            : {}),
        },
        include: USER_LIST_INCLUDE,
      });
    });
  }

  // Administrator action ("Reset Passwords"), distinct from general Edit —
  // sets a new password on someone else's account and always forces them to
  // change it again on their next login, since an Administrator-chosen
  // password is inherently temporary/shared out of band.
  async resetPassword(id: string, newPassword: string) {
    await this.findOne(id);
    const hashed = await bcrypt.hash(newPassword, 10);
    return this.prisma.user.update({
      where: { id },
      data: { password: hashed, mustChangePassword: true },
      include: USER_LIST_INCLUDE,
    });
  }

  // Self-service password change — the only way mustChangePassword ever
  // gets cleared. Requires knowing the current password (unlike
  // resetPassword, which an Administrator uses on someone else's account
  // without knowing their old one).
  async changeOwnPassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const hashed = await bcrypt.hash(newPassword, 10);
    return this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed, mustChangePassword: false },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    // Soft delete (disable), same isActive convention as
    // Customer/Product/Material — never a hard delete, so audit/history
    // (createdBy, UserRole assignment history) is preserved.
    return this.prisma.user.update({ where: { id }, data: { isActive: false } });
  }
}
