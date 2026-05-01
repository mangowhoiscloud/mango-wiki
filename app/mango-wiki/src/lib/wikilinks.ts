import type { Root, Text, Parent, Link } from "mdast";
import { visit, SKIP } from "unist-util-visit";
import type { VaultPage } from "./vault";
import { slugToHref } from "./vault";

export type Resolver = (target: string) => VaultPage | undefined;

export function buildResolver(pages: VaultPage[]): Resolver {
  const byPath = new Map<string, VaultPage>();
  const byName = new Map<string, VaultPage[]>();

  const pushName = (name: string, page: VaultPage) => {
    const list = byName.get(name) ?? [];
    list.push(page);
    byName.set(name, list);
  };

  for (const p of pages) {
    byPath.set(p.slug.join("/"), p);
    const leaf = p.slug[p.slug.length - 1];
    pushName(leaf, p);
    pushName(leaf.toLowerCase(), p);
    for (const alias of p.aliases) {
      pushName(alias, p);
      pushName(alias.toLowerCase(), p);
    }
  }

  return (targetRaw: string) => {
    const target = targetRaw.trim();
    const direct = byPath.get(target);
    if (direct) return direct;
    if (target.includes("/")) return undefined;
    const hits = byName.get(target) ?? byName.get(target.toLowerCase());
    return hits?.[0];
  };
}

const WIKILINK_RE = /(!?)\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g;

interface WikilinkNode {
  type: "text" | "link";
  value?: string;
  url?: string;
  title?: string | null;
  data?: { hProperties?: Record<string, string> };
  children?: WikilinkNode[];
}

export function remarkWikilinks(resolve: Resolver) {
  return () => (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent) => {
      if (!parent || index == null) return;
      const value = node.value;
      if (!value.includes("[[")) return;

      const children: WikilinkNode[] = [];
      let lastIdx = 0;
      let m: RegExpExecArray | null;
      WIKILINK_RE.lastIndex = 0;
      while ((m = WIKILINK_RE.exec(value)) !== null) {
        if (m.index > lastIdx) {
          children.push({ type: "text", value: value.slice(lastIdx, m.index) });
        }
        const isEmbed = m[1] === "!";
        const target = m[2].trim();
        const display = (m[3] ?? target).trim();
        const hit = resolve(target);
        const href = hit ? slugToHref(hit.slug) : `#unresolved-${encodeURIComponent(target)}`;
        const className = hit
          ? isEmbed
            ? "wikilink wikilink--embed"
            : "wikilink"
          : "wikilink wikilink--missing";
        const hProps: Record<string, string> = { class: className };
        if (hit) {
          hProps["data-wikilink"] = hit.slug.join("/");
          if (hit.summary) {
            hProps["data-wikilink-summary"] = hit.summary.slice(0, 240);
          }
          hProps["data-wikilink-cat"] = hit.category;
          hProps["data-wikilink-title"] = hit.title;
        }
        children.push({
          type: "link",
          url: href,
          title: hit ? null : "unresolved link",
          data: { hProperties: hProps },
          children: [{ type: "text", value: display }],
        });
        lastIdx = m.index + m[0].length;
      }
      if (lastIdx === 0) return;
      if (lastIdx < value.length) {
        children.push({ type: "text", value: value.slice(lastIdx) });
      }
      (parent as Parent).children.splice(index, 1, ...(children as unknown as Parent["children"]));
      return [SKIP, index + children.length];
    });
  };
}

// Inline markdown links of the form `[text](path/to/file.md)` are common in
// blog content imported from external sources. The default markdown renderer
// keeps the literal `.md` href, which 404s on the static site (the route is
// `/wiki/<slug>/`, not the on-disk path). Resolve them via the same slug
// index used by `[[wikilinks]]` so the inline form works too.
export function remarkInlineMdLinks(resolve: Resolver) {
  return () => (tree: Root) => {
    visit(tree, "link", (node: Link) => {
      const url = node.url ?? "";
      if (!url) return;
      // Skip absolute URLs and pure anchors
      if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return;
      if (url.startsWith("#")) return;

      // Split off optional anchor / query
      const hashIdx = url.indexOf("#");
      const queryIdx = url.indexOf("?");
      const splitIdx = [hashIdx, queryIdx].filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? -1;
      const pathPart = splitIdx >= 0 ? url.slice(0, splitIdx) : url;
      const tail = splitIdx >= 0 ? url.slice(splitIdx) : "";

      if (!pathPart.toLowerCase().endsWith(".md")) return;

      // Take basename without .md, look up via resolver
      const cleaned = pathPart.replace(/\\/g, "/").replace(/\/+$/, "");
      const base = cleaned.split("/").pop() ?? "";
      const stem = base.replace(/\.md$/i, "");
      if (!stem) return;

      const hit = resolve(stem);
      if (!hit) {
        node.url = `#unresolved-${encodeURIComponent(stem)}`;
        return;
      }
      node.url = slugToHref(hit.slug) + tail;
    });
  };
}

export function extractWikilinks(md: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  WIKILINK_RE.lastIndex = 0;
  while ((m = WIKILINK_RE.exec(md)) !== null) {
    out.push(m[2].trim());
  }
  return out;
}

export interface Backlink {
  from: VaultPage;
  context: string;
}

export function computeBacklinks(
  pages: VaultPage[],
  resolve: Resolver,
): Map<string, Backlink[]> {
  const back = new Map<string, Backlink[]>();
  for (const p of pages) {
    const targets = new Set<string>();
    let m: RegExpExecArray | null;
    WIKILINK_RE.lastIndex = 0;
    while ((m = WIKILINK_RE.exec(p.content)) !== null) {
      const t = m[2].trim();
      const hit = resolve(t);
      if (!hit) continue;
      const key = hit.slug.join("/");
      if (key === p.slug.join("/")) continue;
      if (targets.has(key)) continue;
      targets.add(key);
      const ctxStart = Math.max(0, m.index - 60);
      const ctxEnd = Math.min(p.content.length, m.index + m[0].length + 60);
      const context = p.content.slice(ctxStart, ctxEnd).replace(/\s+/g, " ").trim();
      const arr = back.get(key) ?? [];
      arr.push({ from: p, context });
      back.set(key, arr);
    }
  }
  return back;
}
