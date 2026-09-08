import { ArrowLeft, LogOut, Menu, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useSidebar } from "@/context/SidebarContext";
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

interface TopbarProps {
  title?: string;
  // Additive: pages reached via a Dashboard drill-through (Sales Orders,
  // Leads, Quotations, Job Execution Orders, Materials) pass this so
  // there's an obvious way back besides the browser's own back button.
  // Falls back to /dashboard if there's nowhere in-app history to go to
  // (e.g. the page was opened directly, or in a new tab).
  showBackButton?: boolean;
}

export default function Topbar({ title = "Dashboard", showBackButton = false }: TopbarProps) {
  const { user, logout } = useAuth();
  const { toggle } = useSidebar();
  const navigate = useNavigate();

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";

  // Bug fix (TC-047): `user.role` is a legacy free-text column that
  // defaults to "admin" in the schema and is never set by
  // UsersService.create()/quickCreate() — every user created since
  // Enterprise RBAC replaced it (Sales Manager, Sales Executive,
  // Production, Finance, Stores...) silently kept that stale default, so
  // the profile section showed "admin" for everyone. `user.roles` holds
  // the real RBAC role name(s) computed from UserRole/Role at login time —
  // that's what's actually correct to display. Falls back to the legacy
  // field only for the rare case roles is empty (no role assigned yet).
  const displayRole = user?.roles?.length ? user.roles.join(", ") : user?.role;

  function goBack() {
    if (window.history.length > 1) navigate(-1);
    else navigate("/dashboard");
  }

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <header className="flex h-16 flex-shrink-0 items-center justify-between gap-3 border-b bg-white px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {/* Only meaningful below lg — the sidebar is static/always-visible
            at lg and up, so there's nothing to open there. */}
        <button
          type="button"
          onClick={toggle}
          aria-label="Open menu"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        {showBackButton && (
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <h1 className="truncate text-base font-semibold text-slate-900 sm:text-lg">{title}</h1>
      </div>

      <div className="flex flex-shrink-0 items-center gap-3">
        {/* Name/role are the first thing to go on a narrow phone screen —
            the avatar (with initials + full name/role as a hover tooltip)
            is enough identity there; the title above already needs the
            room. */}
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-slate-900">
            {user?.name ?? "Loading..."}
          </p>
          <p className="text-xs text-muted-foreground">{displayRole}</p>
        </div>
        {/* Bug fix (TC-041): Settings and Logout are now reachable from a
            profile menu on the avatar itself, not just the separate Logout
            button at the bottom of the sidebar. "Settings" goes to the
            existing self-service Change Password page — there's no other
            per-user settings screen in this app yet. */}
        <DropdownMenu
          trigger={
            <button
              type="button"
              aria-label="Profile menu"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              title={user ? `${user.name} — ${displayRole}` : undefined}
            >
              {initials}
            </button>
          }
        >
          <div className="px-2 py-1.5 sm:hidden">
            <p className="text-sm font-medium text-slate-900">{user?.name ?? "Loading..."}</p>
            <p className="text-xs text-muted-foreground">{displayRole}</p>
          </div>
          <DropdownMenuSeparator className="sm:hidden" />
          <DropdownMenuItem icon={Settings} onSelect={() => navigate("/change-password")}>
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={LogOut} destructive onSelect={handleLogout}>
            Logout
          </DropdownMenuItem>
        </DropdownMenu>
      </div>
    </header>
  );
}
