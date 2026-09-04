import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from './require-permission.decorator';

// Must run AFTER JwtAuthGuard on the same route (i.e. listed after it in
// that controller's @UseGuards(...)) so `request.user` — and specifically
// `request.user.permissions`, computed by JwtStrategy.validate() — already
// exists by the time this guard runs. This is intentionally NOT registered
// as a global (APP_GUARD) guard: Nest always runs global guards before
// controller/method-scoped ones, which would run this before JwtAuthGuard
// and break every permission check.
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.get<string | string[] | undefined>(PERMISSION_KEY, context.getHandler());

    // No @RequirePermission/@RequireAllPermissions on this handler ->
    // nothing for this guard to enforce; whatever auth guard already sits
    // in front of it (JwtAuthGuard) is unaffected.
    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const permissions: string[] = request.user?.permissions ?? [];
    // Accepts either a single code (string, from @RequirePermission) or an
    // array of codes (from @RequireAllPermissions) — every one of them must
    // be present.
    const requiredCodes = Array.isArray(required) ? required : [required];
    const missing = requiredCodes.filter((code) => !permissions.includes(code));
    if (missing.length > 0) {
      throw new ForbiddenException(`Missing required permission(s): ${missing.join(', ')}`);
    }
    return true;
  }
}
