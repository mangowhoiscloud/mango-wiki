import { Infobox } from "./Infobox";
import { MetaLine } from "./MetaLine";
import { Hatnote } from "./Hatnote";
import { Toc } from "./Toc";
import { FooterBar } from "./FooterBar";
import { Breadcrumb } from "./Breadcrumb";
import type { VaultPage } from "@/lib/vault";
import type { TocEntry } from "@/lib/render";
import type { Backlink } from "@/lib/wikilinks";
import type { SeeAlsoEntry } from "@/lib/related";

export function WikiPage({
  page,
  html,
  toc,
  backlinks,
  seeAlso,
}: {
  page: VaultPage;
  html: string;
  toc: TocEntry[];
  backlinks: Backlink[];
  seeAlso: SeeAlsoEntry[];
}) {
  return (
    <article className="wiki-article">
      <Breadcrumb slug={page.slug} />
      <div className="wiki-article__eyebrow">{page.category}</div>
      <h1 className="wiki-article__title">{page.title}</h1>
      {page.summary ? <p className="wiki-article__deck">{page.summary}</p> : null}
      <Hatnote page={page} />
      <MetaLine page={page} />

      <div className="wiki-article__grid">
        <div
          className="wiki-article__body prose"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <aside className="wiki-article__aside">
          <div className="aside-stack">
            <Infobox page={page} />
            <Toc entries={toc} />
          </div>
        </aside>
      </div>

      <FooterBar page={page} backlinks={backlinks} seeAlso={seeAlso} />
    </article>
  );
}
