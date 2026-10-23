import { useRef, useState, type ComponentType } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import {
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";
import { uploadContentImage } from "@/api/content";
import { ACCEPTED_IMAGE_TYPES, prepareImage } from "./imageResize";
import { LIMITS } from "./contentOptions";
import type { ContentRichTextNode } from "@/types";

// Keeps S3 key
const ContentImageNode = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      key: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-key"),
        renderHTML: (attributes: { key?: string | null }) => (attributes.key ? { "data-key": attributes.key } : {}),
      },
    };
  },
}).configure({ inline: false, allowBase64: false });

interface RichTextEditorProps {
  id: string;
  websiteId: string;
  value: ContentRichTextNode | null;
  onChange: (value: ContentRichTextNode | null) => void;
  disabled?: boolean;
  invalid?: boolean;
}

// Normalise link
function normaliseLink(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (/^(https?:\/\/|mailto:|tel:|\/)/i.test(v)) return v;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `mailto:${v}`;
  return `https://${v}`;
}

// Article editor
export default function RichTextEditor({ id, websiteId, value, onChange, disabled, invalid }: RichTextEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [pendingImage, setPendingImage] = useState<{ key: string; url: string | null } | null>(null);
  const [imageAlt, setImageAlt] = useState("");

  const editor = useEditor({
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      ContentImageNode,
    ],
    content: value ?? "",
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        class: "min-h-[260px] px-4 py-3 outline-none",
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? null : (e.getJSON() as ContentRichTextNode)),
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            paragraph: e.isActive("paragraph"),
            h2: e.isActive("heading", { level: 2 }),
            h3: e.isActive("heading", { level: 3 }),
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            underline: e.isActive("underline"),
            strike: e.isActive("strike"),
            bullet: e.isActive("bulletList"),
            ordered: e.isActive("orderedList"),
            quote: e.isActive("blockquote"),
            link: e.isActive("link"),
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
          }
        : null,
  });

  if (!editor || !state) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-input text-sm text-muted-foreground">
        <Spinner />
      </div>
    );
  }

  const chain = () => editor.chain().focus();

  async function handleImage(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setUploadError("");
    setUploading(true);
    try {
      const uploaded = await uploadContentImage(websiteId, await prepareImage(file));
      setImageAlt("");
      setPendingImage({ key: uploaded.key, url: uploaded.url });
    } catch (err) {
      setUploadError(err instanceof Error && !("response" in err) ? err.message : getErrorMessage(err, "Upload failed. Please try again."));
    } finally {
      setUploading(false);
    }
  }

  function insertImage() {
    if (!pendingImage) return;
    chain()
      .insertContent({ type: "image", attrs: { key: pendingImage.key, src: pendingImage.url, alt: imageAlt.trim() } })
      .run();
    setPendingImage(null);
  }

  function openLinkDialog() {
    setLinkValue((editor?.getAttributes("link").href as string | undefined) ?? "");
    setLinkOpen(true);
  }

  function saveLink() {
    const href = normaliseLink(linkValue);
    if (!href) {
      chain().extendMarkRange("link").unsetLink().run();
    } else if (editor?.state.selection.empty && !state?.link) {
      chain().insertContent({ type: "text", text: linkValue.trim(), marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      chain().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkOpen(false);
  }

  const tools: { icon: ComponentType<{ className?: string }>; label: string; active?: boolean; disabled?: boolean; run: () => void }[][] = [
    [
      { icon: Pilcrow, label: "Normal text", active: state.paragraph, run: () => chain().setParagraph().run() },
      { icon: Heading2, label: "Heading", active: state.h2, run: () => chain().toggleHeading({ level: 2 }).run() },
      { icon: Heading3, label: "Sub-heading", active: state.h3, run: () => chain().toggleHeading({ level: 3 }).run() },
    ],
    [
      { icon: Bold, label: "Bold (Ctrl+B)", active: state.bold, run: () => chain().toggleBold().run() },
      { icon: Italic, label: "Italic (Ctrl+I)", active: state.italic, run: () => chain().toggleItalic().run() },
      { icon: Underline, label: "Underline (Ctrl+U)", active: state.underline, run: () => chain().toggleUnderline().run() },
      { icon: Strikethrough, label: "Strikethrough", active: state.strike, run: () => chain().toggleStrike().run() },
    ],
    [
      { icon: List, label: "Bullet list", active: state.bullet, run: () => chain().toggleBulletList().run() },
      { icon: ListOrdered, label: "Numbered list", active: state.ordered, run: () => chain().toggleOrderedList().run() },
      { icon: Quote, label: "Quote", active: state.quote, run: () => chain().toggleBlockquote().run() },
      { icon: Minus, label: "Divider line", run: () => chain().setHorizontalRule().run() },
    ],
    [
      { icon: Link2, label: "Link", active: state.link, run: openLinkDialog },
      { icon: ImagePlus, label: uploading ? "Uploading image..." : "Image", disabled: uploading, run: () => fileRef.current?.click() },
    ],
    [
      { icon: Undo2, label: "Undo (Ctrl+Z)", disabled: !state.canUndo, run: () => chain().undo().run() },
      { icon: Redo2, label: "Redo (Ctrl+Y)", disabled: !state.canRedo, run: () => chain().redo().run() },
    ],
  ];

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        invalid ? "border-destructive" : "border-input",
      )}
    >
      {!disabled && (
        <div className="flex flex-wrap items-center gap-1 border-b border-input bg-slate-50 px-2 py-1" role="toolbar" aria-label="Formatting">
          {tools.map((group, gi) => (
            <div key={gi} className="flex items-center gap-0.5 border-r border-input pr-1 last:border-r-0">
              {group.map((tool) => (
                <button
                  key={tool.label}
                  type="button"
                  // Keep selection
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={tool.run}
                  disabled={tool.disabled}
                  title={tool.label}
                  aria-label={tool.label}
                  aria-pressed={tool.active ?? undefined}
                  className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-200 disabled:opacity-40",
                    tool.active && "bg-orange/10 text-orange",
                  )}
                >
                  {tool.label.startsWith("Uploading") ? <Spinner className="h-4 w-4" /> : <tool.icon className="h-4 w-4" />}
                </button>
              ))}
            </div>
          ))}
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            className="hidden"
            onChange={(e) => handleImage(e.target.files?.[0])}
          />
        </div>
      )}
      {uploadError && <p className="border-b border-input bg-red-50 px-4 py-2 text-xs text-destructive">{uploadError}</p>}

      <EditorContent
        editor={editor}
        className={cn(
          "text-[15px] leading-7 text-slate-700",
          "[&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-slate-900",
          "[&_h3]:mt-3 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-slate-900",
          "[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6",
          "[&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-orange [&_blockquote]:pl-4 [&_blockquote]:italic",
          "[&_a]:text-orange [&_a]:underline [&_hr]:my-4 [&_hr]:border-slate-200",
          "[&_img]:my-3 [&_img]:max-h-80 [&_img]:rounded-md [&_img.ProseMirror-selectednode]:ring-2 [&_img.ProseMirror-selectednode]:ring-orange",
        )}
      />

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent onClose={() => setLinkOpen(false)} size="sm">
          <DialogHeader>
            <DialogTitle>{state.link ? "Edit link" : "Add link"}</DialogTitle>
            <DialogDescription>Select text first, then add the link. Leave empty to remove it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`${id}-link`}>Web address</Label>
            <Input
              id={`${id}-link`}
              value={linkValue}
              placeholder="https://… or /contact"
              onChange={(e) => setLinkValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveLink();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLinkOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveLink}>
              Save link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingImage)} onOpenChange={(open) => !open && setPendingImage(null)}>
        <DialogContent onClose={() => setPendingImage(null)} size="sm">
          <DialogHeader>
            <DialogTitle>Describe this image</DialogTitle>
            <DialogDescription>A few words about what the photo shows. Used by Google and screen readers.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`${id}-alt`}>Image description</Label>
            <Input
              id={`${id}-alt`}
              value={imageAlt}
              maxLength={LIMITS.imageAlt}
              placeholder="e.g. Two HVLS fans above a packing line"
              onChange={(e) => setImageAlt(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingImage(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={!imageAlt.trim()} onClick={insertImage}>
              Insert image
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
