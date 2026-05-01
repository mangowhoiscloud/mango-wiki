import type { VaultPage } from "./vault";
import { extractFirstParagraph } from "./related";

export interface SearchEntry {
  id: string;
  slug: string;
  title: string;
  category: string;
  aliases: string[];
  tags: string[];
  summary: string;
  preview: string;
  body: string;
  href: string;
}

function cleanBody(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, "$2 $1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_#>~\-|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildSearchIndex(pages: VaultPage[]): SearchEntry[] {
  return pages
    .filter((p) => !(p.slug.length === 1 && p.slug[0] === "index"))
    .map((p) => ({
      id: p.slug.join("/"),
      slug: p.slug.join("/"),
      title: p.title,
      category: p.category,
      aliases: p.aliases,
      tags: p.tags,
      summary: p.summary ?? "",
      preview: extractFirstParagraph(p.content, 220),
      body: cleanBody(p.content).slice(0, 3200),
      href: "/wiki/" + p.slug.map(encodeURIComponent).join("/"),
    }));
}
