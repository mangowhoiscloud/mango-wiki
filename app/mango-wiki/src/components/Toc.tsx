import type { TocEntry } from "@/lib/render";

export function Toc({ entries }: { entries: TocEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <nav className="toc" aria-labelledby="toc-heading">
      <div id="toc-heading" className="toc__heading">
        Contents
      </div>
      <ol className="toc__list">
        {entries.map((e, i) => (
          <li key={`${e.id}-${i}`} className={`toc__item toc__item--d${e.depth}`}>
            <a href={`#${e.id}`}>{e.text}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
