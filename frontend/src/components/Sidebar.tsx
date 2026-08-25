import { useState, type ComponentType } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Package,
  FileText,
  ClipboardList,
  Receipt,
  Settings,
  LogOut,
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
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
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
}

const topNavItems: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Customers", to: "/customers", icon: Users, permission: { module: "Customer", action: "View" } },
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
    ],
  },
];

const bottomNavItems: NavItem[] = [
  { label: "Products", to: "/products", icon: Package, permission: { module: "Product", action: "View" } },
  { label: "Quotations", to: "/quotations", icon: FileText, permission: { module: "Quotation", action: "View" } },
  { label: "Settings", to: "/settings", icon: Settings },
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
  const { logout, hasPermission } = useAuth();
  const navigate = useNavigate();
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

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <aside className="flex h-screen w-64 flex-shrink-0 flex-col border-r border-slate-200 bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-6 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-srm-red text-sm font-bold text-white">
          D
        </div>
        <span className="text-lg font-semibold">DailyOps</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 overflow-y-auto">
        {visibleTopNavItems.map(({ label, to, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => navLinkClasses(isActive)}>
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
                {group.items.map(({ label, to, icon: Icon }) => (
                  <NavLink key={to} to={to} className={({ isActive }) => navLinkClasses(isActive)}>
                    <Icon className="h-4 w-4" />
                    {label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}

        {visibleBottomNavItems.map(({ label, to, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => navLinkClasses(isActive)}>
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-200 px-3 py-4">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-srm-red/10 hover:text-srm-red"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}
