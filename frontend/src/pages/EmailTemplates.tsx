import { useCallback, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import EditEmailTemplateDialog from "@/components/email-templates/EditEmailTemplateDialog";
import { MobileRecordList, ResponsiveRecords } from "@/components/shared/MobileRecordList";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import { listEmailTemplates } from "@/api/email-templates";
import type { EmailTemplate } from "@/types";

// Requirement #7 — Email Templates module. Administrator-only screen (see
// Sidebar.tsx: gated behind EmailTemplate.View, and seed.ts only grants
// EmailTemplate.Edit to Administrator) for editing the 5 templates the
// cascade automation sends: Quotation, Order Confirmation, Proforma
// Invoice, JEO Notification, Dispatch (see seed.ts step 6 for the fixed
// `key` each one is looked up by — MailerService.findByKey()).

export default function EmailTemplates() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setTemplates(await listEmailTemplates());
    } catch (err) {
      const message = getErrorMessage(err, "Could not load email templates.");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  function openEdit(template: EmailTemplate) {
    setEditing(template);
    setEditOpen(true);
  }

  // Row actions, shared by the table's Actions cell and the mobile card.
  function templateActions(template: EmailTemplate) {
    return (
      <>
        <Button variant="ghost" size="icon" title="Edit template" onClick={() => openEdit(template)}>
          <Pencil className="h-4 w-4" />
        </Button>
      </>
    );
  }

  return (
    <div className="app-shell bg-app-grid">
      <Sidebar />
      <div className="app-shell-content">
        <Topbar title="Email Templates" />
        <main className="app-shell-main app-shell-main-list">
          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

          <ResponsiveRecords
            table={
              <Table fillHeightOnMobile>
                <TableHeader>
                  <TableRow>
                    <TableHead>Key</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          <Spinner /> Loading email templates...
                        </span>
                      </TableCell>
                    </TableRow>
                  ) : templates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        No email templates found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    templates.map((template) => (
                      <TableRow key={template.id}>
                        <TableCell className="font-mono text-xs">{template.key}</TableCell>
                        <TableCell className="font-medium text-slate-900">{template.name}</TableCell>
                        <TableCell className="max-w-sm truncate">{template.subject}</TableCell>
                        <TableCell>
                          <Badge variant={template.isActive ? "success" : "muted"}>
                            {template.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(template.updatedAt).toLocaleString()}</TableCell>
                        <TableCell className="text-right">{templateActions(template)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            }
            mobile={
              <MobileRecordList
                rows={templates}
                getKey={(template) => template.id}
                title={(template) => template.name}
                badge={(template) => (
                  <Badge variant={template.isActive ? "success" : "muted"}>
                    {template.isActive ? "Active" : "Inactive"}
                  </Badge>
                )}
                subtitle={(template) => template.subject}
                meta={(template) => template.key}
                fields={[
                  { label: "Key", render: (template) => <span className="font-mono text-xs">{template.key}</span> },
                  { label: "Subject", render: (template) => template.subject },
                  { label: "Last Updated", render: (template) => new Date(template.updatedAt).toLocaleString() },
                ]}
                actions={templateActions}
                loading={loading}
                loadingText="Loading email templates..."
                emptyText="No email templates found."
              />
            }
          />
        </main>
      </div>

      <EditEmailTemplateDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        template={editing}
        onSaved={fetchTemplates}
      />
    </div>
  );
}
