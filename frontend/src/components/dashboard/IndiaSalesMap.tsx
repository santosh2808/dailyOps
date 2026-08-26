import { useMemo, useState } from "react";
import type { StateSalesEntry } from "@/types";

// Dashboard Redesign v2 — India Sales Map (requirements #1-4).
//
// This is an original tile-cartogram (a grid of same-size tiles arranged in
// rows that loosely mirror India's real geography — north at the top,
// south at the bottom, the northeast states clustered to the right with a
// visible gap from the mainland, islands on their own row at the bottom),
// not a traced/geographically-precise outline map. That's a deliberate
// choice: a precise political map's exact border paths would either need
// to be sourced from a third-party SVG (a licensing question I don't have
// a clean answer for) or hand-drawn from memory (not something I can do
// accurately for 36 regions' real boundaries). A tile grid is a
// well-established cartogram style for exactly this situation, is fully
// original, and still supports every requirement here: per-state color by
// revenue, click-through, and a State/Revenue/Orders/Customers tooltip.
interface IndiaMapRow {
  name: string;
  // Extra horizontal gap before this tile, in tile-widths — used to open a
  // visible gap between the mainland and the northeast cluster.
  gapBefore?: number;
}

const MAP_ROWS: IndiaMapRow[][] = [
  [{ name: "Jammu and Kashmir" }, { name: "Ladakh" }],
  [{ name: "Punjab" }, { name: "Chandigarh" }, { name: "Himachal Pradesh" }, { name: "Uttarakhand" }],
  [
    { name: "Haryana" },
    { name: "Delhi" },
    { name: "Uttar Pradesh" },
    { name: "Sikkim", gapBefore: 1 },
    { name: "Arunachal Pradesh" },
  ],
  [
    { name: "Rajasthan" },
    { name: "Madhya Pradesh" },
    { name: "Bihar" },
    { name: "Assam", gapBefore: 1 },
    { name: "Nagaland" },
    { name: "Manipur" },
  ],
  [
    { name: "Gujarat" },
    { name: "Dadra and Nagar Haveli and Daman and Diu" },
    { name: "Chhattisgarh" },
    { name: "Jharkhand" },
    { name: "West Bengal" },
    { name: "Meghalaya", gapBefore: 1 },
    { name: "Tripura" },
    { name: "Mizoram" },
  ],
  [{ name: "Maharashtra" }, { name: "Telangana" }, { name: "Odisha" }],
  [{ name: "Goa" }, { name: "Karnataka" }, { name: "Andhra Pradesh" }],
  [{ name: "Kerala" }, { name: "Tamil Nadu" }, { name: "Puducherry" }],
  [{ name: "Lakshadweep" }, { name: "Andaman and Nicobar Islands" }],
];

const TILE_W = 96;
const TILE_H = 54;
const GAP = 6;
const CANVAS_W = 920;
const ROW_GAPS = [0, 0, 0, 0, 0, 0, 0, 0, 22]; // extra vertical gap before the islands row

const SRM_GREEN_LIGHT: [number, number, number] = [238, 243, 222]; // near-white green tint
const SRM_GREEN_FULL: [number, number, number] = [155, 187, 61]; // #9BBB3D
const EMPTY_FILL = "#e5e7eb"; // neutral gray — "no data", not an alert

function lerpColor(t: number) {
  const [r1, g1, b1] = SRM_GREEN_LIGHT;
  const [r2, g2, b2] = SRM_GREEN_FULL;
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

interface IndiaSalesMapProps {
  data: StateSalesEntry[];
  onStateClick: (state: string) => void;
}

export default function IndiaSalesMap({ data, onStateClick }: IndiaSalesMapProps) {
  const [hovered, setHovered] = useState<{ state: string; x: number; y: number } | null>(null);

  const byState = useMemo(() => {
    const map = new Map<string, StateSalesEntry>();
    for (const entry of data) map.set(entry.state, entry);
    return map;
  }, [data]);

  const maxRevenue = useMemo(
    () => Math.max(...data.filter((d) => d.state !== "Unknown").map((d) => d.revenue), 0),
    [data],
  );
  const unknownEntry = byState.get("Unknown");

  let totalHeight = 0;
  for (let i = 0; i < MAP_ROWS.length; i++) {
    totalHeight += (ROW_GAPS[i] ?? 0) + TILE_H + GAP;
  }

  const hoveredEntry = hovered ? byState.get(hovered.state) : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${CANVAS_W} ${totalHeight}`} className="h-auto w-full" style={{ maxHeight: 420 }}>
        {(() => {
          let y = 0;
          return MAP_ROWS.map((row, rowIndex) => {
            y += ROW_GAPS[rowIndex] ?? 0;
            const rowWidthUnits = row.reduce((sum, tile) => sum + 1 + (tile.gapBefore ?? 0), 0);
            const rowWidth = rowWidthUnits * TILE_W + (row.length - 1) * GAP;
            let x = (CANVAS_W - rowWidth) / 2;
            const tiles = row.map((tile) => {
              x += (tile.gapBefore ?? 0) * TILE_W;
              const entry = byState.get(tile.name);
              const revenue = entry?.revenue ?? 0;
              const fill = entry && revenue > 0 && maxRevenue > 0 ? lerpColor(revenue / maxRevenue) : EMPTY_FILL;
              const tileX = x;
              x += TILE_W + GAP;
              return (
                <g
                  key={tile.name}
                  className="cursor-pointer"
                  onClick={() => onStateClick(tile.name)}
                  onMouseEnter={() => setHovered({ state: tile.name, x: tileX + TILE_W / 2, y })}
                  onMouseLeave={() => setHovered(null)}
                >
                  <rect
                    x={tileX}
                    y={y}
                    width={TILE_W}
                    height={TILE_H}
                    rx={6}
                    fill={fill}
                    stroke={hovered?.state === tile.name ? "#ED3525" : "#ffffff"}
                    strokeWidth={hovered?.state === tile.name ? 2 : 1.5}
                  />
                  <text
                    x={tileX + TILE_W / 2}
                    y={y + TILE_H / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={9.5}
                    fontWeight={600}
                    fill="#23252d"
                    style={{ pointerEvents: "none" }}
                  >
                    {abbreviate(tile.name)}
                  </text>
                </g>
              );
            });
            const rowY = y;
            y += TILE_H + GAP;
            return <g key={rowY}>{tiles}</g>;
          });
        })()}
      </svg>

      {hovered && hoveredEntry && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${(hovered.x / CANVAS_W) * 100}%`,
            top: `${(hovered.y / totalHeight) * 100}%`,
            transform: "translate(-50%, -110%)",
          }}
        >
          <div className="mb-1 font-semibold text-slate-900">{hovered.state}</div>
          <div className="text-slate-600">Revenue: {formatINR(hoveredEntry.revenue)}</div>
          <div className="text-slate-600">Orders: {hoveredEntry.orders}</div>
          <div className="text-slate-600">Customers: {hoveredEntry.customers}</div>
        </div>
      )}
      {hovered && !hoveredEntry && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${(hovered.x / CANVAS_W) * 100}%`,
            top: `${(hovered.y / totalHeight) * 100}%`,
            transform: "translate(-50%, -110%)",
          }}
        >
          <div className="mb-1 font-semibold text-slate-900">{hovered.state}</div>
          <div className="text-slate-600">No sales orders yet.</div>
        </div>
      )}

      {unknownEntry && unknownEntry.orders > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {unknownEntry.orders} order{unknownEntry.orders === 1 ? "" : "s"} ({formatINR(unknownEntry.revenue)}) not
          shown above — the customer's state isn't set yet.
        </p>
      )}
    </div>
  );
}

// Short label so text fits inside a 96px-wide tile at this font size —
// full names still show in the tooltip.
const ABBREVIATIONS: Record<string, string> = {
  "Jammu and Kashmir": "J&K",
  Ladakh: "Ladakh",
  Chandigarh: "Chd.",
  "Himachal Pradesh": "H.P.",
  Uttarakhand: "U.K.",
  Haryana: "Haryana",
  Delhi: "Delhi",
  "Uttar Pradesh": "U.P.",
  Sikkim: "Sikkim",
  "Arunachal Pradesh": "A.P.(NE)",
  Rajasthan: "Rajasthan",
  "Madhya Pradesh": "M.P.",
  Bihar: "Bihar",
  Assam: "Assam",
  Nagaland: "Nagaland",
  Manipur: "Manipur",
  Gujarat: "Gujarat",
  "Dadra and Nagar Haveli and Daman and Diu": "DNH&DD",
  Chhattisgarh: "Chhattisgarh",
  Jharkhand: "Jharkhand",
  "West Bengal": "W.B.",
  Meghalaya: "Meghalaya",
  Tripura: "Tripura",
  Mizoram: "Mizoram",
  Maharashtra: "Maharashtra",
  Telangana: "Telangana",
  Odisha: "Odisha",
  Goa: "Goa",
  Karnataka: "Karnataka",
  "Andhra Pradesh": "A.P.",
  Kerala: "Kerala",
  "Tamil Nadu": "T.N.",
  Puducherry: "Pondy",
  Lakshadweep: "Lakshadweep",
  "Andaman and Nicobar Islands": "A&N Is.",
};

function abbreviate(name: string) {
  return ABBREVIATIONS[name] ?? name;
}
