// Google result preview
export default function GoogleSnippet({ path, title, description }: { path: string; title: string; description: string }) {
  return (
    <div className="rounded-md border border-input p-3">
      <p className="truncate text-xs text-slate-500">spyrofans.com › {path}</p>
      <p className="truncate text-lg text-[#1a0dab]">{title || "Untitled"}</p>
      <p className="line-clamp-2 text-sm text-slate-600">{description || "Add a summary or Google description."}</p>
    </div>
  );
}
