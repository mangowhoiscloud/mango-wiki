import { notFound } from "next/navigation";
import { findBySlug, listPages } from "@/lib/vault";
import { buildResolver, computeBacklinks } from "@/lib/wikilinks";
import { renderMarkdown, extractToc } from "@/lib/render";
import { computeSeeAlso } from "@/lib/related";
import { WikiPage } from "@/components/WikiPage";

interface Params {
  slug: string[];
}

export function generateStaticParams(): Params[] {
  return listPages()
    .filter((p) => !(p.slug.length === 1 && p.slug[0] === "index"))
    .map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const page = findBySlug(slug);
  if (!page) return { title: "Not found · kiki-wiki" };
  return {
    title: `${page.title} · kiki-wiki`,
    description: page.summary ?? undefined,
  };
}

export default async function WikiPageRoute({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const page = findBySlug(slug);
  if (!page) notFound();

  const pages = listPages();
  const resolve = buildResolver(pages);
  const html = await renderMarkdown(page.content, resolve);
  const toc = extractToc(page.content);
  const backlinksIndex = computeBacklinks(pages, resolve);
  const backlinks = backlinksIndex.get(page.slug.join("/")) ?? [];
  const seeAlso = computeSeeAlso(page, pages, backlinksIndex, 4);

  return (
    <WikiPage
      page={page}
      html={html}
      toc={toc}
      backlinks={backlinks}
      seeAlso={seeAlso}
    />
  );
}
