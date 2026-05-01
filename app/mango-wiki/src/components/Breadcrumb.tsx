import Link from "next/link";

export function Breadcrumb({ slug }: { slug: string[] }) {
  const segments: { label: string; href: string | null }[] = [
    { label: "kiki-wiki", href: "/" },
  ];
  for (let i = 0; i < slug.length - 1; i += 1) {
    const label = slug[i];
    segments.push({ label, href: null });
  }
  segments.push({ label: slug[slug.length - 1], href: null });

  return (
    <nav className="wiki-article__breadcrumb" aria-label="Breadcrumb">
      {segments.map((s, i) => (
        <span key={i}>
          {s.href ? <Link href={s.href}>{s.label}</Link> : <span>{s.label}</span>}
          {i < segments.length - 1 ? <span className="sep">›</span> : null}
        </span>
      ))}
    </nav>
  );
}
