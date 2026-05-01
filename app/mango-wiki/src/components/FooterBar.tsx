import Link from "next/link";
import type { VaultPage } from "@/lib/vault";
import { slugToHref } from "@/lib/vault";
import type { Backlink } from "@/lib/wikilinks";
import type { SeeAlsoEntry } from "@/lib/related";

export function FooterBar({
  page,
  backlinks,
  seeAlso,
}: {
  page: VaultPage;
  backlinks: Backlink[];
  seeAlso: SeeAlsoEntry[];
}) {
  const sources = page.sources ?? [];
  return (
    <footer className="footer-bar">
      {sources.length > 0 ? (
        <details className="sources-block" open>
          <summary>
            <span className="sources-block__heading">
              ❦ Compiled from{" "}
              <span className="sources-block__count">
                {sources.length} source{sources.length === 1 ? "" : "s"}
              </span>
            </span>
          </summary>
          <p className="sources-block__hint">
            An LLM distilled this page from the items below. Each claim is
            traceable.
          </p>
          <ol className="sources-block__list">
            {sources.map((s, i) => (
              <li key={`${s}-${i}`}>{s}</li>
            ))}
          </ol>
        </details>
      ) : null}

      {seeAlso.length > 0 ? (
        <section className="seealso-block">
          <h2 className="seealso-block__heading">See also</h2>
          <ul className="seealso-block__list">
            {seeAlso.map(({ page: p }) => (
              <li key={p.slug.join("/")} className="seealso-block__item">
                <Link href={slugToHref(p.slug)} className="seealso-block__item-title">
                  {p.title}
                </Link>
                {p.summary ? (
                  <div className="seealso-block__item-sum">{p.summary.slice(0, 140)}</div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {backlinks.length > 0 ? (
        <section className="backlinks-block">
          <h2 className="backlinks-block__heading">
            Linked from {backlinks.length} page{backlinks.length === 1 ? "" : "s"}
          </h2>
          <ul className="backlinks-block__list">
            {backlinks.map((b, i) => (
              <li key={`${b.from.slug.join("/")}-${i}`} className="backlinks-block__item">
                <Link
                  href={slugToHref(b.from.slug)}
                  className="backlinks-block__item-title"
                >
                  {b.from.title}
                  <span className="backlinks-block__item-cat">{b.from.category}</span>
                </Link>
                <div className="backlinks-block__item-ctx">…{b.context}…</div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <nav className="cats-bar" aria-label="Categories">
        <span className="cats-bar__label">Categories</span>
        <span className="cats-bar__pill cats-bar__pill--accent">{page.category}</span>
        {page.tags.map((t) => (
          <span key={t} className="cats-bar__pill">#{t}</span>
        ))}
      </nav>

      <div className="source-path">
        <code>{page.relPath}</code>
      </div>
    </footer>
  );
}
