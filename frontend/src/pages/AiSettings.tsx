import { useCallback, useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import { useAuth } from "@/context/AuthContext";
import { getAiSettings, updateAiSettings, type AiSettingsPayload } from "@/api/aiSettings";
import { PREFERRED_LANGUAGE_OPTIONS } from "@/components/leads/aiOptions";
import type { AiSettings as AiSettingsType, PreferredLanguage } from "@/types";

// D.O.T. AI Lead Assistant Phase 1 (Step 11) — foundation for future AI
// calling settings. Administrator-only (AiSettings.View/.Edit). Saving
// changes here never places a call, sends an SMS/WhatsApp message, or
// contacts a customer — aiCallingEnabled/callNewMarketingLeadsEnabled are
// switches reserved for Phase 2's calling engine to check; nothing in this
// codebase reads them yet.
export default function AiSettings() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("AiSettings", "Edit");

  const [settings, setSettings] = useState<AiSettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<AiSettingsPayload>({});

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getAiSettings();
      setSettings(data);
      setForm({
        aiCallingEnabled: data.aiCallingEnabled,
        callNewMarketingLeadsEnabled: data.callNewMarketingLeadsEnabled,
        maxCallAttempts: data.maxCallAttempts,
        callingHoursStart: data.callingHoursStart,
        callingHoursEnd: data.callingHoursEnd,
        defaultDelayMinutes: data.defaultDelayMinutes,
        supportedLanguages: data.supportedLanguages,
      });
    } catch (err) {
      const message = getErrorMessage(err, "Could not load AI settings.");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  function toggleLanguage(language: PreferredLanguage) {
    setForm((prev) => {
      const current = prev.supportedLanguages ?? [];
      const next = current.includes(language)
        ? current.filter((l) => l !== language)
        : [...current, language];
      return { ...prev, supportedLanguages: next };
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const saved = await updateAiSettings(form);
      setSettings(saved);
      toast.success("AI settings saved.");
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not save AI settings. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-dvh bg-app-grid pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="AI Settings" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-2xl space-y-6">
            <p className="text-sm text-muted-foreground">
              Foundation settings for D.O.T., the future AI Lead Assistant. This is Phase 1 — no
              telephony provider is connected yet, so enabling these switches does not place any
              calls or contact any customer.
            </p>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {loading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner /> Loading AI settings...
              </p>
            ) : settings ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">AI Calling</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.aiCallingEnabled ?? false}
                        onChange={(e) => setForm((p) => ({ ...p, aiCallingEnabled: e.target.checked }))}
                        disabled={!canEdit}
                      />
                      AI Lead Calling Enabled
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.callNewMarketingLeadsEnabled ?? false}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, callNewMarketingLeadsEnabled: e.target.checked }))
                        }
                        disabled={!canEdit}
                      />
                      Call New Marketing Leads Automatically
                    </label>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Call Behavior</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Maximum Attempts</Label>
                      <Input
                        type="number"
                        min={1}
                        value={form.maxCallAttempts ?? ""}
                        onChange={(e) => setForm((p) => ({ ...p, maxCallAttempts: Number(e.target.value) }))}
                        disabled={!canEdit}
                      />
                    </div>
                    <div>
                      <Label>Default Delay (minutes)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={form.defaultDelayMinutes ?? ""}
                        onChange={(e) => setForm((p) => ({ ...p, defaultDelayMinutes: Number(e.target.value) }))}
                        disabled={!canEdit}
                      />
                    </div>
                    <div>
                      <Label>Calling Hours Start</Label>
                      <Input
                        type="time"
                        value={form.callingHoursStart ?? ""}
                        onChange={(e) => setForm((p) => ({ ...p, callingHoursStart: e.target.value }))}
                        disabled={!canEdit}
                      />
                    </div>
                    <div>
                      <Label>Calling Hours End</Label>
                      <Input
                        type="time"
                        value={form.callingHoursEnd ?? ""}
                        onChange={(e) => setForm((p) => ({ ...p, callingHoursEnd: e.target.value }))}
                        disabled={!canEdit}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Supported Languages</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {PREFERRED_LANGUAGE_OPTIONS.filter((l) => l.value !== "AUTO").map((l) => (
                      <label key={l.value} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={(form.supportedLanguages ?? []).includes(l.value)}
                          onChange={() => toggleLanguage(l.value)}
                          disabled={!canEdit}
                        />
                        {l.label}
                      </label>
                    ))}
                  </CardContent>
                </Card>

                {canEdit && (
                  <div className="flex justify-end">
                    <Button onClick={handleSave} disabled={saving}>
                      {saving && <Spinner className="mr-2 h-4 w-4" />}
                      {saving ? "Saving..." : "Save Settings"}
                    </Button>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
