import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  // `identifier` is whatever was typed into the single login field — either
  // a username ("admin") or an email ("admin@smartrotamac.com"). See
  // UsersService.findByUsernameOrEmail() for the actual lookup.
  async validateUser(identifier: string, password: string) {
    const user = await this.usersService.findByUsernameOrEmail(identifier);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // isActive is new (Enterprise RBAC) — a deactivated ("deleted") user
    // from the Users screen can no longer log in. Pre-existing users are
    // unaffected: the column defaults to true.
    if (!user.isActive) {
      throw new UnauthorizedException('This account has been deactivated');
    }

    return user;
  }

  async login(identifier: string, password: string) {
    const user = await this.validateUser(identifier, password);
    const payload = { sub: user.id, email: user.email, role: user.role };

    // Same enriched shape JwtStrategy.validate() returns for GET
    // /auth/profile — computed here too so the frontend has the user's
    // roles/permissions immediately after login, without needing a second
    // round trip to /auth/profile before the sidebar can render.
    const withAccess = await this.usersService.findByIdWithAccess(user.id);

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        departmentId: withAccess?.departmentId ?? null,
        department: withAccess?.department?.name ?? null,
        roles: withAccess?.roleNames ?? [],
        permissions: withAccess?.permissionCodes ?? [],
        // Force Password Change on First Login — ProtectedRoute redirects
        // to /change-password on the frontend for as long as this is true.
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  // Self-service password change (the only way mustChangePassword ever gets
  // cleared) — delegates to UsersService.changeOwnPassword(), which verifies
  // currentPassword before allowing the change.
  changePassword(userId: string, currentPassword: string, newPassword: string) {
    return this.usersService.changeOwnPassword(userId, currentPassword, newPassword);
  }
}
