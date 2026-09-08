const DEFAULT_BACKEND_URL = `http://localhost:${process.env.PORT || 4000}`;

// Additive: WhatsApp Share (Interakt integration). The backend's own
// publicly-reachable base URL — used to build links (the public PDF link
// embedded in an outgoing WhatsApp template message) that point at THIS
// server's own routes. Deliberately a separate env var from
// quotations.service.ts's frontendBaseUrl(): in production these are
// typically different domains (e.g. api.example.com vs app.example.com)
// behind a reverse proxy, and every non-Quotation public PDF link
// (Proforma Invoice / Tax Invoice / JEO) is served directly by this
// backend rather than by a frontend page.
export function backendBaseUrl(): string {
  return (process.env.BACKEND_PUBLIC_URL?.trim() || DEFAULT_BACKEND_URL).replace(/\/+$/, '');
}
