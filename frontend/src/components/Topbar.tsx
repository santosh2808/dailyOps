import { ArrowLeft, Menu } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useSidebar } from "@/context/SidebarContext";

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
  const { user } = useAuth();
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

  function goBack() {
    if (window.history.length > 1) navigate(-1);
    else navigate("/dashboard");
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
          <p className="text-xs text-muted-foreground">{user?.role}</p>
        </div>
        <div
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
          title={user ? `${user.name} — ${user.role}` : undefined}
        >
          {initials}
        </div>
      </div>
    </header>
  );
}
