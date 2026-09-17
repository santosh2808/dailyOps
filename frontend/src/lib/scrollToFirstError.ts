// Bug fix (TC-067): on every form in this app, a failed validation only
// ever set inline error text under each bad field — nothing moved the
// viewport, so on a long form (Lead, Customer, Quotation, Complaint,
// Material, Supplier, Product, User, Tax Invoice...) the first invalid
// field could be scrolled out of view entirely. Clicking "Save" then
// appeared to silently do nothing, because the only visible feedback was
// off-screen. This is a small, dependency-free, reusable helper any
// form's own validate() can call once, right before it stores the
// computed errors.
//
// Convention this relies on (already used by every form in this app —
// see LeadForm.tsx, CustomerFormDialog.tsx, QuotationForm.tsx, etc.):
// each field's error key in the `errors` state object is exactly the
// DOM `id` of that field's <Input>/<Select>/<Textarea> element, e.g.
// `id="phone"` pairs with `errors.phone`. No new id/name wiring is
// required on existing forms to adopt this — they already satisfy it.
//
// A few dialogs (e.g. QuickAddUserDialog.tsx) prefix their element ids
// to avoid colliding with a form rendered underneath them (id="name" vs
// id="quickUserName"), so the error key and the element id don't match
// exactly. For those, we also accept an explicit
// `data-error-key="<errors key>"` attribute as a fallback lookup.
//
// We deliberately do NOT just scroll to the first key in the errors
// object by insertion order: the order fields are checked inside a
// validate() function doesn't always match the order they're laid out
// on screen (an existing form may check a later-in-form field before an
// earlier one). Instead we look up each errored field's actual DOM
// position and jump to whichever one is physically topmost, which is
// what a user reading top-to-bottom would call "the first error."
export function scrollToFirstError(errors: Record<string, unknown>): void {
  // `unknown` (not `string | null | undefined`) because a couple of forms'
  // error-bag type is `Partial<FormState>` itself rather than an all-string
  // map (e.g. ProductFormDialog's nested `spec` errors, or a boolean field
  // like `isGstRegistered`) — we only care whether a value is truthy, never
  // what it actually contains.
  const erroredKeys = Object.keys(errors).filter((key) => Boolean(errors[key]));
  if (erroredKeys.length === 0) return;

  let target: HTMLElement | null = null;
  let targetTop = Number.POSITIVE_INFINITY;

  for (const key of erroredKeys) {
    const el =
      document.getElementById(key) ??
      document.querySelector<HTMLElement>(`[data-error-key="${key}"]`);
    if (!el) continue;
    const top = el.getBoundingClientRect().top;
    if (top < targetTop) {
      targetTop = top;
      target = el;
    }
  }

  if (!target) return;

  // Run after the current render/paint so this works even when the
  // error banner or field itself only just became visible as part of
  // the same state update that set the errors (e.g. a collapsed section
  // that expands to reveal its error).
  requestAnimationFrame(() => {
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (typeof target?.focus === "function") {
      try {
        target.focus({ preventScroll: true });
      } catch {
        // Some elements (e.g. a custom Select's underlying <select> mid
        // re-render) can throw on focus in edge cases — scrolling into
        // view is the important half of this fix, so swallow this.
      }
    }
  });
}
