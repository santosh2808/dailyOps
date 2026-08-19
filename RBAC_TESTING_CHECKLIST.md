# Enterprise RBAC — Testing Checklist

Run `npx prisma migrate dev` then `npm run seed` in `backend/` first (see README). This seeds Departments, Permissions, and the six Roles (Administrator, Sales Manager, Sales Executive, Production, Finance, Stores) as a catalog — but only **one** User: the System Administrator bootstrap account (username `admin`, email `admin@smartrotamac.com`, password `Admin@123`). Every other test user in sections 2-3 below needs to be created first via **Administration → Users** (or `POST /api/v1/users`) and assigned the relevant Role — nothing else is seeded.

Log in at `/login` in the frontend for each UI check; use the JWT from `POST /auth/login` as the `Authorization: Bearer <token>` header for each API check.

## 0. Single seeded user + forced password change (new)

- [ ] Confirm exactly one row exists in the `User` table immediately after a fresh `npm run seed` (no Sales Manager/Sales Executive/Production/Finance/Stores accounts exist by default — those are only Roles now, not Users).
- [ ] Log in with username `admin` and password `Admin@123`. You're immediately redirected to `/change-password` and **cannot** reach `/dashboard` or any other route by typing its URL directly — `ProtectedRoute` keeps redirecting back.
- [ ] Submit the wrong current password on the Change Password screen. Expect a rejection (`401`) and the new password is **not** applied.
- [ ] Submit a valid current password + a new password (min 6 characters) + matching confirmation. You land on `/dashboard`, and `GET /auth/profile` now shows `mustChangePassword: false`.
- [ ] Log out and log back in with the **new** password — old password `Admin@123` no longer works.
- [ ] Log in again using the **email** `admin@smartrotamac.com` instead of the username, with the new password — same account, same result. Confirms the single login field accepts either.

## 1. Login & permission propagation

- [ ] Log in as `admin` (or `admin@smartrotamac.com`) with its current password. `GET /auth/profile` (or the login response) includes `roles: ["Administrator"]` and a `permissions` array containing every seeded permission code.
- [ ] Via Administration → Users, create a test user (e.g. username `sales.exec`, email anything, temporary password) and assign only the Sales Executive role. Log in as that user — it's immediately forced to `/change-password` too (every newly created user starts with `mustChangePassword: true`), same as section 0. Complete that flow, then confirm `permissions` contains only Sales Executive's subset (e.g. `lead.view`, `lead.create`, `lead.edit`, `customer.view`, ...) — it does **not** contain `user.delete`, `role.edit`, or any Administration-module code.
- [ ] Disable that user (Users screen → Disable, or `DELETE /api/v1/users/:id`), then try to use their existing (still-unexpired) token on any request. Expect `401 Unauthorized` — confirms `JwtStrategy` rejects disabled (`isActive: false`) users immediately, not just at next login.
- [ ] Re-enable the user, edit their roles (e.g. add Production alongside Sales Executive) without asking them to log out. Their very next API call reflects the new, combined permission set — confirms permissions are recomputed per-request, not cached in the JWT.
- [ ] As the Administrator, use **Reset Password** (the key icon, distinct from Edit) on that user. Confirm `PATCH /api/v1/users/:id` (Edit) no longer accepts a `password` field at all (should be ignored/rejected), while `POST /api/v1/users/:id/reset-password` sets it and flips `mustChangePassword` back to `true` — the user is forced through Change Password again on their next login even though they'd already done it once.

## 2. Menus are permission-driven, not hardcoded

- [ ] Log in as the Administrator. Sidebar shows all groups including **Administration** (Users, Roles, Permissions, Departments).
- [ ] Create and log in as a user with only the Sales Executive role (see section 1). **Administration** group is not shown at all (no Department/Role/Permission/User permissions). **Sales** group is shown; **Production**/**Manufacturing** groups are hidden (no permissions in those modules).
- [ ] Create and log in as a user with only the Stores role. **Manufacturing** group (Materials, Suppliers) is shown; **Sales**/**Finance**/**Production** groups are hidden.
- [ ] In the Roles screen, remove all permissions from a role a test user holds, save, and refresh that user's session (or just re-check their `/auth/profile`) — every nav group tied to that role's former permissions disappears.

## 3. Quotation.Approve — the spec's own worked example

- [ ] As a user with only the Sales Executive role (has `quotation.edit` but not `quotation.approve`), attempt `PATCH /api/v1/quotations/:id/status`. Expect `403 Forbidden`.
- [ ] As a user with the Sales Manager role (has `quotation.approve`), the same call succeeds (`200 OK`).
- [ ] Confirm both users can still `PATCH /api/v1/quotations/:id` (general edit, gated by `quotation.edit`, which both roles have) — proves Approve and Edit are enforced as genuinely separate permissions on the same controller.

## 4. Role-name-blind enforcement (no hardcoded bypass)

- [ ] Create a brand-new Role via the Roles screen (e.g. "Temp") with zero permissions assigned. Create or edit a user to hold only that role. Every API call for that user returns `403 Forbidden` regardless of endpoint — confirms there's no fallback/default access.
- [ ] Grant that same "Temp" role exactly one permission (e.g. `customer.view`). The user can now `GET /api/v1/customers` but nothing else. Confirms permissions are additive and precise, not role-name-based.
- [ ] Search the backend source for any `role === 'admin'` / `role.name === 'Administrator'` style check in a guard or service — there should be none. Administrator's access comes only from its seeded `RolePermission` rows.

## 5. CRUD screens

- [ ] **Departments**: create one, edit its name/description, confirm the user count badge updates after assigning a user to it, delete it and confirm a user who had it now shows "—" for department (not an error).
- [ ] **Roles**: create a role, assign a handful of permissions via the checklist (try the per-module "Select all"/"Clear all" toggle), save, reopen it and confirm the checklist reflects exactly what was saved. Delete a role that has users assigned and confirm those users lose it cleanly (no orphaned reference, no error).
- [ ] **Permissions**: confirm the screen is read-only (no add/edit/delete controls) and lists every seeded permission grouped by module.
- [ ] **Users**: create a user with a username, department, and two roles; confirm both roles' permissions show up as the union after they complete their forced first-login password change. Edit the user (name/username/email/department/roles) and confirm the Edit dialog has **no password field at all**. Use the separate Reset Password action to set a new password and confirm it forces `mustChangePassword` again. Disable then re-enable the user and confirm login works again after re-enabling. Try creating a second user with a username or email that already exists — expect `409 Conflict` for each.

## 6. Regression — existing business modules untouched

- [ ] As the Administrator, exercise one full flow end to end (Lead → Quotation → Sales Order → Proforma Invoice / JEO) and confirm every existing business rule (auto-numbering, status transitions, soft deletes, Excel import/export) still behaves exactly as before this change — RBAC only added guards/decorators around existing handlers, no handler body changed.
- [ ] Confirm a request with **no** `Authorization` header still gets `401 Unauthorized` (`JwtAuthGuard`, unchanged) rather than `403 Forbidden` (`PermissionsGuard`) — the two failure modes are distinct and both still correctly triggered depending on what's missing.
