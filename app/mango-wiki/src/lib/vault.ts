import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export interface Provenance {
  extracted?: number;
  inferred?: number;
  ambiguous?: number;
}

export interface VaultPage {
  slug: string[];
  filePath: string;
  relPath: string;
  title: string;
  category: string;
  tags: string[];
  aliases: string[];
  summary?: string;
  sources?: string[];
  provenance?: Provenance;
  created?: string;
  updated?: string;
  content: string;
  extra: Record<string, unknown>;
}

export function getVaultDir(): string {
  // mango-wiki engine: env override > .env (OBSIDIAN_VAULT_PATH) > default sibling vault/
  // The default targets the mango-wiki repo's vault/ since this app lives at app/mango-wiki/.
  const envPath =
    process.env.MANGO_VAULT_DIR ||
    process.env.KIKI_VAULT_DIR ||
    process.env.OBSIDIAN_VAULT_PATH;
  if (envPath && envPath.length > 0) {
    return path.isAbsolute(envPath)
      ? envPath
      : path.resolve(process.cwd(), envPath);
  }
  return path.resolve(process.cwd(), "../../vault");
}

const SKIP_DIRS = new Set(["_raw", "node_modules", ".git", ".obsidian"]);

function walk(root: string, dir: string, out: VaultPage[]) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(root, abs, out);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

    const rel = path.relative(root, abs);
    const slugParts = rel.replace(/\.md$/, "").split(path.sep);
    const raw = fs.readFileSync(abs, "utf8");
    let parsed: { data: Record<string, unknown>; content: string };
    try {
      const out = matter(raw);
      parsed = { data: out.data as Record<string, unknown>, content: out.content };
    } catch (err) {
      console.warn(`[mango-wiki] frontmatter parse failed for ${rel}: ${(err as Error).message}`);
      const stripped = raw.replace(/^---[\s\S]*?---\s*/, "");
      parsed = { data: {}, content: stripped };
    }
    const data = parsed.data;

    out.push({
      slug: slugParts,
      filePath: abs,
      relPath: rel,
      title: asString(data.title) ?? slugParts[slugParts.length - 1],
      category:
        asString(data.category) ??
        (slugParts.length > 1 ? slugParts[0] : "meta"),
      tags: asStringArray(data.tags),
      aliases: asStringArray(data.aliases),
      summary: asString(data.summary),
      sources: asStringArray(data.sources),
      provenance: asProvenance(data.provenance),
      created: asString(data.created),
      updated: asString(data.updated),
      content: parsed.content,
      extra: data,
    });
  }
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function asProvenance(v: unknown): Provenance | undefined {
  if (!v || typeof v !== "object") return undefined;
  const obj = v as Record<string, unknown>;
  const pick = (k: string) =>
    typeof obj[k] === "number" ? (obj[k] as number) : undefined;
  return {
    extracted: pick("extracted"),
    inferred: pick("inferred"),
    ambiguous: pick("ambiguous"),
  };
}

// Cache is bypassed in dev mode so vault edits surface live (`next dev` hot
// reload + fresh listPages() per request). In production builds the cache
// stays for performance — rebuild to reflect new content. Set
// MANGO_DISABLE_CACHE=1 to force-disable in any mode.
let cache: VaultPage[] | null = null;

const isDev = process.env.NODE_ENV !== "production";
const disableCache = process.env.MANGO_DISABLE_CACHE === "1" || isDev;

export function listPages(): VaultPage[] {
  if (cache && !disableCache) return cache;
  const root = getVaultDir();
  if (!fs.existsSync(root)) {
    console.warn(`[mango-wiki] vault dir not found: ${root}`);
    cache = [];
    return cache;
  }
  const pages: VaultPage[] = [];
  walk(root, root, pages);
  cache = pages;
  return pages;
}

export function findBySlug(slug: string[]): VaultPage | undefined {
  const key = slug.join("/");
  return listPages().find((p) => p.slug.join("/") === key);
}

export function slugToHref(slug: string[]): string {
  if (slug.length === 1 && slug[0] === "index") return "/";
  return "/wiki/" + slug.map(encodeURIComponent).join("/");
}

export function groupByCategory(pages: VaultPage[]): Map<string, VaultPage[]> {
  const out = new Map<string, VaultPage[]>();
  for (const p of pages) {
    if (p.slug.length === 1 && p.slug[0] === "index") continue;
    const arr = out.get(p.category) ?? [];
    arr.push(p);
    out.set(p.category, arr);
  }
  for (const [, arr] of out) arr.sort((a, b) => a.title.localeCompare(b.title));
  return out;
}
