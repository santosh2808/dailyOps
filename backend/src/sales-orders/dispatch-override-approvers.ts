// The two people who may authorize dispatching an order that hasn't yet
// received 50% advance (see SalesOrdersService.updateStatus()). Neither is
// a real User account in this system (no login/RBAC entity for them), so
// this is a fixed allow-list compared against a plain scalar, not a User
// relation — same "fixed named constant" convention as jeo-pdf.service.ts's
// CHANNEL_NAME. Kept here (rather than a Settings screen) since there's no
// admin UI for managing this two-person list and it's expected to change
// rarely, if ever.
//
// Split into its own file (rather than living in sales-orders.service.ts)
// so both the service and UpdateSalesOrderStatusDto's @IsIn() validator can
// import it without a circular import between the two.
export const DISPATCH_OVERRIDE_APPROVERS = ['Santosh Kumar Chegondi', 'Amarpal Gampa'] as const;
export type DispatchOverrideApprover = (typeof DISPATCH_OVERRIDE_APPROVERS)[number];
