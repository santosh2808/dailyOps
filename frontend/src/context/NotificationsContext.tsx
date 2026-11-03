import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { getNotificationSummary } from "@/api/notifications";
import type { NotificationSummary } from "@/types";

// One poll of GET /notifications/summary for the whole app, shared by the
// Topbar bell (unread count) and the Sidebar badges (pending approvals) —
// every page renders both itself, so the state lives here rather than in
// either. Polls while someone is logged in and the tab is visible, and
// refreshes as soon as the tab/app comes back to the foreground. A failed
// poll keeps the last good numbers; there's nothing for the user to act on.
const POLL_INTERVAL_MS = 60_000;

interface NotificationsContextValue {
  summary: NotificationSummary | null;
  // Re-poll now — after something that changes the counts (opening the
  // bell, approving a request) instead of waiting for the next tick.
  refresh: () => Promise<void>;
  setUnreadCount: (count: number) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

// The installed PWA's app-icon badge (Badging API: desktop Chrome/Edge,
// Android, iOS 16.4+ home-screen apps). Best effort — unsupported or not
// permitted just means no icon badge.
function setAppBadge(count: number) {
  const nav = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    const result = count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.();
    result?.catch(() => undefined);
  } catch {
    // Not available here.
  }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [summary, setSummary] = useState<NotificationSummary | null>(null);
  // Drops a response that arrives after logout or a user switch.
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const current = generation.current;
    try {
      const next = await getNotificationSummary();
      if (current === generation.current) setSummary(next);
    } catch {
      // Keep the last good summary.
    }
  }, [userId]);

  useEffect(() => {
    generation.current += 1;
    setSummary(null);
    if (!userId) return;

    refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_INTERVAL_MS);
    function handleVisible() {
      if (document.visibilityState === "visible") refresh();
    }
    document.addEventListener("visibilitychange", handleVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [userId, refresh]);

  useEffect(() => {
    setAppBadge(summary?.unreadCount ?? 0);
  }, [summary?.unreadCount]);

  const setUnreadCount = useCallback((count: number) => {
    setSummary((prev) => (prev ? { ...prev, unreadCount: count } : prev));
  }, []);

  return (
    <NotificationsContext.Provider value={{ summary, refresh, setUnreadCount }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return context;
}
