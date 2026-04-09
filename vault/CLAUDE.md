# LLM Wiki — Schema

> Based on [Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).
> This file tells the LLM how the wiki is structured, what the conventions are, and what workflows to follow when ingesting sources, answering questions, or maintaining the wiki.
> You and the LLM co-evolve this over time as you figure out what works for your domain.

## The Core Idea

Instead of retrieving from raw documents at query time (RAG), the LLM **incrementally builds and maintains a persistent wiki** — a structured, interlinked collection of markdown files that sits between you and the raw sources. When you add a new source, the LLM reads it, extracts the key information, and integrates it into the existing wiki — updating entity pages, revising topic summaries, noting where new data contradicts old claims, strengthening or challenging the evolving synthesis. The knowledge is compiled once and then kept current, not re-derived on every query.

**The wiki is a persistent, compounding artifact.** The cross-references are already there. The contradictions have already been flagged. The synthesis already reflects everything ingested. The wiki keeps getting richer with every source added and every question asked.

You never (or rarely) write the wiki yourself — the LLM writes and maintains all of it. You're in charge of sourcing, exploration, and asking the right questions. The LLM does all the grunt work — summarizing, cross-referencing, filing, and bookkeeping.

## Architecture — Three Layers

### 1. Raw Sources (`raw/`)

Your curated collection of source documents. Articles, papers, data files, profiles. These are **immutable** — the LLM reads from them but never modifies them. This is your source of truth.

Current source collections:
```
raw/
  geode-blog/posts/        # Technical blog posts (146 documents)
  geode-blog/research/     # Research documents
  geode-docs/              # GEODE.md, CLAUDE.md, CHANGELOG.md, README.md
  geode-portfolio/geode/   # Portfolio decks
  geode-resume/            # Resume + career documents
  kiki-docs/               # Kiki project docs (YAML configs, progress)
  kiki-profiles/           # User profiles (mango, cfo, analyst, accountant)
  kiki-signals/            # Slack signal transcripts (daily)
  kiki-teams/              # Team structure definitions
```

### 2. The Wiki (LLM-generated markdown)

The LLM owns this layer entirely. It creates pages, updates them when new sources arrive, maintains cross-references (`[[wikilinks]]`), and keeps everything consistent. You read it; the LLM writes it.

Directory structure:
```
projects/
  geode/
    geode.md               # Project overview page
    concepts/              # Architecture, systems, patterns
    references/            # Blog indexes, career, frontier research
    references/blog/       # Individual blog page summaries
    skills/                # Development workflows
  kiki/
    kiki.md                # Project overview page
    concepts/              # Domain patterns, team structures
    entities/              # Agent profiles (CTO, PO, devs, QA, finance)
    references/            # Project progress
entities/                  # People (mango.md)
concepts/                  # Cross-project concepts
references/                # Cross-project references
synthesis/                 # Cross-cutting analyses, retrospectives
journal/                   # Daily entries (YYYY-MM-DD.md)
skills/                    # Cross-project skills
_archives/                 # Deprecated/superseded pages
```

### 3. This Schema (`CLAUDE.md`)

This file. It tells the LLM how the wiki is structured, what the conventions are, and what workflows to follow. You and the LLM co-evolve this over time.

## Operations

### Ingest

When a new source is dropped into `raw/`, the LLM processes it:

1. Read the source document fully
2. Discuss key takeaways with the user (if interactive)
3. Write a summary page in the appropriate wiki directory
4. Update `index.md` — add new pages with links and one-line summaries
5. Update relevant entity and concept pages across the wiki (cross-references)
6. Append an entry to `log.md`
7. Update `.manifest.json` — record source path, timestamp, pages created/updated

A single source might touch 10-15 wiki pages. Ingest sources one at a time for quality, or batch for speed.

**Page conventions:**
- Use YAML frontmatter: `title`, `tags`, `sources`, `created`, `updated`
- Use `[[wikilinks]]` for all internal cross-references
- Place pages under the correct project directory (`projects/geode/`, `projects/kiki/`)
- Cross-project pages go in root-level directories (`entities/`, `concepts/`, `synthesis/`)

### Query

Ask questions against the wiki. The LLM:

1. Reads `index.md` first to find relevant pages
2. Drills into specific pages for detail
3. Synthesizes an answer with `[[wikilink]]` citations

**Important:** Good answers can be filed back into the wiki as new pages. A comparison, an analysis, a connection — these are valuable and shouldn't disappear into chat history. File them under `synthesis/` or the appropriate project directory.

### Lint

Periodically health-check the wiki. Look for:

- Contradictions between pages
- Stale claims that newer sources have superseded
- Orphan pages with no inbound links
- Important concepts mentioned but lacking their own page
- Missing cross-references (unidirectional links that should be bidirectional)
- Data gaps that could be filled with a web search or new source

Log lint results to `log.md`.

## Special Files

### `index.md`

Content-oriented catalog of everything in the wiki. Each page listed with a `[[wikilink]]`, a one-line summary, and organized by category (Projects, Concepts, Entities, References, Synthesis, Journal). The LLM updates it on every ingest. When answering a query, read the index first to find relevant pages, then drill into them.

### `log.md`

Chronological, append-only record of operations. Format:

```
- [ISO-8601] OPERATION key=value key=value
```

Operations: `INGEST`, `QUERY`, `LINT`, `CROSS_LINK`, `FIX`, `RESTRUCTURE`, `ENRICH`, `MIGRATE`

### `.manifest.json`

Machine-readable record of all ingested sources. Tracks:
- `version` — schema version
- `lastIngest` — timestamp of most recent ingest
- `stats` — total sources ingested, total pages
- `sources` — per-source: ingested_at, source_type, project, pages_created, pages_updated, raw_path

## Conventions

### Wikilinks

All internal references use Obsidian `[[wikilinks]]`. When creating or updating a page:
- Add forward links to related pages
- Check if the target page links back; if not, add a reverse link
- Goal: zero unidirectional links

### Page Naming

- Lowercase, hyphenated: `geode-architecture.md`, `hub-spoke-pattern.md`
- Project-scoped pages include project prefix: `geode-tool-system.md`, `kiki-pipeline-hub.md`
- Entity pages use role or name: `mango.md`, `cto-agent.md`
- Journal entries: `YYYY-MM-DD.md`
- Blog summaries: `NN-slug.md` (numbered)

### Frontmatter

Every wiki page should have:
```yaml
---
title: Page Title
tags: [relevant, tags]
sources: [raw/path/to/source.md]
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

### Archives

When a page is superseded or deprecated, move it to `_archives/` rather than deleting. Update `index.md` to remove the entry.

## Tips

- **Obsidian graph view** shows the shape of the wiki — hubs, orphans, clusters
- **The wiki is just a directory of markdown files** — git-trackable, diffable, portable
- At current scale (~100 pages), `index.md` is sufficient for navigation without embedding-based search
- When the wiki grows past ~200 pages, consider adding a search tool (e.g. qmd for hybrid BM25/vector search)
- **Marp** can generate slide decks from wiki content
- **Dataview** plugin can query YAML frontmatter for dynamic tables
