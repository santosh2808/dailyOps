import type { ComponentType } from "react";
import { UserPlus, FileText, ClipboardList, Receipt, Factory, Users, BarChart3 } from "lucide-react";

interface WheelNode {
  label: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
}

// The modules that make up DailyOps's own sales-to-production process —
// this is an original diagram inspired by a process-wheel layout, built
// from this app's real feature set rather than a copied graphic.
const NODES: WheelNode[] = [
  { label: "Lead\nManagement", icon: UserPlus, color: "#ED3525" },
  { label: "Quotations", icon: FileText, color: "#f59e0b" },
  { label: "Sales\nOrders", icon: ClipboardList, color: "#9BBB3D" },
  { label: "Proforma\nInvoices", icon: Receipt, color: "#0ea5e9" },
  { label: "Production\n(JEO)", icon: Factory, color: "#8b5cf6" },
  { label: "Customers", icon: Users, color: "#14b8a6" },
  { label: "Dashboard\n& Reports", icon: BarChart3, color: "#64748b" },
];

// Evenly spaced around the circle, starting straight up (12 o'clock) and
// going clockwise, matching the classic "process wheel" layout.
const RADIUS = 38;
const nodePositions = NODES.map((node, i) => {
  const angle = (i / NODES.length) * 2 * Math.PI - Math.PI / 2;
  return {
    ...node,
    x: 50 + RADIUS * Math.cos(angle),
    y: 50 + RADIUS * Math.sin(angle),
  };
});

export default function ProcessWheel({ className = "" }: { className?: string }) {
  return (
    <div className={`relative aspect-square w-full ${className}`}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        {nodePositions.map((node) => (
          <line
            key={node.label}
            x1={50}
            y1={50}
            x2={node.x}
            y2={node.y}
            stroke={node.color}
            strokeWidth={0.6}
            strokeDasharray="2 2"
            opacity={0.55}
          />
        ))}
      </svg>

      {/* Center hub */}
      <div
        className="absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-white text-center shadow-lg ring-4 ring-slate-100"
      >
        <span className="text-base font-bold leading-tight text-slate-900">DailyOps</span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Sales Workflow</span>
      </div>

      {nodePositions.map((node) => (
        <div
          key={node.label}
          className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
          style={{ left: `${node.x}%`, top: `${node.y}%` }}
        >
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full shadow-md"
            style={{ backgroundColor: node.color }}
          >
            <node.icon className="h-6 w-6 text-white" />
          </div>
          <span className="whitespace-pre text-center text-[11px] font-semibold leading-tight text-slate-600">
            {node.label}
          </span>
        </div>
      ))}
    </div>
  );
}
