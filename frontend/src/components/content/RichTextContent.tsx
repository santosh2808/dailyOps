import type { ReactNode } from "react";
import type { ContentRichTextNode } from "@/types";

// Safe article renderer

const EXTERNAL_LINK = /^(https?:)?\/\//i;

export default function RichTextContent({ doc }: { doc?: ContentRichTextNode | null }) {
  if (!doc || doc.type !== "doc") return null;
  return <div className="space-y-4 text-[15px] leading-7 text-slate-700">{renderChildren(doc)}</div>;
}

function renderChildren(node: ContentRichTextNode): ReactNode[] {
  return (node.content ?? []).map((child, index) => renderNode(child, index));
}

function renderNode(node: ContentRichTextNode, key: number): ReactNode {
  switch (node.type) {
    case "paragraph":
      return <p key={key}>{renderChildren(node)}</p>;
    case "heading":
      return node.attrs?.level === 3 ? (
        <h3 key={key} className="pt-2 text-lg font-semibold text-slate-900">
          {renderChildren(node)}
        </h3>
      ) : (
        <h2 key={key} className="pt-3 text-xl font-semibold text-slate-900">
          {renderChildren(node)}
        </h2>
      );
    case "bulletList":
      return (
        <ul key={key} className="list-disc space-y-1 pl-6">
          {renderChildren(node)}
        </ul>
      );
    case "orderedList":
      return (
        <ol key={key} start={typeof node.attrs?.start === "number" ? node.attrs.start : undefined} className="list-decimal space-y-1 pl-6">
          {renderChildren(node)}
        </ol>
      );
    case "listItem":
      return (
        <li key={key} className="[&>p]:m-0">
          {renderChildren(node)}
        </li>
      );
    case "blockquote":
      return (
        <blockquote key={key} className="border-l-4 border-orange pl-4 italic text-slate-600">
          {renderChildren(node)}
        </blockquote>
      );
    case "horizontalRule":
      return <hr key={key} className="border-slate-200" />;
    case "hardBreak":
      return <br key={key} />;
    case "image": {
      const src = typeof node.attrs?.src === "string" ? node.attrs.src : null;
      const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
      return src ? (
        <img key={key} src={src} alt={alt} className="w-full rounded-lg" loading="lazy" />
      ) : (
        <div key={key} className="rounded-lg bg-slate-100 p-6 text-center text-xs text-muted-foreground">
          Image ({alt || "no description"}) — preview unavailable until image storage is configured
        </div>
      );
    }
    case "text":
      return <span key={key}>{applyMarks(node.text ?? "", node.marks ?? [])}</span>;
    default:
      return null;
  }
}

function applyMarks(text: string, marks: NonNullable<ContentRichTextNode["marks"]>): ReactNode {
  return marks.reduce<ReactNode>((inner, mark) => {
    switch (mark.type) {
      case "bold":
        return <strong className="font-semibold text-slate-900">{inner}</strong>;
      case "italic":
        return <em>{inner}</em>;
      case "underline":
        return <u>{inner}</u>;
      case "strike":
        return <s>{inner}</s>;
      case "link": {
        const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : "";
        const external = EXTERNAL_LINK.test(href);
        return (
          <a
            href={href}
            className="text-orange underline underline-offset-2"
            target={external ? "_blank" : undefined}
            rel={external ? "noopener noreferrer" : undefined}
          >
            {inner}
          </a>
        );
      }
      default:
        return inner;
    }
  }, text);
}
