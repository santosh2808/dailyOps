import { Spinner } from "@/components/ui/spinner";

// Standard "this section is loading" state — replaces the old plain
// <p>Loading X...</p> text used across every page. Used both for
// full-page loads and inside table bodies / cards.
export default function PageLoader({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
      <Spinner />
      {label}
    </div>
  );
}
