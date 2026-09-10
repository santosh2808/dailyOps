import { useCallback, useEffect, useState } from "react";
import { isAxiosError } from "axios";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/toast";
import { getTelephonyStatus, getTestCalls, makeTestCall } from "@/api/telephony";
import type { TelephonyStatus, TelephonyTestCall, TelephonyTestCallStatus } from "@/types";

// D.O.T. AI Lead Assistant Phase 2A — Telephony Test Foundation (Step 7).
// Deliberately NOT part of the main Lead workflow — a standalone,
// admin-only screen to prove the DailyOps -> Exotel -> Voice Agent path
// works at all. The only action here is the explicit "Make Test Call"
// button below; nothing on this page (or anywhere else in this codebase)
// calls a Lead automatically.
const STATUS_BADGE: Record<TelephonyTestCallStatus, BadgeProps["variant"]> = {
  NOT_STARTED: "muted",
  CALLING: "info",
  RINGING: "info",
  ANSWERED: "success",
  COMPLETED: "success",
  FAILED: "destructive",
  BUSY: "warning",
  NO_ANSWER: "warning",
};

const STATUS_LABEL: Record<TelephonyTestCallStatus, string> = {
  NOT_STARTED: "Not Started",
  CALLING: "Calling",
  RINGING: "Ringing",
  ANSWERED: "Answered",
  COMPLETED: "Completed",
  FAILED: "Failed",
  BUSY: "Busy",
  NO_ANSWER: "No Answer",
};

export default function TelephonyTest() {
  const [status, setStatus] = useState<TelephonyStatus | null>(null);
  const [testCalls, setTestCalls] = useState<TelephonyTestCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const [calling, setCalling] = useState(false);
  const [lastResult, setLastResult] = useState<TelephonyTestCall | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, callsRes] = await Promise.all([getTelephonyStatus(), getTestCalls(10)]);
      setStatus(statusRes);
      setTestCalls(callsRes);
    } catch {
      toast.error("Could not load telephony status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleMakeTestCall() {
    setError("");
    setCalling(true);
    try {
      const result = await makeTestCall({ phone });
      setLastResult(result);
      toast.success("Test call initiated.");
      await load();
    } catch (err) {
      const backendMessage = isAxiosError(err) ? err.response?.data?.message : undefined;
      const message = Array.isArray(backendMessage) ? backendMessage.join(", ") : backendMessage;
      setError(message || "Could not start the test call. Please try again.");
    } finally {
      setCalling(false);
    }
  }

  return (
    <div className="flex h-screen bg-app-grid">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar title="D.O.T. Telephony Test" />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-2xl space-y-6">
            <p className="text-sm text-muted-foreground">
              Phase 2A foundation — proves DailyOps can place a call through Exotel and reach a
              voice agent. This is a technical connectivity test only: it never contacts a real
              marketing Lead automatically, and it never changes a Lead's status.
            </p>

            {loading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner /> Loading...
              </p>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Integration Status</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Exotel</span>
                      <Badge variant={status?.exotelEnabled ? "success" : "muted"}>
                        {status?.exotelEnabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Exotel Configured</span>
                      <Badge variant={status?.exotelConfigured ? "success" : "muted"}>
                        {status?.exotelConfigured ? "Yes" : "No"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Voice Agent Configured</span>
                      <Badge variant={status?.voiceAgentConfigured ? "success" : "muted"}>
                        {status?.voiceAgentConfigured ? "Yes" : "No"}
                      </Badge>
                    </div>
                    {!status?.exotelEnabled && (
                      <p className="pt-1 text-xs text-muted-foreground">
                        Telephony is disabled — set EXOTEL_ENABLED=true (and the required
                        credentials) in the backend environment before a test call can be placed.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Make a Test Call</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Test phone number</Label>
                      <Input
                        placeholder="+91XXXXXXXXXX"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <Button onClick={handleMakeTestCall} disabled={calling || !phone}>
                      {calling && <Spinner className="mr-2 h-4 w-4" />}
                      {calling ? "Calling..." : "Make Test Call"}
                    </Button>

                    {lastResult && (
                      <div className="rounded-md border border-slate-200 p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Status</span>
                          <Badge variant={STATUS_BADGE[lastResult.status]}>
                            {STATUS_LABEL[lastResult.status]}
                          </Badge>
                        </div>
                        {lastResult.providerCallId && (
                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-muted-foreground">Provider Call ID</span>
                            <span className="font-mono text-xs">{lastResult.providerCallId}</span>
                          </div>
                        )}
                        {lastResult.errorMessage && (
                          <p className="mt-1 text-xs text-destructive">{lastResult.errorMessage}</p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Recent Test Calls</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {testCalls.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No test calls yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {testCalls.map((call) => (
                          <div
                            key={call.id}
                            className="flex items-center justify-between rounded-md border border-slate-200 p-2 text-sm"
                          >
                            <div>
                              <div className="font-medium">{call.phone}</div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(call.initiatedAt).toLocaleString()}
                                {call.lead && ` · Lead ${call.lead.leadNumber}`}
                              </div>
                            </div>
                            <Badge variant={STATUS_BADGE[call.status]}>{STATUS_LABEL[call.status]}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
