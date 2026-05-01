import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import remarkSmartypants from "remark-smartypants";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import type { Root as MdastRoot } from "mdast";
import type { Root as HastRoot, Element } from "hast";
import { remarkWikilinks, remarkInlineMdLinks, type Resolver } from "./wikilinks";
import {
  rehypeStripFirstH1,
  rehypeWrapTables,
  rehypeExternalLinks,
  rehypeTaskList,
} from "./rehype-enhance";

const CALLOUT_TYPES = new Set([
  "note",
  "tip",
  "warning",
  "warn",
  "danger",
  "quote",
  "info",
]);

const CALLOUT_LABELS: Record<string, string> = {
  note: "Note",
  tip: "Tip",
  warning: "Warning",
  warn: "Warning",
  danger: "Danger",
  quote: "Quote",
  info: "Info",
};

const CALLOUT_ICONS: Record<string, string> = {
  note: "❖",
  tip: "✻",
  warning: "⚠",
  warn: "⚠",
  danger: "⛔",
  quote: "❝",
  info: "ⓘ",
};

function remarkCallouts() {
  return (tree: MdastRoot) => {
    visit(tree, (node) => {
      if (
        node.type !== "containerDirective" &&
        node.type !== "leafDirective" &&
        node.type !== "textDirective"
      ) {
        return;
      }
      const name: string = (node as unknown as { name: string }).name;
      if (!CALLOUT_TYPES.has(name)) return;

      const attributes =
        (node as unknown as { attributes?: Record<string, string> })
          .attributes ?? {};
      const title = attributes.title ?? CALLOUT_LABELS[name];
      const icon = CALLOUT_ICONS[name] ?? "•";

      const data =
        (node as unknown as { data?: Record<string, unknown> }).data ??
        ((node as unknown as { data: Record<string, unknown> }).data = {});
      data.hName = "div";
      data.hProperties = {
        class: `callout callout--${name}`,
        "data-callout": name,
      };

      const labelNode = {
        type: "paragraph",
        data: {
          hName: "div",
          hProperties: { class: "callout__label" },
        },
        children: [{ type: "text", value: `${icon}  ${title}` }],
      } as unknown;

      const children =
        (node as unknown as { children: unknown[] }).children ?? [];
      children.unshift(labelNode);
    });
  };
}

function remarkObsidianCallouts() {
  return (tree: MdastRoot) => {
    visit(tree, "blockquote", (node, index, parent) => {
      if (!parent || index == null) return;
      const first = node.children?.[0];
      if (!first || first.type !== "paragraph") return;
      const firstText = first.children?.[0];
      if (!firstText || firstText.type !== "text") return;
      const m = /^\[!(\w+)\]\s*(.*)$/.exec(firstText.value);
      if (!m) return;
      const raw = m[1].toLowerCase();
      if (!CALLOUT_TYPES.has(raw)) return;
      const label = m[2].trim() || CALLOUT_LABELS[raw];
      const icon = CALLOUT_ICONS[raw] ?? "•";

      firstText.value = "";
      if (first.children.length === 1) node.children.shift();

      const labelNode = {
        type: "paragraph",
        data: {
          hName: "div",
          hProperties: { class: "callout__label" },
        },
        children: [{ type: "text", value: `${icon}  ${label}` }],
      };

      const calloutNode = {
        type: "blockquote",
        data: {
          hName: "div",
          hProperties: {
            class: `callout callout--${raw}`,
            "data-callout": raw,
          },
        },
        children: [labelNode, ...node.children],
      } as unknown;

      (parent as unknown as { children: unknown[] }).children.splice(
        index,
        1,
        calloutNode,
      );
    });
  };
}

function rehypeAddLanguageAttr() {
  return (tree: HastRoot) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "figure") return;
      const props = (node.properties ?? {}) as Record<string, unknown>;
      if (!("data-rehype-pretty-code-figure" in props)) return;
      const code = findDeep(node, (el) => el.tagName === "code");
      if (!code) return;
      const className =
        ((code.properties as Record<string, unknown> | undefined)
          ?.className as string[] | undefined) ?? [];
      const lang = className
        .map((c) => /^language-(.+)$/.exec(c)?.[1])
        .find(Boolean);
      if (lang) node.properties = { ...props, "data-language": lang };
    });
  };
}

function findDeep(
  el: Element,
  pred: (e: Element) => boolean,
): Element | null {
  for (const child of el.children ?? []) {
    if (child.type !== "element") continue;
    if (pred(child)) return child;
    const deeper = findDeep(child, pred);
    if (deeper) return deeper;
  }
  return null;
}

const PRETTY_CODE_OPTIONS: Parameters<typeof rehypePrettyCode>[0] = {
  theme: {
    light: "github-light",
    dark: "github-dark-dimmed",
  },
  keepBackground: false,
  defaultLang: "plaintext",
};

export async function renderMarkdown(
  content: string,
  resolve: Resolver,
): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .use(remarkCallouts)
    .use(remarkObsidianCallouts)
    .use(remarkSmartypants, { dashes: "oldschool" })
    .use(remarkWikilinks(resolve))
    .use(remarkInlineMdLinks(resolve))
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeStripFirstH1)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, {
      behavior: "prepend",
      test: (node) => {
        const t = (node as Element).tagName;
        return t === "h2" || t === "h3" || t === "h4";
      },
      properties: { className: ["anchor"], ariaLabel: "anchor" },
      content: { type: "text", value: "#" },
    })
    .use(rehypeWrapTables)
    .use(rehypeExternalLinks)
    .use(rehypeTaskList)
    .use(rehypePrettyCode, PRETTY_CODE_OPTIONS)
    .use(rehypeAddLanguageAttr)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(content);
  let html = String(file);
  // Defensive: strip any <h1>...</h1> that survived the tree transform
  html = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>\s*/i, "");
  return html;
}

export interface TocEntry {
  depth: number;
  text: string;
  id: string;
}

export function extractToc(markdown: string): TocEntry[] {
  const out: TocEntry[] = [];
  const lines = markdown.split(/\r?\n/);
  let inFence = false;
  for (const line of lines) {
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{2,4})\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const depth = m[1].length;
    const text = m[2].replace(/`([^`]+)`/g, "$1").trim();
    const id = slugify(text);
    out.push({ depth, text, id });
  }
  return out;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}
