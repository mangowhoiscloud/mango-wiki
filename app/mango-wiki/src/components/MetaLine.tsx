import type { VaultPage } from "@/lib/vault";
import { ProvenanceDonut } from "./ProvenanceDonut";

function fmt(date?: string): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toISOString().slice(0, 10);
}

function relative(date?: string): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days === 1) return "1d ago";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function MetaLine({ page }: { page: VaultPage }) {
  const updated = fmt(page.updated ?? page.created);
  const rel = relative(page.updated ?? page.created);
  const sourceCount = page.sources?.length ?? 0;

  return (
    <div className="meta-line">
      <span className="meta-line__author">
        <span className="meta-line__author-badge" aria-hidden="true">K</span>
        Compiled by Kiki
      </span>
      <span className="meta-line__dot">·</span>
      {sourceCount > 0 ? (
        <>
          <span className="meta-line__meta">
            {sourceCount} source{sourceCount === 1 ? "" : "s"}
          </span>
          <span className="meta-line__dot">·</span>
        </>
      ) : null}
      {updated ? (
        <span className="meta-line__meta">
          Updated {updated}
          {rel ? <span style={{ marginLeft: "0.35em", color: "var(--ink-3)" }}>({rel})</span> : null}
        </span>
      ) : null}
      {page.provenance ? (
        <span className="meta-line__donut">
          <ProvenanceDonut provenance={page.provenance} size="sm" />
        </span>
      ) : null}
    </div>
  );
}
