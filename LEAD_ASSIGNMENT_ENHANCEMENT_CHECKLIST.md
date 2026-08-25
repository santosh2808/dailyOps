# Lead Assignment Enhancement — Delivery Notes

Scope: replace the free-text "Assigned To" field on Leads with a real reference to a User, add a searchable assignment picker with an inline "+ Add User" flow, and keep recording every assignment change in Lead Assignment History. No other Lead or User business logic was changed.

Run `npx prisma migrate dev` then restart the backend to pick up the schema changes.

## 1. Files Modified

### Backend

- `backend/prisma/schema.prisma` — added `User.phone` (optional) and `User.assignedLeads` (back-relation). Replaced `Lead.assignedTo String?` with `Lead.assignedToUserId String?` + `Lead.assignedToUser` (relation to `User`, `onDelete: SetNull`); updated the `@@index`.
- `backend/prisma/migrations/20260821120000_add_lead_assignment_enhancement/migration.sql` — new, hand-authored: adds `User.phone`, drops `Lead.assignedTo` (and its index), adds `Lead.assignedToUserId` + index + FK.
- `backend/src/users/users.service.ts` — added `findAssignable()` (active users holding Sales Executive or Sales Manager) and `quickCreate()` (the "+ Add User" flow — see Database Changes below for exactly what it does and doesn't set). `create()`/`update()` now also pass through the new `phone` field; nothing else about either method changed.
- `backend/src/users/users.controller.ts` — added `GET /api/v1/users/assignable` (gated by `Lead.View`, so any role that can see leads can populate the picker even without `User.View`) and `POST /api/v1/users/quick-create` (gated by `User.Create` — same permission the full Administration → Users "Add User" screen requires, so the button is hidden for anyone who doesn't already have that permission).
- `backend/src/users/dto/create-user.dto.ts` — added optional `phone`.
- `backend/src/users/dto/quick-create-user.dto.ts` — new DTO: `name`, `email`, `phone?`, `departmentId?`, `roleId`, `isActive?`. Deliberately excludes `username`/`password` — see quickCreate() below.
- `backend/src/leads/dto/create-lead.dto.ts`, `backend/src/leads/dto/query-lead.dto.ts` — `assignedTo?: string` renamed to `assignedToUserId?: string` (`@IsUUID`); `update-lead.dto.ts` inherits this unchanged (it's `PartialType(CreateLeadDto)`).
- `backend/src/leads/leads.service.ts` — `findAll()`/`findOne()`/list query now filter/include `assignedToUserId`/`assignedToUser` instead of `assignedTo`. `update()`'s assignment-change detection now compares `assignedToUserId`, resolves the new user's display name via a lookup, and writes that resolved name into `LeadAssignmentHistory` and the `LeadHistory` "Reassigned from X to Y" entry — `LeadAssignmentHistory`'s own columns are unchanged (see Database Changes).

### Frontend

- `frontend/src/types/index.ts` — added `User.phone`/`RbacUser.phone`; added `AssignableUser`; replaced `Lead.assignedTo` with `Lead.assignedToUserId` + `Lead.assignedToUser`.
- `frontend/src/api/users.ts` — added `phone` to `UserPayload`; added `QuickCreateUserPayload`, `listAssignableUsers()`, `quickCreateUser()`.
- `frontend/src/api/leads.ts` — `LeadListParams.assignedTo` → `assignedToUserId`; `LeadPayload.assignedTo` → `assignedToUserId` (`string | null`, so an edit can explicitly clear it).
- `frontend/src/components/leads/AssignedToPicker.tsx` — new: the searchable dropdown (type to filter by name/email/username, click to select, an "Unassign" option, and a clear (×) button), plus the "+ Add User" button (only rendered if the current user has `User.Create`).
- `frontend/src/components/leads/QuickAddUserDialog.tsx` — new: the "+ Add User" modal (Full Name, Email, Phone, Department, Role restricted to Sales Executive/Sales Manager, Status).
- `frontend/src/pages/LeadForm.tsx` — the "Assigned To" text input is now `AssignedToPicker`.
- `frontend/src/pages/LeadList.tsx`, `frontend/src/pages/LeadDetails.tsx` — display `assignedToUser?.name` instead of the old free-text field.
- `frontend/src/components/leads/LeadFiltersBar.tsx` — the "Assigned to" free-text filter is now a select populated from the same assignable-users list.

## 2. Database Changes

- `User.phone` (nullable `TEXT`) — additive column, no existing data affected.
- `Lead.assignedTo` (`TEXT`, nullable) — **dropped**. Any existing free-text assignment values are lost; every lead becomes unassigned after this migration. There is no way to auto-match old free-text names to real User accounts, so this is a one-way change — re-assign leads manually (or via a one-off script, not included here) if that matters for your data.
- `Lead.assignedToUserId` (`TEXT`, nullable) — new column, FK to `User.id`, `ON DELETE SET NULL` (deleting/disabling a user never blocks or breaks a lead; it just becomes unassigned).
- `LeadAssignmentHistory` (from the previous Lead History enhancement) — **schema unchanged**. `previousUser`/`newUser` still store plain display-name strings, not user ids; they're now populated by resolving the actual `User.name` at the time of the change instead of accepting free text, which is why no migration was needed for that table.

## 3. Testing Checklist

- [ ] **Dropdown population** — open Create Lead (or Edit an existing lead). Confirm "Assigned To" is a searchable dropdown, not a text box. Confirm every user shown holds the Sales Executive or Sales Manager role and is Active — a user with only Production/Finance/Stores/Administrator roles never appears, and a disabled Sales Executive doesn't either.
- [ ] **Search** — type part of a name, email, or username into the field; confirm the list filters to matches only, and confirms "No matching..." when nothing matches.
- [ ] **Select / unassign / clear** — select a user, save the lead, confirm it persists (reload the page). Reopen the dropdown, use "Unassign", save, confirm the lead shows "—" for Assigned To. Use the × button next to a selected value to clear it without opening the dropdown.
- [ ] **+ Add User button visibility** — as the Administrator (has `User.Create`), confirm the button appears beside the dropdown. As a user with only the Sales Executive role (no `User.Create` in the seeded permissions), confirm the button does **not** appear.
- [ ] **+ Add User modal** — click it, fill in Full Name, Email, Phone, Department, Role (confirm only Sales Executive/Sales Manager are offered), Status, save. Confirm: (a) the modal closes, (b) the dropdown now includes the new user without a manual page refresh, (c) the new user is automatically selected as the lead's assignee. Try creating one with an email that already exists on another user — expect a clear error, no user created.
- [ ] **Auto-generated credentials** — after creating a user this way, check Administration → Users: the new user has a system-generated username (not something you typed) and shows up like any other user, with `mustChangePassword` effectively true (Reset Password would force it again). No password was ever shown in the UI or network response.
- [ ] **Role restriction enforced server-side** — attempt `POST /api/v1/users/quick-create` with a `roleId` for, say, Production or Administrator. Expect `400 Bad Request`, not a created user.
- [ ] **Assignment History** — reassign an existing lead from User A to User B. On the Lead Details History tab, confirm an "Assigned" entry reading "Reassigned from A to B". Confirm a corresponding `LeadAssignmentHistory` row exists with the correct previous/new user names and the actor who made the change. Reassign the same lead to nobody (unassign) — confirm it logs "Reassigned from B to Unassigned".
- [ ] **List + filter** — confirm the Lead List's "Assigned To" column shows the assigned user's name (or "—"), and the filter bar's "Assigned to" control is now a dropdown of the same assignable users, correctly filtering the list when one is selected.
- [ ] **Regression** — run through Create → Edit → Change Status → Delete → Convert on a lead with no assignment at all, and confirm none of those flows are affected by this change (assignment stays optional throughout).
