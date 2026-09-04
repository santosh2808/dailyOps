import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

// Every authenticated page renders <Sidebar /> + <Topbar /> directly (no
// shared layout wrapper to thread props through), so the mobile drawer's
// open/closed state lives here instead — Sidebar reads it to decide how to
// render itself, Topbar's hamburger button writes to it. Neither needs to
// know about the other.
interface SidebarContextValue {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
}

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  // Auto-close the drawer on every navigation — otherwise picking a nav
  // link on mobile leaves the overlay covering the page you just asked to
  // go to.
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  const value: SidebarContextValue = {
    isOpen,
    toggle: () => setIsOpen((open) => !open),
    close: () => setIsOpen(false),
  };

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within a SidebarProvider");
  return ctx;
}
