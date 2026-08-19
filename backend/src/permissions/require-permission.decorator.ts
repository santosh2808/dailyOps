import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'requiredPermission';

// Usage: @RequirePermission('Lead', 'View') on a controller method.
// Stores the lowercased "module.action" code as route metadata; PermissionsGuard
// reads it back and checks it against the authenticated user's own computed
// permission codes (request.user.permissions, set by JwtStrategy from
// User -> UserRole -> Role -> RolePermission -> Permission). This is
// deliberately the ONLY thing ever checked — no controller or guard in this
// codebase checks a role name directly, per the Enterprise RBAC spec
// ("Administrator simply receives all permissions through RolePermissions").
export function RequirePermission(module: string, action: string) {
  return SetMetadata(PERMISSION_KEY, `${module}.${action}`.toLowerCase());
}
