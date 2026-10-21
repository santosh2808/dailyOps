import { FieldValidationError } from '../public-forms/form-schema-validator.service';
import { IMAGE_ALT_MAX_LENGTH, RICH_TEXT_MAX_BYTES, RICH_TEXT_MAX_DEPTH, WORDS_PER_MINUTE } from './content.constants';
import { FOREIGN_ARTICLE_IMAGE_MESSAGE, isContentMediaKey } from './content-media';

// Article JSON allowlist

export interface RichTextNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichTextNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}

export interface RichTextResult {
  value: RichTextNode | undefined;
  errors: FieldValidationError[];
  // Plain text
  text: string;
  hasImage: boolean;
}

const BLOCKS = ['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'horizontalRule', 'image'];
const INLINE = ['text', 'hardBreak'];

// Allowed children
const CHILDREN: Record<string, string[] | undefined> = {
  doc: BLOCKS,
  paragraph: INLINE,
  heading: INLINE,
  bulletList: ['listItem'],
  orderedList: ['listItem'],
  listItem: ['paragraph', 'bulletList', 'orderedList'],
  blockquote: BLOCKS.filter((type) => type !== 'image'),
  horizontalRule: undefined,
  hardBreak: undefined,
  image: undefined,
  text: undefined,
};

const SIMPLE_MARKS = ['bold', 'italic', 'underline', 'strike'];
const LINK_MAX_LENGTH = 2000;
const TEXT_MAX_LENGTH = 50000;

// Safe link schemes
const SAFE_HREF = [/^https?:\/\/\S+$/i, /^mailto:[^\s@]+@[^\s@]+$/i, /^tel:[+0-9()\-\s]{3,30}$/i, /^\/(?!\/)\S*$/];

interface Context {
  field: string;
  websiteCode: string;
  forPublish: boolean;
  errors: FieldValidationError[];
  text: string[];
  hasImage: boolean;
}

export function sanitizeRichText(
  input: unknown,
  options: { field: string; websiteCode: string; forPublish: boolean },
): RichTextResult {
  const ctx: Context = { ...options, errors: [], text: [], hasImage: false };
  const fail = (message: string): RichTextResult => ({
    value: undefined,
    errors: [{ field: options.field, message }],
    text: '',
    hasImage: false,
  });

  if (input === undefined || input === null) {
    return { value: undefined, errors: [], text: '', hasImage: false };
  }
  if (typeof input !== 'object' || Array.isArray(input) || (input as RichTextNode).type !== 'doc') {
    return fail('Article must be an editor document');
  }
  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > RICH_TEXT_MAX_BYTES) {
    return fail(`Article is too long (over ${RICH_TEXT_MAX_BYTES / 1024} KB)`);
  }

  const value = sanitizeNode(input as RichTextNode, 'doc', 0, ctx);
  const text = ctx.text.join(' ').replace(/\s+/g, ' ').trim();
  return { value: ctx.errors.length ? undefined : value, errors: ctx.errors, text, hasImage: ctx.hasImage };
}

export function readMinutes(text: string): number {
  const words = text.split(' ').filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

function sanitizeNode(node: RichTextNode, parentType: string, depth: number, ctx: Context): RichTextNode | undefined {
  const issue = (message: string) => {
    if (!ctx.errors.some((e) => e.message === message)) ctx.errors.push({ field: ctx.field, message });
    return undefined;
  };

  if (!node || typeof node !== 'object' || typeof node.type !== 'string') {
    return issue('Article contains invalid content');
  }
  if (depth > RICH_TEXT_MAX_DEPTH) {
    return issue('Article is nested too deeply');
  }
  if (!(node.type in CHILDREN)) {
    return issue(`Article contains unsupported content ("${node.type}")`);
  }
  if (depth > 0 && !(CHILDREN[parentType] ?? []).includes(node.type)) {
    return issue(`Article contains "${node.type}" where it isn't allowed`);
  }

  switch (node.type) {
    case 'text': {
      if (typeof node.text !== 'string' || node.text.length === 0 || node.text.length > TEXT_MAX_LENGTH) {
        return issue('Article contains invalid text');
      }
      ctx.text.push(node.text);
      const marks = sanitizeMarks(node.marks, issue);
      return marks.length ? { type: 'text', text: node.text, marks } : { type: 'text', text: node.text };
    }
    case 'heading': {
      const level = Number(node.attrs?.level);
      // h2/h3 only
      return withChildren({ type: 'heading', attrs: { level: level === 3 ? 3 : 2 } }, node, depth, ctx);
    }
    case 'orderedList': {
      const start = Number(node.attrs?.start ?? 1);
      const attrs = Number.isInteger(start) && start > 1 && start <= 1000 ? { start } : undefined;
      return withChildren(attrs ? { type: 'orderedList', attrs } : { type: 'orderedList' }, node, depth, ctx);
    }
    case 'image': {
      const key = node.attrs?.key;
      if (!isContentMediaKey(key, ctx.websiteCode)) {
        return issue(FOREIGN_ARTICLE_IMAGE_MESSAGE);
      }
      const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt.trim() : '';
      if (alt.length > IMAGE_ALT_MAX_LENGTH) {
        return issue(`Article image descriptions must be ${IMAGE_ALT_MAX_LENGTH} characters or fewer`);
      }
      if (ctx.forPublish && !alt) {
        return issue('Every image in the article needs a short description');
      }
      ctx.hasImage = true;
      return { type: 'image', attrs: alt ? { key, alt } : { key } };
    }
    case 'horizontalRule':
    case 'hardBreak':
      return { type: node.type };
    default:
      return withChildren({ type: node.type }, node, depth, ctx);
  }
}

function withChildren(out: RichTextNode, node: RichTextNode, depth: number, ctx: Context): RichTextNode {
  if (node.content !== undefined && !Array.isArray(node.content)) {
    ctx.errors.push({ field: ctx.field, message: 'Article contains invalid content' });
    return out;
  }
  const children = (node.content ?? [])
    .map((child) => sanitizeNode(child, node.type, depth + 1, ctx))
    .filter((child): child is RichTextNode => Boolean(child));
  return children.length ? { ...out, content: children } : out;
}

function sanitizeMarks(
  marks: RichTextNode['marks'],
  issue: (message: string) => undefined,
): { type: string; attrs?: Record<string, unknown> }[] {
  if (marks === undefined) return [];
  if (!Array.isArray(marks)) {
    issue('Article contains invalid formatting');
    return [];
  }
  const out: { type: string; attrs?: Record<string, unknown> }[] = [];
  for (const mark of marks) {
    if (mark && SIMPLE_MARKS.includes(mark.type)) {
      out.push({ type: mark.type });
    } else if (mark?.type === 'link') {
      const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href.trim() : '';
      if (!href || href.length > LINK_MAX_LENGTH || !SAFE_HREF.some((pattern) => pattern.test(href))) {
        issue('Links must start with https://, http://, mailto:, tel: or /');
        continue;
      }
      out.push({ type: 'link', attrs: mark.attrs?.target === '_blank' ? { href, target: '_blank' } : { href } });
    } else {
      issue(`Article contains unsupported formatting ("${mark?.type}")`);
    }
  }
  return out;
}
