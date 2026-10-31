import api from "@/lib/api";

// Customer order tracking — the unauthenticated client for the /track/:token
// page (PublicOrderTracking.tsx), linked from the sales order WhatsApp
// messages. Hits PublicSalesOrdersController's no-guard route; same
// reasoning as public-quotations.ts for reusing `api`.

export type TrackingStatus =
  | "DRAFT"
  | "CONFIRMED"
  | "PRODUCTION_STARTED"
  | "READY_FOR_DISPATCH"
  | "DISPATCHED"
  | "COMPLETED"
  | "CANCELLED";

export interface OrderTrackingStep {
  status: TrackingStatus;
  label: string;
  done: boolean;
  at: string | null;
}

export interface OrderTrackingView {
  salesOrderNumber: string;
  orderDate: string;
  deliveryDate: string | null;
  status: TrackingStatus;
  statusLabel: string;
  cancelledAt: string | null;
  steps: OrderTrackingStep[];
}

export async function getOrderTracking(token: string) {
  const res = await api.get<OrderTrackingView>(`/api/v1/public/sales-orders/track/${encodeURIComponent(token)}`);
  return res.data;
}
