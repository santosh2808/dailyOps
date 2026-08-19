export interface User {
  id: string;
  name: string;
  // Login identifier alongside email — see AuthContext.login(), which
  // sends whatever was typed (username or email) as a single `identifier`.
  username: string;
  email: string;
  // Legacy free-text role label — unchanged. Real authorization now comes
  // from `roles`/`permissions` below (Enterprise RBAC).
  role: string;
  createdAt: string;
  departmentId?: string | null;
  department?: string | null;
  // Role names, display-only — never used for access checks.
  roles?: string[];
  // Lowercased "module.action" codes, the union of every permission across
  // all of this user's roles. hasPermission(module, action) in
  // AuthContext checks this array, never `role`/`roles`.
  permissions?: string[];
  // Force Password Change on First Login — while true, ProtectedRoute
  // redirects every route to /change-password regardless of what was
  // requested. Cleared only by a successful self-service password change.
  mustChangePassword: boolean;
}

export interface Department {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { users: number };
}

export interface Permission {
  id: string;
  module: string;
  action: string;
  code: string;
  description?: string | null;
  createdAt: string;
}

export interface Role {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  permissions?: { permission: Permission }[];
  _count?: { users: number };
}

export interface RbacUser {
  id: string;
  name: string;
  username: string;
  email: string;
  role: string;
  isActive: boolean;
  departmentId?: string | null;
  department?: Department | null;
  roles: { role: Role }[];
  createdAt: string;
  updatedAt: string;
  mustChangePassword: boolean;
}

export interface Customer {
  id: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email?: string | null;
  gstNumber?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  sku?: string | null;
  description?: string | null;
  price?: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  customers: number;
  products: number;
  leads: number;
  quotations: number;
  salesOrders: number;
  proformaInvoices: number;
  jeoPending: number;
  materialsCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  suppliers: number;
}

export const LEAD_STATUSES = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "SITE_VISIT",
  "QUOTATION_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
  "NOT_INTERESTED",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type LeadPriority = (typeof LEAD_PRIORITIES)[number];

export const LEAD_SOURCES = [
  "WEBSITE",
  "LINKEDIN",
  "REFERENCE",
  "TRADE_SHOW",
  "COLD_CALL",
  "DISTRIBUTOR",
  "WALK_IN",
  "EMAIL",
  "PHONE",
  "OTHER",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export interface LeadProduct {
  id: string;
  leadId: string;
  productId: string;
  quantity: number;
  unitPrice?: number | null;
  remarks?: string | null;
  createdAt: string;
  product?: Product;
}

export interface Lead {
  id: string;
  leadNumber: string;
  customerId?: string | null;
  companyName: string;
  contactPerson: string;
  designation?: string | null;
  email?: string | null;
  phone: string;
  alternatePhone?: string | null;
  title: string;
  description?: string | null;
  status: LeadStatus;
  priority: LeadPriority;
  source: LeadSource;
  estimatedValue?: number | null;
  expectedCloseDate?: string | null;
  nextFollowUp?: string | null;
  assignedTo?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  // Added for the Lead Import feature — the import template's "Industry"
  // column has no other home in this model (see backend schema comment).
  industry?: string | null;
  remarks?: string | null;
  isConverted: boolean;
  convertedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  products?: LeadProduct[];
  _count?: { products: number };
}

export const QUOTATION_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export interface QuotationItem {
  id: string;
  quotationId: string;
  productId: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  createdAt: string;
  product?: Product;
}

export interface Quotation {
  id: string;
  quotationNumber: string;
  customerId: string;
  customer?: Customer;
  status: QuotationStatus;
  subtotal: number;
  gstPercent: number;
  gstAmount: number;
  grandTotal: number;
  validUntil?: string | null;
  notes?: string | null;
  terms?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  items?: QuotationItem[];
  _count?: { items: number };
}

export const SALES_ORDER_STATUSES = [
  "DRAFT",
  "CONFIRMED",
  "PRODUCTION_STARTED",
  "READY_FOR_DISPATCH",
  "DISPATCHED",
  "COMPLETED",
  "CANCELLED",
] as const;
export type SalesOrderStatus = (typeof SALES_ORDER_STATUSES)[number];

export interface SalesOrderItem {
  id: string;
  salesOrderId: string;
  productId: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
  lineTotal: number;
  product?: Product;
}

export interface SalesOrder {
  id: string;
  salesOrderNumber: string;
  quotationId: string;
  quotation?: { id: string; quotationNumber: string; status?: QuotationStatus };
  customerId: string;
  customer?: Customer;
  orderDate: string;
  deliveryDate?: string | null;
  paymentTerms?: string | null;
  advancePercentage?: number | null;
  status: SalesOrderStatus;
  subtotal: number;
  discount: number;
  tax: number;
  grandTotal: number;
  billingAddress?: string | null;
  shippingAddress?: string | null;
  specialInstructions?: string | null;
  remarks?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  items?: SalesOrderItem[];
  _count?: { items: number };
}

export const PROFORMA_INVOICE_STATUSES = ["DRAFT", "SENT", "EXPIRED", "CANCELLED"] as const;
export type ProformaInvoiceStatus = (typeof PROFORMA_INVOICE_STATUSES)[number];

export interface ProformaInvoice {
  id: string;
  invoiceNumber: string;
  salesOrderId: string;
  // No separate ProformaInvoiceItem table — line items are read through the
  // linked Sales Order (see backend schema comment), so `salesOrder` here
  // includes its own `items` when fetched via getProformaInvoice().
  salesOrder?: SalesOrder;
  customerId: string;
  customer?: Customer;
  invoiceDate: string;
  validUntil?: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  grandTotal: number;
  paymentTerms?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  ifscCode?: string | null;
  branch?: string | null;
  notes?: string | null;
  status: ProformaInvoiceStatus;
  createdAt: string;
  updatedAt: string;
}

export const JEO_STATUSES = [
  "PENDING",
  "MATERIAL_READY",
  "ASSEMBLY_STARTED",
  "QC",
  "READY_FOR_DISPATCH",
  "COMPLETED",
] as const;
export type JeoStatus = (typeof JEO_STATUSES)[number];

// Scoped to JEO only, not shared with LeadPriority — mirrors the backend's
// dedicated JeoPriority enum (see schema.prisma comment).
export const JEO_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type JeoPriority = (typeof JEO_PRIORITIES)[number];

export interface ProductionChecklist {
  id: string;
  jeoId: string;
  materialIssued: boolean;
  assemblyStarted: boolean;
  controllerInstalled: boolean;
  wiringCompleted: boolean;
  qcPassed: boolean;
  packed: boolean;
  readyForDispatch: boolean;
  completedAt?: string | null;
}

export interface JobExecutionOrder {
  id: string;
  jeoNumber: string;
  salesOrderId: string;
  // No separate JobExecutionOrderItem table — line items are read through
  // the linked Sales Order (see backend schema comment), so `salesOrder`
  // here includes its own `items` when fetched via getJobExecutionOrder().
  salesOrder?: SalesOrder;
  customerId: string;
  customer?: Customer;
  quotationId: string;
  quotation?: { id: string; quotationNumber: string; status?: QuotationStatus };
  deliveryDate?: string | null;
  priority: JeoPriority;
  status: JeoStatus;
  assignedTo?: string | null;
  remarks?: string | null;
  createdAt: string;
  updatedAt: string;
  checklist?: ProductionChecklist;
}

// Response shape of GET /api/v1/job-execution-orders/production-dashboard —
// a flat object (not nested under a "counts" key), matching the exact
// contract required of this endpoint.
export interface JeoDashboardResponse {
  pending: number;
  materialReady: number;
  assemblyStarted: number;
  qc: number;
  readyForDispatch: number;
  completed: number;
  activeOrders: JobExecutionOrder[];
}

// Response shape of GET /api/v1/job-execution-orders/:id/timeline. `at` is
// only populated where a real stored timestamp exists (or, for the current
// in-flight step, an approximation from `updatedAt`) — see the backend
// service comment on getTimeline() for the full explanation of what is and
// isn't precisely tracked.
export interface JeoTimelineStep {
  key: string;
  label: string;
  done: boolean;
  at: string | null;
}

export interface JeoTimelineResponse {
  steps: JeoTimelineStep[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface MaterialCategory {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialUnit {
  id: string;
  name: string;
  symbol?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Material {
  id: string;
  materialCode: string;
  name: string;
  description?: string | null;
  categoryId: string;
  category?: MaterialCategory;
  unitId: string;
  unit?: MaterialUnit;
  // Plain scalars, not real relations — no Supplier/Warehouse module exists
  // yet (same convention as Lead.assignedTo / SalesOrder.createdBy).
  supplierId?: string | null;
  cost?: number | null;
  minimumStock: number;
  maximumStock?: number | null;
  reorderLevel: number;
  currentStock: number;
  warehouseId?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Derived client-side from currentStock vs reorderLevel — mirrors the same
// thresholds used server-side for the Dashboard's Low Stock / Out Of Stock
// counts (see dashboard.service.ts).
export type MaterialStockLevel = "out_of_stock" | "low_stock" | "in_stock";

export function getMaterialStockLevel(material: Material): MaterialStockLevel {
  if (material.currentStock <= 0) return "out_of_stock";
  if (material.currentStock <= material.reorderLevel) return "low_stock";
  return "in_stock";
}

export interface MaterialImportRowResult {
  row: number;
  materialCode: string;
  status: "created" | "updated" | "failed";
  error?: string;
}

export interface MaterialImportResult {
  totalRows: number;
  created: number;
  updated: number;
  failed: number;
  results: MaterialImportRowResult[];
}

// Lead Import: `result` is 'valid'/'invalid'/'duplicate' when returned from
// the Preview step (nothing inserted yet), and 'created'/'invalid'/
// 'duplicate' when returned from the commit step (Preview's 'valid' rows
// become 'created' once actually inserted, assuming nothing changed
// server-side in between).
export interface LeadImportRowResult {
  row: number;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  city?: string;
  state?: string;
  industry?: string;
  source: LeadSource;
  status: LeadStatus;
  remarks?: string;
  result: "valid" | "invalid" | "duplicate" | "created";
  errors?: string[];
  duplicateReason?: string;
  leadNumber?: string;
}

export interface LeadImportSummary {
  totalRows: number;
  validCount: number;
  createdCount: number;
  invalidCount: number;
  duplicateCount: number;
  rows: LeadImportRowResult[];
}

export const SUPPLIER_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

export interface Supplier {
  id: string;
  supplierCode: string;
  supplierName: string;
  gstNumber?: string | null;
  panNumber?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  pinCode?: string | null;
  paymentTerms?: string | null;
  leadTime?: number | null;
  currency?: string | null;
  remarks?: string | null;
  status: SupplierStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

// Supplier Import: same 'valid'/'invalid'/'duplicate'/'created' lifecycle as
// Lead Import's LeadImportRowResult — see that type's comment for the exact
// Preview-vs-commit distinction.
export interface SupplierImportRowResult {
  row: number;
  supplierName: string;
  gstNumber?: string;
  panNumber?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  pinCode?: string;
  paymentTerms?: string;
  leadTime?: number;
  currency?: string;
  remarks?: string;
  status: SupplierStatus;
  result: "valid" | "invalid" | "duplicate" | "created";
  errors?: string[];
  duplicateReason?: string;
  supplierCode?: string;
}

export interface SupplierImportSummary {
  totalRows: number;
  validCount: number;
  createdCount: number;
  invalidCount: number;
  duplicateCount: number;
  rows: SupplierImportRowResult[];
}
