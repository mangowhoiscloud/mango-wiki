import type { VaultPage } from "./vault";
import { computeBacklinks, type Resolver } from "./wikilinks";

export interface SeeAlsoEntry {
  page: VaultPage;
  score: number;
}

export function computeSeeAlso(
  page: VaultPage,
  allPages: VaultPage[],
  backlinkIndex: Map<string, { from: VaultPage }[]>,
  limit = 4,
): SeeAlsoEntry[] {
  const pageKey = page.slug.join("/");
  const myTags = new Set(page.tags);
  const myLinks = new Set<string>();
  for (const [k, v] of backlinkIndex.entries()) {
    if (v.some((b) => b.from.slug.join("/") === pageKey)) myLinks.add(k);
  }
  const myBacklinks = new Set(
    (backlinkIndex.get(pageKey) ?? []).map((b) => b.from.slug.join("/")),
  );

  const candidates: SeeAlsoEntry[] = [];
  for (const p of allPages) {
    const key = p.slug.join("/");
    if (key === pageKey) continue;
    let score = 0;
    for (const t of p.tags) if (myTags.has(t)) score += 2;
    if (myLinks.has(key)) score += 1;
    if (myBacklinks.has(key)) score += 1;
    if (p.category === page.category) score += 0.5;
    if (score >= 2) candidates.push({ page: p, score });
  }
  candidates.sort((a, b) => b.score - a.score || a.page.title.localeCompare(b.page.title));
  return candidates.slice(0, limit);
}

export function computeBacklinkCounts(
  pages: VaultPage[],
  resolve: Resolver,
): Map<string, number> {
  const index = computeBacklinks(pages, resolve);
  const counts = new Map<string, number>();
  for (const [k, v] of index.entries()) counts.set(k, v.length);
  return counts;
}

export function mostLinked(
  pages: VaultPage[],
  counts: Map<string, number>,
  limit = 5,
): { page: VaultPage; count: number }[] {
  return pages
    .filter((p) => !(p.slug.length === 1 && p.slug[0] === "index"))
    .map((p) => ({ page: p, count: counts.get(p.slug.join("/")) ?? 0 }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count || a.page.title.localeCompare(b.page.title))
    .slice(0, limit);
}

export function recentlyCompiled(
  pages: VaultPage[],
  limit = 5,
): VaultPage[] {
  return [...pages]
    .filter((p) => !(p.slug.length === 1 && p.slug[0] === "index"))
    .sort((a, b) => {
      const au = a.updated || a.created || "";
      const bu = b.updated || b.created || "";
      return bu.localeCompare(au);
    })
    .slice(0, limit);
}

export function extractFirstParagraph(content: string, max = 320): string {
  const body = content.trim().replace(/^#\s+.+\n+/, "");
  const firstPara = body.split(/\n{2,}/)[0] ?? "";
  const clean = firstPara.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, "$2$1").replace(/`([^`]+)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max).replace(/\s+\S*$/, "") + "…" : clean;
}
