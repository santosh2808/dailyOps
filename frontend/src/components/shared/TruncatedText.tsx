import { cn } from "@/lib/utils";

// Shared across list-page tables: long free text (company names, contact
// names, emails, addresses, titles/remarks) gets a max width + ellipsis
// instead of wrapping or stretching the column, and the native `title`
// attribute gives a hover tooltip with the full value for free — no extra
// tooltip component/library needed.
interface TruncatedTextProps {
  text: string;
  className?: string;
}

export default function TruncatedText({ text, className }: TruncatedTextProps) {
  return (
    <span className={cn("block max-w-[220px] truncate", className)} title={text}>
      {text}
    </span>
  );
}
