"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SearchEntry } from "@/lib/search";

const RECENT_KEY = "kiki-wiki:recent";
const RECENT_MAX = 8;

interface ParsedQuery {
  cat: string | null;
  tag: string | null;
  backlinkOf: string | null;
  terms: string[];
  free: string;
}

function parseQuery(raw: string): ParsedQuery {
  let cat: string | null = null;
  let tag: string | null = null;
  let backlinkOf: string | null = null;
  const rest: string[] = [];
  const tokens = raw.trim().split(/\s+/);
  for (const tok of tokens) {
    if (!tok) continue;
    const low = tok.toLowerCase();
    if (low.startsWith("cat:")) {
      cat = low.slice(4);
    } else if (low.startsWith("tag:")) {
      tag = low.slice(4).replace(/^#/, "");
    } else if (tok.startsWith("@")) {
      backlinkOf = tok.slice(1);
    } else {
      rest.push(tok);
    }
  }
  const free = rest.join(" ");
  return {
    cat,
    tag,
    backlinkOf,
    terms: free.toLowerCase().split(/\s+/).filter((t) => t.length > 0),
    free,
  };
}

function countOccurrences(hay: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = hay.indexOf(needle, idx)) !== -1) {
    count += 1;
    idx += needle.length;
  }
  return count;
}

interface ScoredHit {
  entry: SearchEntry;
  score: number;
  matchField: "title" | "alias" | "summary" | "body" | "tag" | "category" | "none";
  matchedText: string;
  matchIndex: number;
}

function scoreEntry(
  entry: SearchEntry,
  parsed: ParsedQuery,
): ScoredHit | null {
  if (parsed.cat && entry.category.toLowerCase() !== parsed.cat) return null;
  if (parsed.tag) {
    const has = entry.tags.some((t) => t.toLowerCase() === parsed.tag);
    if (!has) return null;
  }

  const qLower = parsed.free.toLowerCase();
  const terms = parsed.terms;
  let score = 0;
  let field: ScoredHit["matchField"] = "none";
  let matchedText = entry.summary || entry.preview;
  let matchIndex = 0;

  // No free-text — pure filter
  if (!qLower && (parsed.cat || parsed.tag)) {
    return {
      entry,
      score: 1,
      matchField: parsed.cat ? "category" : "tag",
      matchedText,
      matchIndex: 0,
    };
  }
  if (!qLower) return null;

  const t = entry.title.toLowerCase();
  if (t === qLower) { score += 1000; field = "title"; matchedText = entry.title; }
  else if (t.startsWith(qLower)) { score += 220; field = "title"; matchedText = entry.title; }
  else if (t.includes(qLower)) {
    score += 90;
    field = "title";
    matchedText = entry.title;
  }

  for (const alias of entry.aliases) {
    const al = alias.toLowerCase();
    if (al === qLower) { score += 500; if (field === "none") field = "alias"; matchedText = alias; }
    else if (al.includes(qLower)) {
      score += 70;
      if (field === "none") { field = "alias"; matchedText = alias; }
    }
  }

  const summary = entry.summary.toLowerCase();
  if (summary.includes(qLower)) {
    score += 40;
    if (field === "none") {
      field = "summary";
      matchedText = entry.summary;
      matchIndex = summary.indexOf(qLower);
    }
  }

  const body = entry.body.toLowerCase();
  const bodyCount = countOccurrences(body, qLower);
  if (bodyCount > 0) {
    score += Math.min(20, bodyCount * 5);
    if (field === "none") {
      field = "body";
      matchedText = entry.body;
      matchIndex = body.indexOf(qLower);
    }
  }

  for (const term of terms) {
    if (term.length < 2) continue;
    if (t.includes(term)) score += 12;
    if (summary.includes(term)) score += 6;
    if (body.includes(term)) score += 3;
    for (const tag of entry.tags) {
      if (tag.toLowerCase().includes(term)) score += 10;
    }
    if (entry.category.toLowerCase().includes(term)) score += 4;
  }

  if (score === 0) return null;
  return { entry, score, matchField: field, matchedText, matchIndex };
}

function makeSnippet(text: string, at: number, width = 80): { before: string; match: string; after: string } {
  const safeAt = Math.max(0, at);
  const start = Math.max(0, safeAt - width);
  const end = Math.min(text.length, safeAt + width);
  return {
    before: (start > 0 ? "…" : "") + text.slice(start, safeAt),
    match: "",
    after: text.slice(safeAt, end) + (end < text.length ? "…" : ""),
  };
}

function highlight(
  text: string,
  q: string,
): { before: string; match: string; after: string } | null {
  if (!q) return null;
  const low = text.toLowerCase();
  const idx = low.indexOf(q.toLowerCase());
  if (idx < 0) return null;
  const start = Math.max(0, idx - 48);
  const end = Math.min(text.length, idx + q.length + 96);
  return {
    before: (start > 0 ? "…" : "") + text.slice(start, idx),
    match: text.slice(idx, idx + q.length),
    after: text.slice(idx + q.length, end) + (end < text.length ? "…" : ""),
  };
}

function readRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function pushRecent(slug: string) {
  try {
    const cur = readRecent().filter((s) => s !== slug);
    cur.unshift(slug);
    localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, RECENT_MAX)));
  } catch {
    /* ignore */
  }
}

export function SearchPalette({ index }: { index: SearchEntry[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRowRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const byId = useMemo(() => {
    const m = new Map<string, SearchEntry>();
    for (const e of index) m.set(e.id, e);
    return m;
  }, [index]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const targetTag = (e.target as HTMLElement)?.tagName ?? "";
      const inField = /INPUT|TEXTAREA/.test(targetTag);
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !open && !inField) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    const handler = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("kiki-wiki:open-search", handler as EventListener);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("kiki-wiki:open-search", handler as EventListener);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setActive(0);
      setRecent(readRecent());
      document.body.classList.add("no-scroll");
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQ("");
      document.body.classList.remove("no-scroll");
    }
    return () => document.body.classList.remove("no-scroll");
  }, [open]);

  const parsed = useMemo(() => parseQuery(q), [q]);

  const results = useMemo((): ScoredHit[] => {
    // Backlinks-of mode
    if (parsed.backlinkOf) {
      const tgt = parsed.backlinkOf.toLowerCase();
      const hits = index.filter(
        (e) =>
          e.body.toLowerCase().includes(`[[${tgt}`) ||
          e.body.toLowerCase().includes(tgt),
      );
      return hits.slice(0, 12).map((entry) => ({
        entry,
        score: 1,
        matchField: "body" as const,
        matchedText: entry.body,
        matchIndex: entry.body.toLowerCase().indexOf(tgt),
      }));
    }

    if (!parsed.free.trim() && !parsed.cat && !parsed.tag) return [];

    return index
      .map((e) => scoreEntry(e, parsed))
      .filter((x): x is ScoredHit => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 18);
  }, [parsed, index]);

  const showingBrowse = results.length === 0 && !q.trim();
  const recentEntries = useMemo(
    () => recent.map((s) => byId.get(s)).filter((e): e is SearchEntry => !!e),
    [recent, byId],
  );

  const openHit = useCallback(
    (hit: SearchEntry) => {
      pushRecent(hit.id);
      router.push(hit.href);
      setOpen(false);
    },
    [router],
  );

  useEffect(() => {
    if (open && activeRowRef.current) {
      activeRowRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [active, open]);

  const onKeyInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const max = results.length > 0 ? results.length : recentEntries.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(max - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target =
        results.length > 0 ? results[active]?.entry : recentEntries[active];
      if (target) openHit(target);
    }
  };

  if (!open) return null;

  return (
    <div
      className="palette-backdrop"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
    >
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <div className="palette__input-row">
          <svg
            className="palette__input-icon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            className="palette__input"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyInput}
            placeholder={`Search ${index.length} pages — try "cat:concepts", "tag:c21", "@slug"…`}
          />
          <span className="palette__esc">esc</span>
        </div>

        {(parsed.cat || parsed.tag || parsed.backlinkOf) ? (
          <div className="palette__filters">
            {parsed.cat ? (
              <span className="palette__filter">
                cat <strong>{parsed.cat}</strong>
              </span>
            ) : null}
            {parsed.tag ? (
              <span className="palette__filter">
                tag <strong>#{parsed.tag}</strong>
              </span>
            ) : null}
            {parsed.backlinkOf ? (
              <span className="palette__filter">
                links-to <strong>{parsed.backlinkOf}</strong>
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="palette__body">
          {showingBrowse ? (
            recentEntries.length > 0 ? (
              <>
                <div className="palette__section-title">Recent</div>
                {recentEntries.map((entry, i) => (
                  <div
                    key={entry.id}
                    ref={i === active ? activeRowRef : null}
                    className={`palette__hit${i === active ? " palette__hit--active" : ""}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => openHit(entry)}
                  >
                    <div className="palette__hit-row1">
                      <div className="palette__hit-title">{entry.title}</div>
                      <div className="palette__hit-cat">{entry.category}</div>
                    </div>
                    {entry.summary ? (
                      <div className="palette__hit-snippet">{entry.summary.slice(0, 140)}</div>
                    ) : null}
                  </div>
                ))}
                <div className="palette__section-title" style={{ marginTop: "0.3rem" }}>Hints</div>
                <div className="palette__hints">
                  <div><kbd>cat:concepts</kbd> filter by category</div>
                  <div><kbd>tag:c21</kbd> filter by tag</div>
                  <div><kbd>@slug</kbd> find pages linking to a slug</div>
                </div>
              </>
            ) : (
              <div className="palette__empty-rich">
                <div className="palette__empty-title">Search the wiki</div>
                <div className="palette__empty-body">
                  Start typing to match titles, summaries, tags, and body text.
                </div>
                <div className="palette__hints">
                  <div><kbd>cat:concepts</kbd> filter by category</div>
                  <div><kbd>tag:c21</kbd> filter by tag</div>
                  <div><kbd>@slug</kbd> find pages linking to a slug</div>
                  <div><kbd>/</kbd> open from anywhere</div>
                </div>
              </div>
            )
          ) : results.length === 0 ? (
            <div className="palette__empty">
              No pages match <b>{q}</b>.
              {parsed.cat || parsed.tag ? " Try removing the filter." : null}
            </div>
          ) : (
            <>
              <div className="palette__section-title">
                {results.length} result{results.length === 1 ? "" : "s"}
                {parsed.free ? ` for "${parsed.free}"` : ""}
              </div>
              {results.map((hit, i) => {
                const entry = hit.entry;
                const hl = parsed.free
                  ? highlight(
                      hit.matchField === "body" ? entry.body : hit.matchedText,
                      parsed.free,
                    ) ?? (parsed.free && entry.summary ? highlight(entry.summary, parsed.free) : null)
                  : null;
                const snippetFallback = entry.summary || entry.preview || "";
                const snippet =
                  hl ??
                  (hit.matchIndex > 0
                    ? makeSnippet(entry.body, hit.matchIndex)
                    : null);
                return (
                  <div
                    key={entry.id}
                    ref={i === active ? activeRowRef : null}
                    className={`palette__hit${i === active ? " palette__hit--active" : ""}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => openHit(entry)}
                  >
                    <div className="palette__hit-row1">
                      <div className="palette__hit-title">{entry.title}</div>
                      <div className="palette__hit-cat">{entry.category}</div>
                    </div>
                    <div className="palette__hit-snippet">
                      {snippet ? (
                        <>
                          {snippet.before}
                          {snippet.match ? <mark>{snippet.match}</mark> : null}
                          {snippet.after}
                        </>
                      ) : (
                        snippetFallback.slice(0, 140)
                      )}
                    </div>
                    <div className="palette__hit-path">
                      <span className="palette__hit-matchchip">
                        match: {hit.matchField}
                      </span>
                      {"  "}
                      {entry.slug}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="palette__footer">
          <span><kbd>↑</kbd> <kbd>↓</kbd> nav</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
          <span style={{ marginLeft: "auto", fontFamily: "var(--font-display)", fontStyle: "italic" }}>
            {index.length} pages indexed
          </span>
        </div>
      </div>
    </div>
  );
}
