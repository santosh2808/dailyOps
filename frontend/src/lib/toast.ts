import { useEffect, useState } from "react";

// App-wide toast notifications. No toast system existed anywhere in the
// app before this — mutations (create/update/delete/status changes) only
// showed inline error text on failure and were silent on success. This is
// a small dependency-free pub/sub store (no Radix in this codebase, so a
// hand-rolled store matches every other UI primitive here) with a plain
// importable `toast` object, so any module can call `toast.success(...)` /
// `toast.error(...)` from a plain event handler without needing to be a
// component that calls a hook — same ergonomics as libraries like sonner.
//
// <Toaster /> (src/components/ui/toaster.tsx) subscribes via useToasts()
// and is mounted once at the app root (see App.tsx) so every page gets
// toasts for free.

export type ToastVariant = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  title?: string;
  description: string;
  variant: ToastVariant;
}

type Listener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
let listeners: Listener[] = [];
let nextId = 1;

const DEFAULT_DURATION = 4500;

function emit() {
  listeners.forEach((listener) => listener(toasts));
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function push(variant: ToastVariant, description: string, title?: string, duration = DEFAULT_DURATION) {
  const id = nextId++;
  toasts = [...toasts, { id, title, description, variant }];
  emit();
  if (duration > 0) {
    setTimeout(() => dismiss(id), duration);
  }
  return id;
}

export const toast = {
  success: (description: string, title?: string) => push("success", description, title),
  error: (description: string, title?: string) => push("error", description, title),
  info: (description: string, title?: string) => push("info", description, title),
  dismiss,
};

export function useToasts() {
  const [items, setItems] = useState<ToastItem[]>(toasts);
  useEffect(() => {
    listeners.push(setItems);
    return () => {
      listeners = listeners.filter((l) => l !== setItems);
    };
  }, []);
  return items;
}
