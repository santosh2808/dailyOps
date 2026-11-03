import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { timeAgo } from "@/components/content/contentOptions";
import { useNotifications } from "@/context/NotificationsContext";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "@/api/notifications";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/types";

// Topbar bell: unread count from NotificationsContext's poll; the list
// itself is fetched each time the panel opens. Picking a notification
// marks it read and opens its page. Same outside-click / Escape handling
// as DropdownMenu.
export default function NotificationBell() {
  const navigate = useNavigate();
  const { summary, refresh, setUnreadCount } = useNotifications();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const unread = summary?.unreadCount ?? 0;

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await listNotifications();
      setItems(res.items);
      setUnreadCount(res.unreadCount);
    } catch {
      setLoadError(true);
    }
  }, [setUnreadCount]);

  useEffect(() => {
    if (!open) return;
    load();
    function handlePointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, load]);

  function openNotification(notification: AppNotification) {
    setOpen(false);
    if (!notification.readAt) {
      setItems((list) => list?.map((n) => (n.id === notification.id ? { ...n, readAt: new Date().toISOString() } : n)) ?? list);
      setUnreadCount(Math.max(unread - 1, 0));
      // Best effort: if this fails, the next poll shows the true count.
      markNotificationRead(notification.id).then((res) => setUnreadCount(res.unreadCount), () => refresh());
    }
    if (notification.link) navigate(notification.link);
  }

  async function markAllRead() {
    setItems((list) => list?.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })) ?? list);
    setUnreadCount(0);
    try {
      await markAllNotificationsRead();
    } catch {
      refresh();
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          // Phones: full width under the header (the bell sits too close to
          // the right edge for an anchored panel to fit). sm and up: anchored
          // under the bell.
          className="fixed inset-x-2 top-14 z-50 mt-1 overflow-hidden rounded-md border border-input bg-background shadow-lg animate-in fade-in-0 zoom-in-95 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:w-96"
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-medium text-primary hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-[min(28rem,calc(100dvh-8rem))] overflow-y-auto">
            {items === null && !loadError ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Spinner /> Loading...
              </div>
            ) : loadError && items === null ? (
              <div className="space-y-2 px-4 py-8 text-center text-sm text-muted-foreground">
                <p>Couldn't load notifications.</p>
                <button type="button" onClick={load} className="font-medium text-primary hover:underline">
                  Try again
                </button>
              </div>
            ) : items && items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">You're all caught up.</p>
            ) : (
              <ul className="divide-y">
                {items?.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openNotification(n)}
                      className={cn(
                        "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-accent",
                        !n.readAt && "bg-primary/5"
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn("mt-1.5 h-2 w-2 flex-shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block text-sm text-slate-900",
                            n.readAt ? "font-normal" : "font-semibold"
                          )}
                        >
                          {n.title}
                        </span>
                        {n.body && <span className="mt-0.5 block text-xs text-muted-foreground">{n.body}</span>}
                        <span className="mt-1 block text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
