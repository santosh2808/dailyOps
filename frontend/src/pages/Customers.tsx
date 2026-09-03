import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, Eye, Pencil, Ban } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import CustomerFormDialog from "@/components/customers/CustomerFormDialog";
import DeactivateConfirmDialog from "@/components/customers/DeactivateConfirmDialog";
import TruncatedText from "@/components/shared/TruncatedText";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import {
  createCustomer,
  deactivateCustomer,
  listCustomers,
  updateCustomer,
  type CustomerPayload,
} from "@/api/customers";
import type { Customer } from "@/types";

const PAGE_SIZE = 20;

export default function Customers() {
  const navigate = useNavigate();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listCustomers({ page, limit: PAGE_SIZE, search: search || undefined });
      setCustomers(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch {
      setError("Failed to load customers.");
      toast.error("Failed to load customers.");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Debounce search input -> search query, reset to page 1 on new search
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  function openAddDialog() {
    setSelectedCustomer(null);
    setFormOpen(true);
  }

  function openEditDialog(customer: Customer) {
    setSelectedCustomer(customer);
    setFormOpen(true);
  }

  function openDeactivateDialog(customer: Customer) {
    setSelectedCustomer(customer);
    setDeactivateOpen(true);
  }

  async function handleFormSubmit(payload: CustomerPayload) {
    if (selectedCustomer) {
      await updateCustomer(selectedCustomer.id, payload);
    } else {
      await createCustomer(payload);
    }
    await fetchCustomers();
  }

  async function handleDeactivateConfirm() {
    if (!selectedCustomer) return;
    await deactivateCustomer(selectedCustomer.id);
    toast.success(`Customer "${selectedCustomer.companyName}" deactivated.`);
    await fetchCustomers();
  }

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="Customers" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by company, contact, or phone"
                className="pl-9"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <Button onClick={openAddDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add Customer
            </Button>
          </div>

          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company Name</TableHead>
                <TableHead>Contact Person</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>State</TableHead>
                <TableHead>GST Number</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Spinner /> Loading customers...
                    </span>
                  </TableCell>
                </TableRow>
              ) : customers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No customers found.
                  </TableCell>
                </TableRow>
              ) : (
                customers.map((customer) => (
                  <TableRow
                    key={customer.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/customers/${customer.id}`)}
                  >
                    <TableCell className="font-medium text-slate-900">
                      <TruncatedText text={customer.companyName} />
                    </TableCell>
                    <TableCell>
                      <TruncatedText text={customer.contactPerson} className="max-w-[160px]" />
                    </TableCell>
                    <TableCell>{customer.phone}</TableCell>
                    <TableCell>
                      <TruncatedText text={customer.email || "—"} />
                    </TableCell>
                    <TableCell>{customer.state || "—"}</TableCell>
                    <TableCell>
                      {customer.gstNumber ? (
                        customer.gstNumber
                      ) : customer.isGstRegistered ? (
                        <Badge variant="warning">Missing GST number</Badge>
                      ) : (
                        <Badge variant="muted">Not applicable</Badge>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="View details"
                          onClick={() => navigate(`/customers/${customer.id}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit customer"
                          onClick={() => openEditDialog(customer)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Deactivate customer"
                          onClick={() => openDeactivateDialog(customer)}
                        >
                          <Ban className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-sm text-muted-foreground">
              {total === 0
                ? "0 customers"
                : `Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} of ${total} customers`}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </main>
      </div>

      <CustomerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        customer={selectedCustomer}
        onSubmit={handleFormSubmit}
      />
      <DeactivateConfirmDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        customer={selectedCustomer}
        onConfirm={handleDeactivateConfirm}
      />
    </div>
  );
}
