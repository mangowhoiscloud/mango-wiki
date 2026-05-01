import type { Provenance } from "@/lib/vault";

export function ProvenanceDonut({
  provenance,
  size = "md",
}: {
  provenance?: Provenance;
  size?: "sm" | "md" | "lg";
}) {
  const e = Math.max(0, Math.min(1, provenance?.extracted ?? 0));
  const i = Math.max(0, Math.min(1, provenance?.inferred ?? 0));
  const a = Math.max(0, Math.min(1, provenance?.ambiguous ?? 0));
  const total = e + i + a || 1;
  const pe = e / total;
  const pi = i / total;
  const pa = a / total;

  const r = 41;
  const c = 2 * Math.PI * r;
  const s1 = c * pe;
  const s2 = c * pi;
  const s3 = c * pa;

  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const title = `Provenance — extracted ${pct(e / total)} · inferred ${pct(i / total)} · ambiguous ${pct(a / total)}`;
  const cls = `prov-donut prov-donut--${size}`;

  return (
    <svg className={cls} viewBox="0 0 100 100" role="img" aria-label={title}>
      <title>{title}</title>
      <circle className="prov-donut__track" cx="50" cy="50" r={r} />
      <circle
        className="prov-donut__e"
        cx="50"
        cy="50"
        r={r}
        strokeDasharray={`${s1} ${c - s1}`}
        strokeDashoffset={0}
        transform="rotate(-90 50 50)"
      />
      <circle
        className="prov-donut__i"
        cx="50"
        cy="50"
        r={r}
        strokeDasharray={`${s2} ${c - s2}`}
        strokeDashoffset={-s1}
        transform="rotate(-90 50 50)"
      />
      <circle
        className="prov-donut__a"
        cx="50"
        cy="50"
        r={r}
        strokeDasharray={`${s3} ${c - s3}`}
        strokeDashoffset={-(s1 + s2)}
        transform="rotate(-90 50 50)"
      />
    </svg>
  );
}
