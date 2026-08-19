import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Customer } from "@/types";

interface CustomerViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm text-slate-900">{value || "—"}</p>
    </div>
  );
}

export default function CustomerViewDialog({
  open,
  onOpenChange,
  customer,
}: CustomerViewDialogProps) {
  if (!customer) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Customer Details</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Company Name" value={customer.companyName} />
          <Field label="Contact Person" value={customer.contactPerson} />
          <Field label="Phone" value={customer.phone} />
          <Field label="Email" value={customer.email} />
          <Field label="GST Number" value={customer.gstNumber} />
          <Field
            label="Status"
            value={
              <Badge variant={customer.isActive ? "success" : "muted"}>
                {customer.isActive ? "Active" : "Inactive"}
              </Badge>
            }
          />
          <Field
            label="Created"
            value={new Date(customer.createdAt).toLocaleDateString()}
          />
          <Field
            label="Last Updated"
            value={new Date(customer.updatedAt).toLocaleDateString()}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
