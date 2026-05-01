// Build a node/edge graph from the loaded vault pages.
// Node ids are page slugs joined with "/" (matches the wikilink target form).
// Edges come from `[[wikilink]]` extraction in page bodies; broken links are
// dropped (we never emit edges to non-existent nodes). Mirrors the data model
// of the kiki-appmaker `wiki-export` skill so external tools can consume the
// same shape via /api/graph.json if it's ever added.

import type { VaultPage } from "./vault";

export interface GraphNode {
  id: string;
  label: string;
  category: string;
  tags: string[];
  community: number;
  outDegree: number;
  inDegree: number;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface Graph {
  nodes: GraphNode[];
  links: GraphLink[];
  meta: {
    totalNodes: number;
    totalEdges: number;
    categories: string[];
    communities: { id: number; tag: string; size: number }[];
  };
}

const WIKILINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;

function pageId(page: VaultPage): string {
  return page.slug.join("/");
}

function normaliseTarget(raw: string): string {
  // Strip optional repo prefix like `kiki:` / `kiki-appmaker:` / `geode:` —
  // cross-repo references this wiki can't resolve internally; keep out of graph.
  if (raw.includes(":")) {
    const [scope] = raw.split(":");
    if (scope === "kiki" || scope === "kiki-appmaker" || scope === "geode") return "";
  }
  return raw.trim().replace(/\.md$/i, "").toLowerCase();
}

export function buildGraph(pages: VaultPage[]): Graph {
  // Build the id index. Lowercase id and label-based fallbacks.
  const byId = new Map<string, VaultPage>();
  const byLowerSlug = new Map<string, string>();
  for (const p of pages) {
    const id = pageId(p);
    byId.set(id, p);
    byLowerSlug.set(id.toLowerCase(), id);
  }

  // Edges
  const edges: GraphLink[] = [];
  for (const p of pages) {
    const sourceId = pageId(p);
    const seen = new Set<string>();
    for (const m of p.content.matchAll(WIKILINK_RE)) {
      const target = normaliseTarget(m[1]);
      if (!target) continue;
      const resolved = byLowerSlug.get(target);
      if (!resolved || resolved === sourceId) continue;
      const key = `${sourceId}|${resolved}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: sourceId, target: resolved });
    }
  }

  // Communities: group by dominant tag (frontmatter tags[0]), then by category.
  // Largest community gets id 0. Pages with no tag get id -1 → rendered grey.
  const tagCounts = new Map<string, number>();
  const pageTag = new Map<string, string | null>();
  for (const p of pages) {
    const tag = p.tags[0] || null;
    pageTag.set(pageId(p), tag);
    if (tag) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
  const sortedTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);
  const tagToCommunity = new Map<string, number>();
  sortedTags.forEach(([tag], idx) => tagToCommunity.set(tag, idx));

  // Degree counts
  const inDeg = new Map<string, number>();
  const outDeg = new Map<string, number>();
  for (const e of edges) {
    outDeg.set(e.source, (outDeg.get(e.source) ?? 0) + 1);
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  }

  const nodes: GraphNode[] = pages.map((p) => {
    const id = pageId(p);
    const tag = pageTag.get(id);
    return {
      id,
      label: p.title,
      category: p.category,
      tags: p.tags,
      community: tag ? tagToCommunity.get(tag)! : -1,
      outDegree: outDeg.get(id) ?? 0,
      inDegree: inDeg.get(id) ?? 0,
    };
  });

  const categories = [...new Set(pages.map((p) => p.category))].sort();
  const communities = sortedTags.map(([tag, size], id) => ({ id, tag, size }));

  return {
    nodes,
    links: edges,
    meta: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      categories,
      communities,
    },
  };
}
