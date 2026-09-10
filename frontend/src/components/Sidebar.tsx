import { useState, type ComponentType } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Package,
  FileText,
  ClipboardList,
  Receipt,
  TrendingUp,
  Landmark,
  Factory,
  Activity,
  ChevronDown,
  Warehouse,
  Boxes,
  Truck,
  ShieldCheck,
  CheckSquare,
  Mail,
  AlertCircle,
  Hash,
  Globe,
  X,
  Bot,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSidebar } from "@/context/SidebarContext";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  // Enterprise RBAC: undefined = always visible to any authenticated user
  // (Dashboard, Settings). Otherwise the item is only rendered when
  // hasPermission(module, action) is true — nothing in this file hardcodes
  // which roles see which item; visibility is entirely permission-driven.
  permission?: { module: string; action: string };
  // NavLink's default matching treats `to` as a prefix (active for any
  // nested path too), which is wrong whenever a sibling item's `to` is a
  // child path of this one (e.g. "/admin" vs "/admin/users") — both would
  // otherwise show active at once. Set true for an item whose `to` is also
  // the parent segment of other items in the same group.
  end?: boolean;
}

const topNavItems: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Customers", to: "/customers", icon: Users, permission: { module: "Customer", action: "View" } },
  // TC-055: Complaints was previously a child item under the Sales group;
  // QA flagged it as needing to be its own top-level nav entry (it's a
  // single page with no sub-items, same shape as Dashboard/Customers
  // above, not a collapsible group like Sales/Finance/etc.).
  { label: "Complaints", to: "/complaints", icon: AlertCircle, permission: { module: "Complaint", action: "View" } },
];

interface NavGroup {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  items: NavItem[];
}

// Each collapsible group in the sidebar, in display order. Adding a page to
// an existing group (or a new group entirely) never touches the rendering
// logic below — only this data and, if it's a new module, a Permission row
// in prisma/seed.ts.
const NAV_GROUPS: NavGroup[] = [
  {
    key: "sales",
    label: "Sales",
    icon: TrendingUp,
    items: [
      { label: "Leads", to: "/leads", icon: UserPlus, permission: { module: "Lead", action: "View" } },
      {
        label: "Sales Orders",
        to: "/sales-orders",
        icon: ClipboardList,
        permission: { module: "SalesOrder", action: "View" },
      },
      {
        label: "Quotation Approvals",
        to: "/quotations/approvals",
        icon: CheckSquare,
        permission: { module: "Quotation", action: "View" },
      },
    ],
  },
  {
    key: "finance",
    label: "Finance",
    icon: Landmark,
    items: [
      {
        label: "Proforma Invoices",
        to: "/proforma-invoices",
        icon: Receipt,
        permission: { module: "ProformaInvoice", action: "View" },
      },
      {
        label: "Tax Invoices",
        to: "/tax-invoices",
        icon: FileText,
        permission: { module: "TaxInvoice", action: "View" },
      },
    ],
  },
  {
    key: "production",
    label: "Production",
    icon: Factory,
    items: [
      {
        label: "Production Dashboard",
        to: "/production-dashboard",
        icon: Activity,
        permission: { module: "JEO", action: "View" },
      },
      {
        label: "Job Execution Orders",
        to: "/job-execution-orders",
        icon: ClipboardList,
        permission: { module: "JEO", action: "View" },
      },
    ],
  },
  {
    key: "manufacturing",
    label: "Manufacturing",
    icon: Warehouse,
    items: [
      { label: "Materials", to: "/materials", icon: Boxes, permission: { module: "Material", action: "View" } },
      { label: "Suppliers", to: "/suppliers", icon: Truck, permission: { module: "Supplier", action: "View" } },
    ],
  },
  {
    key: "administration",
    label: "Administration",
    icon: ShieldCheck,
    items: [
      { label: "Users", to: "/admin/users", icon: Users, permission: { module: "User", action: "View" } },
      { label: "Roles", to: "/admin/roles", icon: ShieldCheck, permission: { module: "Role", action: "View" } },
      {
        label: "Permissions",
        to: "/admin/permissions",
        icon: ClipboardList,
        permission: { module: "Permission", action: "View" },
      },
      {
        label: "Departments",
        to: "/admin/departments",
        icon: Landmark,
        permission: { module: "Department", action: "View" },
      },
      {
        label: "Email Templates",
        to: "/email-templates",
        icon: Mail,
        permission: { module: "EmailTemplate", action: "View" },
      },
      {
        label: "State Series Codes",
        to: "/admin/state-series-codes",
        icon: Hash,
        permission: { module: "StateSeriesCode", action: "View" },
      },
      {
        label: "Web Form Configuration",
        to: "/administration/web-form-config",
        icon: Globe,
        permission: { module: "FormConfiguration", action: "View" },
      },
      // D.O.T. AI Lead Assistant Phase 1 — foundation-only settings.
      {
        label: "AI Settings",
        to: "/admin/ai-settings",
        icon: Bot,
        permission: { module: "AiSettings", action: "View" },
      },
    ],
  },
];

// TC-041: "Settings" used to live here (pointing at a route, /settings,
// that doesn't even exist — App.tsx only registers /change-password) and
// duplicated Topbar's own profile-menu Settings entry. Removed; Settings
// is now reachable only via the profile dropdown in Topbar.
const bottomNavItems: NavItem[] = [
  { label: "Products", to: "/products", icon: Package, permission: { module: "Product", action: "View" } },
  { label: "Quotations", to: "/quotations", icon: FileText, permission: { module: "Quotation", action: "View" } },
];

function navLinkClasses(isActive: boolean) {
  return cn(
    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
    isActive
      ? "bg-srm-green text-white"
      : "text-sidebar-foreground/80 hover:bg-srm-green/10 hover:text-sidebar-foreground"
  );
}

export default function Sidebar() {
  const { hasPermission } = useAuth();
  const { isOpen, close } = useSidebar();
  const location = useLocation();

  function visible(item: NavItem) {
    return !item.permission || hasPermission(item.permission.module, item.permission.action);
  }

  const visibleTopNavItems = topNavItems.filter(visible);
  const visibleBottomNavItems = bottomNavItems.filter(visible);
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(visible),
  })).filter((group) => group.items.length > 0);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      NAV_GROUPS.map((group) => [
        group.key,
        group.items.some((item) => location.pathname.startsWith(item.to)),
      ]),
    ),
  );

  function toggleGroup(key: string) {
    setOpenGroups((open) => ({ ...open, [key]: !open[key] }));
  }

  return (
    <>
      {/* Backdrop — only meaningful below lg (the sidebar itself is
          static/always-visible at lg and up, so isOpen never applies
          there, but lg:hidden is kept as a defensive belt-and-braces
          in case that ever changes). Clicking it closes the drawer, same
          as picking a nav link does via SidebarProvider's route-change
          effect. */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-screen w-64 flex-shrink-0 flex-col border-r border-slate-200 bg-sidebar text-sidebar-foreground transition-transform duration-200 ease-in-out",
          "lg:static lg:z-auto lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
      {/* Full lockup image (gear/SR icon + "DailyOps" wordmark + "By Smart
          Rotamach" caption all baked in) — replaces the old two-row
          icon+text/caption layout, so no separate caption element is
          needed here anymore. h-20 matches the row height so the image
          (h-14) has room to sit fully inside it without being clipped —
          the earlier pb-6 shrank the content box below the image's own
          height and cropped its top edge. */}
      <div className="flex h-20 items-center justify-between px-6">
        <img src="/sr-dailyops-logo-full.svg" alt="SR DailyOps — by Smart Rotamach" className="h-14 w-auto" />
        <button
          type="button"
          onClick={close}
          aria-label="Close menu"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-srm-green/10 hover:text-sidebar-foreground lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-3 overflow-y-auto">
        {visibleTopNavItems.map(({ label, to, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => navLinkClasses(isActive)}>
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}

        {visibleGroups.map((group) => (
          <div key={group.key}>
            <button
              type="button"
              onClick={() => toggleGroup(group.key)}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-srm-green/10 hover:text-sidebar-foreground"
              aria-expanded={!!openGroups[group.key]}
            >
              <group.icon className="h-4 w-4" />
              <span className="flex-1 text-left">{group.label}</span>
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", openGroups[group.key] && "rotate-180")}
              />
            </button>

            {openGroups[group.key] && (
              <div className="mt-1 space-y-1 pl-6">
                {group.items.map(({ label, to, icon: Icon, end }) => (
                  <NavLink key={to} to={to} end={end} className={({ isActive }) => navLinkClasses(isActive)}>
                    <Icon className="h-4 w-4" />
                    {label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}

        {visibleBottomNavItems.map(({ label, to, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => navLinkClasses(isActive)}>
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      {/* TC-041: the standalone LOGOUT button that used to live here has
          been removed — logout is now only in Topbar's profile dropdown,
          so there's a single place to log out instead of two. */}
      </aside>
    </>
  );
}
