import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { listPermissions } from "@/api/permissions";
import type { Permission } from "@/types";

export default function Permissions() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        setPermissions(await listPermissions());
      } catch {
        setError("Failed to load permissions.");
        toast.error("Failed to load permissions.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Grouped by module for display only — the underlying list is already
  // sorted by module/action server-side (see PermissionsService.findAll).
  const grouped = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Permissions" />
        <main className="flex-1 overflow-y-auto p-6">
          <p className="mb-4 text-sm text-muted-foreground">
            Permissions are seeded by the system and assigned to roles from the Roles
            screen. This list is read-only.
          </p>

          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Module</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Spinner /> Loading permissions...
                    </span>
                  </TableCell>
                </TableRow>
              ) : permissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    No permissions found.
                  </TableCell>
                </TableRow>
              ) : (
                Object.entries(grouped).map(([module, items]) =>
                  items.map((permission, i) => (
                    <TableRow key={permission.id}>
                      <TableCell className="font-medium text-slate-900">
                        {i === 0 ? module : ""}
                      </TableCell>
                      <TableCell>
                        <Badge variant="muted">{permission.action}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {permission.code}
                      </TableCell>
                      <TableCell>{permission.description || "—"}</TableCell>
                    </TableRow>
                  ))
                )
              )}
            </TableBody>
          </Table>
        </main>
      </div>
    </div>
  );
}
