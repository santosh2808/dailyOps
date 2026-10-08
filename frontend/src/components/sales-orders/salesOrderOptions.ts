import type { BadgeProps } from "@/components/ui/badge";
import type { SalesOrderStatus } from "@/types";

// Central place for Sales Order status -> label/color mapping, mirroring
// leadOptions.ts / quotationOptions.ts so all three modules render status
// consistently instead of duplicating switch statements.

export const STATUS_OPTIONS: { value: SalesOrderStatus; label: string; badge: BadgeProps["variant"] }[] = [
  { value: "DRAFT", label: "Draft", badge: "muted" },
  { value: "CONFIRMED", label: "Confirmed", badge: "info" },
  { value: "PRODUCTION_STARTED", label: "Production Started", badge: "warning" },
  { value: "READY_FOR_DISPATCH", label: "Ready for Dispatch", badge: "warning" },
  { value: "DISPATCHED", label: "Dispatched", badge: "info" },
  { value: "COMPLETED", label: "Completed", badge: "success" },
  { value: "CANCELLED", label: "Cancelled", badge: "destructive" },
];

export function statusLabel(status: SalesOrderStatus) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}

export function statusBadgeVariant(status: SalesOrderStatus): BadgeProps["variant"] {
  return STATUS_OPTIONS.find((s) => s.value === status)?.badge ?? "default";
}

// QA fix: "Rename Draft to Confirmed and remove the duplicate Confirmed
// status" — investigation found Draft and Confirmed are not duplicates;
// they're genuinely distinct, load-bearing stages (edit-lock, invoice
// generation gate, customer notification, and the Dashboard's "Orders
// Awaiting Production" tile all key off this exact distinction). The real
// bug was that ChangeSalesOrderStatusDialog.tsx showed all 7 statuses in
// its dropdown regardless of the order's current status, so a tester
// opening it on any order saw "Draft" and "Confirmed" listed side by side
// and read that as a duplicate stage — even though the backend would
// reject most of those combinations. Fix: mirror the backend's
// forward-only state machine (SALES_ORDER_SEQUENCE / assertForwardOnlyTransition
// in sales-orders.service.ts / status-transition.util.ts) here so the
// dropdown only ever offers the order's actually-legal next status(es).
const SALES_ORDER_SEQUENCE: SalesOrderStatus[] = [
  "DRAFT",
  "CONFIRMED",
  "PRODUCTION_STARTED",
  "READY_FOR_DISPATCH",
  "DISPATCHED",
  "COMPLETED",
];
const TERMINAL_STATUSES: SalesOrderStatus[] = ["COMPLETED"];
const SIDE_TERMINAL_STATUSES: SalesOrderStatus[] = ["CANCELLED"];

// Returns the subset of STATUS_OPTIONS legal to pick from `current`,
// matching assertForwardOnlyTransition()'s rules exactly: the current
// status itself (no-op), the single next stage in sequence, and — unless
// already terminal/cancelled — the CANCELLED side-terminal.
export function getValidNextStatusOptions(current: SalesOrderStatus) {
  const allowed = new Set<SalesOrderStatus>([current]);

  if (!TERMINAL_STATUSES.includes(current) && !SIDE_TERMINAL_STATUSES.includes(current)) {
    const currentIndex = SALES_ORDER_SEQUENCE.indexOf(current);
    const nextStage = currentIndex === -1 ? undefined : SALES_ORDER_SEQUENCE[currentIndex + 1];
    if (nextStage) allowed.add(nextStage);
    SIDE_TERMINAL_STATUSES.forEach((s) => allowed.add(s));
  }

  return STATUS_OPTIONS.filter((option) => allowed.has(option.value));
}
