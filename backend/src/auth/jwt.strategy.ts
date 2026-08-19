import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'supersecretjwtkey_change_me',
    });
  }

  async validate(payload: { sub: string; email: string; role: string }) {
    // findByIdWithAccess (not the plain findById) so every authenticated
    // request carries a freshly-computed permission set — see the
    // UsersService method comment for why this is deliberately re-queried
    // per request rather than cached in the JWT payload.
    const user = await this.usersService.findByIdWithAccess(payload.sub);
    if (!user || !user.isActive) {
      return null;
    }

    return {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      // Legacy field, unchanged — still exactly what it was before RBAC.
      role: user.role,
      createdAt: user.createdAt,
      departmentId: user.departmentId,
      department: user.department?.name ?? null,
      // Enterprise RBAC additions. `roles` is display-only; every
      // authorization decision (PermissionsGuard) checks `permissions`,
      // never `roles`.
      roles: user.roleNames,
      permissions: user.permissionCodes,
      // Recomputed fresh on every request (not just at login) — if an
      // Administrator resets this user's password while they're mid-session
      // elsewhere, their very next request picks up the forced redirect.
      mustChangePassword: user.mustChangePassword,
    };
  }
}
