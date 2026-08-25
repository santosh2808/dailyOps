import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { listAssignableUsers } from "@/api/users";
import QuickAddUserDialog from "./QuickAddUserDialog";
import type { AssignableUser } from "@/types";

// Lead Assignment enhancement (requirements #1-3, #6): a searchable dropdown
// over active Sales Executive / Sales Manager users, populated from
// GET /api/v1/users/assignable, plus an optional "+ Add User" button that
// creates a new one on the fly and auto-selects it.
interface AssignedToPickerProps {
  value?: string | null;
  onChange: (userId: string | null) => void;
}

export default function AssignedToPicker({ value, onChange }: AssignedToPickerProps) {
  const { hasPermission } = useAuth();
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [addUserOpen, setAddUserOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setUsers(await listAssignableUsers());
    } catch {
      setLoadError("Could not load sales users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedUser = users.find((u) => u.id === value) ?? null;
  const query = search.trim().toLowerCase();
  const filtered = users.filter((u) => {
    if (!query) return true;
    return (
      u.name.toLowerCase().includes(query) ||
      u.email.toLowerCase().includes(query) ||
      u.username.toLowerCase().includes(query)
    );
  });

  function handleSelect(user: AssignableUser) {
    onChange(user.id);
    setSearch("");
    setOpen(false);
  }

  function handleUnassign() {
    onChange(null);
    setSearch("");
    setOpen(false);
  }

  async function handleUserCreated(user: { id: string; name: string; email: string; username: string }) {
    await fetchUsers();
    onChange(user.id);
    setAddUserOpen(false);
  }

  return (
    <div className="flex gap-2">
      <div className="relative flex-1" ref={containerRef}>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9 pr-8"
          placeholder={loading ? "Loading sales users..." : "Search by name or email"}
          value={open ? search : selectedUser?.name ?? ""}
          onFocus={() => {
            setOpen(true);
            setSearch("");
          }}
          onChange={(e) => setSearch(e.target.value)}
        />
        {selectedUser && !open && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-slate-900"
            onClick={handleUnassign}
            title="Unassign"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {open && (
          <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-white shadow-md">
            {selectedUser && (
              <button
                type="button"
                className="flex w-full items-center px-3 py-2 text-left text-sm text-muted-foreground hover:bg-slate-50"
                onClick={handleUnassign}
              >
                Unassign
              </button>
            )}
            {loading ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">Loading...</p>
            ) : loadError ? (
              <p className="px-3 py-2 text-sm text-destructive">{loadError}</p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                No matching Sales Executive/Sales Manager users.
              </p>
            ) : (
              filtered.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                    u.id === value ? "bg-orange/10" : ""
                  }`}
                  onClick={() => handleSelect(u)}
                >
                  <span className="font-medium text-slate-900">{u.name}</span>
                  <span className="text-xs text-muted-foreground">{u.email}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {hasPermission("User", "Create") && (
        <Button type="button" variant="outline" onClick={() => setAddUserOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      )}

      <QuickAddUserDialog
        open={addUserOpen}
        onOpenChange={setAddUserOpen}
        onCreated={handleUserCreated}
      />
    </div>
  );
}
