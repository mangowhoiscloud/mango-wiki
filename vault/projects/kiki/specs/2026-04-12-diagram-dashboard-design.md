---
title: "spec — 2026-04-12-diagram-dashboard-design"
type: spec
created: 2026-04-29
updated: 2026-04-29
tags: [specs]
sources:
  - docs/superpowers/specs/2026-04-12-diagram-dashboard-design.md
---

# Excalidraw Diagram Dashboard — Design Spec

> Full document: `docs/superpowers/specs/2026-04-12-diagram-dashboard-design.md`

## Summary (first 150 lines)


> A versioned architecture diagram gallery that lets a CTO flag issues for
> visualization, delegates rendering to the appropriate agent (Lead or Dev)
> based on timing and scope via the excalidraw-diagram skill, and serves
> the results through an interactive dashboard with project-level history,
> audience filtering, and side-by-side comparison.

## Problem

When significant code changes land (new features, logic flow rewrites,
cross-domain impact), there is no systematic way to:

1. **Capture** the architectural state as a visual artifact
2. **Track** how diagrams evolve across issues and versions
3. **Route** the right diagram to the right audience (Dev needs sequence
   diagrams; PO needs state-transition diagrams; QA needs domain-map coverage)

Engineers rely on ad-hoc whiteboard sketches or stale documentation that
diverges from the codebase within days.

## Solution Overview

Three components working together:

| Component | Responsibility | Location |
|-----------|---------------|----------|
| **Paperclip Plugin extension** | Trigger detection, agent routing (Lead or Dev by timing/scope), metadata tracking | `app/paperclip-plugin/src/` (existing, extended) |
| **File-based diagram store** | .excalidraw JSON + rendered SVG + meta.json per diagram | `memory/diagrams/` |
| **Diagram Dashboard app** | Interactive viewer, gallery, comparison, filtering | `app/diagram-dashboard/` (new package) |

---

## 1. Workflow (End-to-End)

```
Step 1: CTO-Router Triage
  CTO-Router analyzes an issue and determines visualization is needed.
  Calls the `request_diagram` tool with type, audience, timing, and description.
  Plugin posts an issue comment: "Diagram requested: {type} for {audience}"

Step 2: Plugin Orchestration — Agent Routing
  Plugin saves request to diagram-queue (ctx.state, instance scope).
  Resolves target project workspace via Paperclip API.
  Routes to the correct agent based on timing and scope:

    timing: "pre-implementation"
      -> Always Lead (architecture planning, cross-domain analysis)

    timing: "post-implementation" + single-domain
      -> Dev who implemented it (most accurate reflection of actual code)

    timing: "post-implementation" + cross-domain
      -> Lead (Dev cannot explore outside assigned scope)

  Invokes selected agent with excalidraw-diagram skill prompt.
  Updates queue status: queued -> generating.

Step 3: Agent Execution (Lead or Dev depending on routing)
  Navigates to target codebase (cd targetPath).
  Analyzes relevant code paths for the requested diagram type.
  Generates .excalidraw JSON using the excalidraw-diagram skill.
  Renders SVG via render_excalidraw.py (Playwright headless).
  Writes meta.json with full traceability metadata.
  Appends entry to memory/diagrams/index.json.
  Posts issue comment with dashboard link.
  Plugin updates queue status: generating -> completed.

Step 4: Consumption
  Dev/QA: Follow issue comment link to view diagram in dashboard.
  PO: Browse dashboard with audience filter set to "po".
  CTO: Review project-wide diagram timeline for architectural evolution.

Step 5: Version Update (on subsequent changes)
  CTO-Router flags the same domain again via request_diagram.
  Appropriate agent generates new version (version: 2, previousVersionId linked).
  Dashboard renders version timeline automatically.
```

### 1.1 Agent Routing Rules

| Timing | Scope | Assigned To | Rationale |
|--------|-------|-------------|-----------|
| pre-implementation | any | Lead | Architecture planning before code exists; Lead owns design decisions |
| post-implementation | single-domain | Dev (assignee of the issue) | Dev wrote the code and knows exact implementation details |
| post-implementation | cross-domain | Lead | Dev role constraint: "cannot explore files not assigned by Lead" |

**How the plugin determines scope:**
- If `targetDomain` is a single value -> single-domain
- If `targetDomain` contains multiple domains or is omitted -> cross-domain
- The plugin checks the issue's `assigneeAgentId` to find the Dev who implemented it

**How the plugin determines timing:**
- `timing` parameter is explicitly set by CTO-Router
- If omitted, defaults to `"post-implementation"` (most common case: documenting what was built)

---

## 2. Data Model

### 2.1 File System Layout

```
memory/diagrams/                              # gitignored (like profiles)
  index.json                                  # lightweight index for fast dashboard loading
  {project-slug}/                             # from team YAML team.slug
    {date}_{issue-identifier}/                # e.g. 2026-04-12_ENG-142
      {diagram-name}.excalidraw              # source Excalidraw JSON
      {diagram-name}.svg                     # rendered SVG for preview
      meta.json                              # full metadata
```

### 2.2 meta.json Schema

```typescript
interface DiagramMeta {
  // Identity
  id: string;                          // nanoid (8 chars)
  projectSlug: string;                 // team YAML team.slug
  projectName: string;                 // "TTree Maintenance"

  // Paperclip linkage
  issueId: string;                     // Paperclip issue UUID
  issueIdentifier: string;            // "ENG-142"

  // Diagram classification
  diagramType: "sequence" | "domain-map" | "state-transition" | "data-flow";
  audience: ("cto" | "lead" | "dev" | "qa" | "po")[];
  title: string;                       // human-readable diagram title
  description: string;                 // what this diagram visualizes

  // Traceability
  timing: "pre-implementation" | "post-implementation";
  createdBy: string;                   // agent name (e.g. "Work-Lead" or "Developer 1")
  createdByRole: "lead" | "dev";       // role of the creating agent
  createdAt: string;                   // ISO8601
  triggeredBy: string;                 // "CTO-Router"

  // Codebase context
  targetPath: string;                  // absolute path to project workspace
  commitRange?: {
    from: string;                      // commit SHA (optional)
    to: string;
  };
  affectedPaths: string[];            // domain paths analyzed

  // File references (relative to this directory)
  files: {
    excalidraw: string;               // "architecture.excalidraw"
    svg: string;                      // "architecture.svg"


---
*Mirrored from kiki vault (`memory/vault/`) — canonical source for kiki scaffold knowledge. Keep mango-wiki copy as a reference; updates flow kiki → mango-wiki via session sync.*
