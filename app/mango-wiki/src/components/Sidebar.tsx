import Link from "next/link";
import { listPages, slugToHref, groupByCategory, type VaultPage } from "@/lib/vault";
import { buildSearchIndex } from "@/lib/search";
import { SearchTrigger } from "./SearchTrigger";
import { SearchPalette } from "./SearchPalette";
import { ThemeToggle } from "./ThemeToggle";

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

function categoryLabel(c: string): string {
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function NavContent({ activeSlug }: { activeSlug?: string }) {
  const pages = listPages();
  const byCat = groupByCategory(pages);
  const cats = [...byCat.keys()].sort(
    (a, b) => order(a) - order(b) || a.localeCompare(b),
  );

  return (
    <>
      <Link href="/" className="sidebar__brand">mango·wiki</Link>
      <p className="sidebar__subtitle">Personal LLM-compiled wiki — GEODE / Kiki / Kiki AppMaker aggregated</p>
      <SearchTrigger />
      <Link href="/graph" className="sidebar__graph-link">↗ Graph view</Link>
      <nav className="sidebar__nav">
        {cats.map((cat) => (
          <details key={cat} open className="sidebar__group">
            <summary className="sidebar__group-title">
              {categoryLabel(cat)}
              <span className="sidebar__count">{byCat.get(cat)!.length}</span>
            </summary>
            <ul className="sidebar__list">
              {byCat.get(cat)!.map((p: VaultPage) => {
                const key = p.slug.join("/");
                return (
                  <li key={key}>
                    <Link
                      href={slugToHref(p.slug)}
                      className={
                        activeSlug === key
                          ? "sidebar__link sidebar__link--active"
                          : "sidebar__link"
                      }
                    >
                      {p.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </details>
        ))}
      </nav>
      <div className="sidebar__footer">
        <span>{pages.length} pages</span>
        <ThemeToggle />
      </div>
    </>
  );
}

export function Sidebar({ activeSlug }: { activeSlug?: string }) {
  const pages = listPages();
  const searchIndex = buildSearchIndex(pages);
  return (
    <aside className="sidebar" aria-label="Wiki navigation">
      <NavContent activeSlug={activeSlug} />
      <SearchPalette index={searchIndex} />
    </aside>
  );
}

export function SidebarBody({ activeSlug }: { activeSlug?: string }) {
  return <NavContent activeSlug={activeSlug} />;
}

function order(c: string): number {
  const i = CATEGORY_ORDER.indexOf(c);
  return i === -1 ? CATEGORY_ORDER.length : i;
}
