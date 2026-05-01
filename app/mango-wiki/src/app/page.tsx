import Link from "next/link";
import { groupByCategory, listPages, slugToHref } from "@/lib/vault";
import { buildResolver } from "@/lib/wikilinks";
import {
  computeBacklinkCounts,
  extractFirstParagraph,
  mostLinked,
  recentlyCompiled,
} from "@/lib/related";
import { ProvenanceDonut } from "@/components/ProvenanceDonut";

const CATEGORY_BLURB: Record<string, string> = {
  concepts: "atomic ideas that recur across the system",
  entities: "agents, teams, and named things",
  synthesis: "cross-cutting analyses compiled from incidents and decisions",
  references: "normative source documents, linked once, cited often",
  skills: "how-to guides for operating the system",
  project: "issue-scoped pages compiled from live Paperclip state",
  journal: "session logs — what was done on a given day",
  meta: "wiki schema and activity log",
};

const CATEGORY_ORDER = [
  "concepts",
  "entities",
  "synthesis",
  "references",
  "skills",
  "project",
  "journal",
  "meta",
];

function fmtDate(d?: string): string {
  if (!d) return "";
  return d.slice(0, 10);
}

export default async function HomePage() {
  const pages = listPages();
  const resolve = buildResolver(pages);
  const backlinkCounts = computeBacklinkCounts(pages, resolve);
  const topLinked = mostLinked(pages, backlinkCounts, 5);
  const recent = recentlyCompiled(pages, 5);
  const byCat = groupByCategory(pages);

  const totalSources = pages.reduce((n, p) => n + (p.sources?.length ?? 0), 0);
  const withProv = pages.filter((p) => p.provenance).length;
  const today = new Date().toISOString().slice(0, 10);

  // pick a featured page: newest synthesis page (or just the newest)
  const featured =
    pages.find(
      (p) => p.category === "synthesis" && p === recent.find((r) => r.category === "synthesis"),
    ) ??
    recent.find((p) => p.category === "synthesis") ??
    recent[0];

  const featuredPreview = featured ? extractFirstParagraph(featured.content, 520) : "";
  const featuredBacklinks = featured
    ? backlinkCounts.get(featured.slug.join("/")) ?? 0
    : 0;

  return (
    <article className="home">
      <header className="masthead">
        <div className="masthead__eyebrow">mango·wiki · personal · issue {today}</div>
        <h1 className="masthead__title">mango wiki</h1>
        <p className="masthead__tagline">
          A personal LLM-compiled wiki aggregating GEODE, Kiki, and
          Kiki AppMaker knowledge. Architecture decisions, skill catalog,
          frontier research, and synthesis — distilled from each
          source repo and cross-linked. Each page cites where it was
          compiled from.
        </p>
        <dl className="masthead__stats">
          <div className="masthead__stat">
            <strong>{pages.length}</strong>
            <span>pages</span>
          </div>
          <div className="masthead__stat">
            <strong>{byCat.size}</strong>
            <span>categories</span>
          </div>
          <div className="masthead__stat">
            <strong>{totalSources}</strong>
            <span>total sources</span>
          </div>
          <div className="masthead__stat">
            <strong>{withProv}</strong>
            <span>with provenance</span>
          </div>
        </dl>
      </header>

      {recent[0] ? (
        <div className="hatnote-strip">
          <em>Today in this wiki: </em>
          <Link href={slugToHref(recent[0].slug)}>{recent[0].title}</Link>
          <em> was updated {fmtDate(recent[0].updated ?? recent[0].created)} · </em>
          {recent.length} page{recent.length === 1 ? "" : "s"} touched this week.
        </div>
      ) : null}

      <div className="paper-grid">
        <section className="paper-col">
          <h2 className="paper-col__title">Most linked</h2>
          <ul className="paper-col__list">
            {topLinked.map(({ page: p, count }) => (
              <li key={p.slug.join("/")}>
                <Link href={slugToHref(p.slug)} className="paper-col__entry-head">
                  {p.title}
                </Link>
                <div className="paper-col__entry-deck">
                  {p.summary ? p.summary.slice(0, 120) : extractFirstParagraph(p.content, 120)}
                </div>
                <div className="paper-col__entry-meta">
                  <span className="paper-col__badge">{p.category}</span>
                  {count} backlink{count === 1 ? "" : "s"}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="paper-col">
          <h2 className="paper-col__title">Recently compiled</h2>
          <ul className="paper-col__list">
            {recent.map((p) => (
              <li key={p.slug.join("/")}>
                <Link href={slugToHref(p.slug)} className="paper-col__entry-head">
                  {p.title}
                </Link>
                <div className="paper-col__entry-deck">
                  {p.summary ? p.summary.slice(0, 110) : extractFirstParagraph(p.content, 110)}
                </div>
                <div className="paper-col__entry-meta">
                  <span className="paper-col__badge">{p.category}</span>
                  {fmtDate(p.updated ?? p.created)}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="paper-col">
          <h2 className="paper-col__title">By category</h2>
          <ul className="paper-col__list">
            {CATEGORY_ORDER.filter((c) => byCat.has(c)).slice(0, 5).map((cat) => {
              const list = byCat.get(cat) ?? [];
              return (
                <li key={cat}>
                  <span className="paper-col__entry-head">
                    {cat} <span style={{ color: "var(--ink-3)", fontSize: "0.75em", fontWeight: 400 }}>{list.length}</span>
                  </span>
                  <div className="paper-col__entry-deck">
                    {list.slice(0, 3).map((p, i) => (
                      <span key={p.slug.join("/")}>
                        {i > 0 ? " · " : ""}
                        <Link href={slugToHref(p.slug)}>{p.title}</Link>
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {featured ? (
        <section className="featured">
          <div>
            <div className="featured__eyebrow">Featured · {featured.category}</div>
            <h2 className="featured__title">
              <Link href={slugToHref(featured.slug)}>{featured.title}</Link>
            </h2>
            {featured.summary ? (
              <p className="featured__deck">{featured.summary}</p>
            ) : null}
            <p className="featured__preview">{featuredPreview}</p>
          </div>
          <dl className="featured__meta">
            {featured.sources && featured.sources.length > 0 ? (
              <>
                <dt>Compiled from</dt>
                <dd>{featured.sources.length} sources</dd>
              </>
            ) : null}
            <dt>Updated</dt>
            <dd>{fmtDate(featured.updated ?? featured.created)}</dd>
            <dt>Backlinks</dt>
            <dd>{featuredBacklinks}</dd>
            {featured.provenance ? (
              <>
                <dt>Provenance</dt>
                <dd style={{ marginTop: "0.3em" }}>
                  <ProvenanceDonut provenance={featured.provenance} size="md" />
                </dd>
              </>
            ) : null}
          </dl>
        </section>
      ) : null}

      <section className="dir-grid">
        {[...byCat.entries()]
          .sort((a, b) => {
            const ai = CATEGORY_ORDER.indexOf(a[0]);
            const bi = CATEGORY_ORDER.indexOf(b[0]);
            return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
          })
          .map(([cat, list]) => (
            <div key={cat} className="dir-col">
              <h3 className="dir-col__title">
                {cat}
                <span className="dir-col__count">{list.length}</span>
              </h3>
              {CATEGORY_BLURB[cat] ? (
                <p className="dir-col__blurb">{CATEGORY_BLURB[cat]}</p>
              ) : null}
              <ul className="dir-col__list">
                {list.slice(0, 10).map((p) => (
                  <li key={p.slug.join("/")}>
                    <Link href={slugToHref(p.slug)}>{p.title}</Link>
                  </li>
                ))}
                {list.length > 10 ? (
                  <li style={{ color: "var(--ink-3)", fontSize: "0.78rem", fontStyle: "italic", marginTop: "0.3em" }}>
                    …{list.length - 10} more
                  </li>
                ) : null}
              </ul>
            </div>
          ))}
      </section>
    </article>
  );
}
