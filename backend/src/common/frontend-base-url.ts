// Shared version of quotations.service.ts's private frontendBaseUrl() (same
// FRONTEND_URL env var, same default) — pulled out to common/ so the new
// Override Approval public link (backend/src/approval-requests) can build a
// /approvals/:token link without duplicating this logic a second time.
// quotations.service.ts's own private copy is left as-is (not worth the
// churn of switching a working, already-shipped module to import this).
const DEFAULT_FRONTEND_URL = 'http://localhost:5173';

export function frontendBaseUrl(): string {
  return (process.env.FRONTEND_URL?.trim() || DEFAULT_FRONTEND_URL).replace(/\/+$/, '');
}
