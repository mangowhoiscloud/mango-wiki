import type { VaultPage } from "@/lib/vault";
import { ProvenanceDonut } from "./ProvenanceDonut";

function pct(n?: number): string {
  if (typeof n !== "number") return "—";
  return `${Math.round(n * 100)}%`;
}

export function Infobox({ page }: { page: VaultPage }) {
  const p = page.provenance;
  const leaf = page.slug[page.slug.length - 1];
  return (
    <aside className="infobox" aria-label="Page summary">
      <div className="infobox__category">{page.category}</div>
      <div className="infobox__title">{page.title}</div>
      {page.summary ? <div className="infobox__summary">{page.summary}</div> : null}

      <dl className="infobox__table">
        <dt>Slug</dt>
        <dd><code>{leaf}</code></dd>

        {page.aliases.length > 0 ? (
          <>
            <dt>Aliases</dt>
            <dd>{page.aliases.join(", ")}</dd>
          </>
        ) : null}

        {page.created ? (
          <>
            <dt>Created</dt>
            <dd>{page.created.slice(0, 10)}</dd>
          </>
        ) : null}

        {page.updated ? (
          <>
            <dt>Updated</dt>
            <dd>{page.updated.slice(0, 10)}</dd>
          </>
        ) : null}

        {page.sources && page.sources.length > 0 ? (
          <>
            <dt>Sources</dt>
            <dd>{page.sources.length} compiled</dd>
          </>
        ) : null}

        {p ? (
          <>
            <dt>Provenance</dt>
            <dd>
              <div className="infobox__prov-row">
                <ProvenanceDonut provenance={p} size="md" />
                <div className="infobox__prov-legend">
                  <span>extracted <em>{pct(p.extracted)}</em></span>
                  <span>inferred <em>{pct(p.inferred)}</em></span>
                  <span>ambiguous <em>{pct(p.ambiguous)}</em></span>
                </div>
              </div>
            </dd>
          </>
        ) : null}

        {page.tags.length > 0 ? (
          <>
            <dt>Tags</dt>
            <dd className="infobox__tags">
              {page.tags.map((t) => (
                <span key={t} className="tag">#{t}</span>
              ))}
            </dd>
          </>
        ) : null}
      </dl>
    </aside>
  );
}
