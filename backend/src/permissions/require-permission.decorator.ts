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
//
// PermissionsGuard accepts either a single code (string, from this
// decorator) or an array of codes (from RequireAllPermissions below) under
// the same metadata key — every existing single-permission usage keeps
// working unchanged.
export function RequirePermission(module: string, action: string) {
  return SetMetadata(PERMISSION_KEY, `${module}.${action}`.toLowerCase());
}

// Additive: Lead <-> Complaint conversion endpoints need the caller to hold
// BOTH the source module's Edit permission and the target module's Create
// permission (e.g. converting a Lead to a Complaint requires Lead.Edit AND
// Complaint.Create) — a single @RequirePermission code can't express "all
// of these", so this stores an array of codes instead. PermissionsGuard
// requires every one of them to be present.
export function RequireAllPermissions(pairs: [string, string][]) {
  return SetMetadata(
    PERMISSION_KEY,
    pairs.map(([module, action]) => `${module}.${action}`.toLowerCase()),
  );
}
