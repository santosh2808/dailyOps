import api from "@/lib/api";
import type { Permission } from "@/types";

// Read-only — Permissions are seeded (prisma/seed.ts), not managed via UI.
export async function listPermissions() {
  const res = await api.get<Permission[]>("/api/v1/permissions");
  return res.data;
}
