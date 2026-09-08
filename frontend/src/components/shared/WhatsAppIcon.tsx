import { cn } from "@/lib/utils";

// Additive: WhatsApp Share. lucide-react (this app's icon set) has no
// WhatsApp glyph — it deliberately excludes brand/logo icons — so this is
// a small hand-drawn inline SVG instead, sized/styled to drop into the
// same spots as a lucide icon (className="h-4 w-4" etc., currentColor
// fill so it inherits the button's text color like every other icon here).
export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn("h-4 w-4", className)}
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M12.04 2c-5.523 0-10 4.477-10 10 0 1.771.464 3.494 1.346 5.014L2 22l5.116-1.343A9.958 9.958 0 0 0 12.04 22c5.523 0 10-4.477 10-10s-4.477-10-10-10zm0 18.2a8.17 8.17 0 0 1-4.166-1.14l-.299-.177-3.104.815.828-3.026-.194-.31A8.19 8.19 0 0 1 3.84 12c0-4.529 3.673-8.2 8.2-8.2 4.529 0 8.2 3.671 8.2 8.2 0 4.528-3.671 8.2-8.2 8.2z" />
    </svg>
  );
}
