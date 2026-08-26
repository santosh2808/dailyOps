import { useMemo } from "react";
import { IndiaMap, Legend, type StateData } from "india-map-react";
import type { StateSalesEntry } from "@/types";

// Dashboard Redesign v2 — India Sales Map (requirements #1-4).
//
// v1 of this component was a hand-built tile cartogram (a grid of
// same-size boxes standing in for states) rather than a real outline map,
// because I didn't have a source of accurate state boundary data I could
// safely reuse. That's resolved now via the `india-map-react` npm package
// (MIT-licensed, ships its own bundled TopoJSON built from publicly
// available government boundary data — see its README's disclaimer that
// it's for visualization, not surveying/legal use, which is exactly what
// this dashboard needs). It renders the real shape of India via
// react-simple-maps, handles hover/click/tooltip itself, and supports
// choropleth (color-by-value) coloring out of the box.
//
// Customer.state values (INDIA_STATES, see lib/indiaStates.ts) are kept
// spelled exactly like this package's ST_NM property ("Jammu & Kashmir",
// "Andaman & Nicobar", etc.) so no translation table is needed here.

const CHOROPLETH_LOW = "#eef3de"; // near-white SRM green tint
const CHOROPLETH_HIGH = "#9BBB3D"; // SRM Green
const NO_DATA_FILL = "#e5e7eb"; // neutral gray — "no orders here", not an alert
const HOVER_FILL = "#c9d9a0"; // light SRM green tint
const BORDER_COLOR = "#ffffff";

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
  const stateData = useMemo(() => {
    const map: Record<string, StateData> = {};
    for (const entry of data) {
      // "Unknown" (customer has no state set) isn't a real state/UT and
      // has no tile on the map — surfaced as a note below instead.
      if (entry.state === "Unknown") continue;
      map[entry.state] = {
        value: entry.revenue,
        revenue: entry.revenue,
        orders: entry.orders,
        customers: entry.customers,
      };
    }
    return map;
  }, [data]);

  const unknownEntry = data.find((d) => d.state === "Unknown");
  const hasAnyRevenue = Object.values(stateData).some((d) => (d.value ?? 0) > 0);

  return (
    <div>
      <div className="mx-auto w-full max-w-xl">
        <IndiaMap
          stateData={stateData}
          enableChoropleth={hasAnyRevenue}
          choroplethLow={CHOROPLETH_LOW}
          choroplethHigh={CHOROPLETH_HIGH}
          fillColor={NO_DATA_FILL}
          hoverColor={HOVER_FILL}
          strokeColor={BORDER_COLOR}
          strokeWidth={1}
          showTooltip
          tooltipContent={(name, sd) => (
            <div className="min-w-[150px] text-xs">
              <div className="mb-1 font-semibold">{name}</div>
              {sd ? (
                <>
                  <div>Revenue: {formatINR(Number(sd.revenue ?? 0))}</div>
                  <div>Orders: {String(sd.orders ?? 0)}</div>
                  <div>Customers: {String(sd.customers ?? 0)}</div>
                </>
              ) : (
                <div>No sales orders yet.</div>
              )}
            </div>
          )}
          onStateClick={(name) => onStateClick(name)}
        />
      </div>

      {hasAnyRevenue && (
        <div className="mt-3 flex justify-center">
          <Legend title="Revenue" minLabel="Low" maxLabel="High" lowColor={CHOROPLETH_LOW} highColor={CHOROPLETH_HIGH} />
        </div>
      )}

      {unknownEntry && unknownEntry.orders > 0 && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          {unknownEntry.orders} order{unknownEntry.orders === 1 ? "" : "s"} ({formatINR(unknownEntry.revenue)}) not
          shown above — the customer's state isn't set yet.
        </p>
      )}
    </div>
  );
}
