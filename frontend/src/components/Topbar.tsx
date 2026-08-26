import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

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
    <header className="flex h-16 flex-shrink-0 items-center justify-between border-b bg-white px-6">
      <div className="flex items-center gap-3">
        {showBackButton && (
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-medium text-slate-900">
            {user?.name ?? "Loading..."}
          </p>
          <p className="text-xs text-muted-foreground">{user?.role}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          {initials}
        </div>
      </div>
    </header>
  );
}
