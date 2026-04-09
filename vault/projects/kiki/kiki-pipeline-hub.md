---
title: Kiki Pipeline Hub
type: concept
category: hub
tags: [hub, pipeline, observe, profile, directive, obsidian]
sources:
  - raw/kiki-docs/progress.md
related:
  - "[[kiki]]"
  - "[[paperclip-integration]]"
  - "[[kiki-team-hub]]"
  - "[[kiki-domain-hub]]"
created: 2026-04-07
updated: 2026-04-07
---

# Kiki Pipeline Hub

Slack → Profile → Directive → Obsidian 파이프라인 중앙 인덱스.

## Full Pipeline

```
Slack Channels                    Paperclip
#engineering                      ┌─────────────┐
#dev-squad-1    →  /kiki-observe  │ Plugin State │
#dev-squad-2       │              │  profiles    │
#product-specs     │              │  template    │
                   ▼              │  directives  │
              memory/signals/     └──────┬──────┘
                   │                     │
                   ▼                     ▼
              memory/profiles/    Skills API
                   │              (Company Skills)
                   ▼                     │
              memory/teams/              ▼
                   │              Agent systemPrompt
                   ▼              (instructions_hint)
              /kiki-export
                   │
                   ▼
              Obsidian vault
              raw/kiki-*
                   │
                   ▼
              wiki-ingest (LLM)
                   │
                   ▼
              concepts/ + entities/
              (Graph View)
```

## Skills (5)

| Skill | Input | Output | Trigger |
|-------|-------|--------|---------|
| `/kiki-observe` | Slack channels | `memory/signals/*.json` | Manual or scheduled |
| `/kiki-refresh` | signals + profiles | Updated `memory/profiles/*.json` | After observe |
| `/kiki-advise` | profiles + task context | Paperclip directives (YAML) | On demand |
| `/kiki-export` | `memory/*` | Obsidian `raw/kiki-*` | After refresh |
| `/kiki-setup` | `docs/templates/*.yaml` | Paperclip agents + skills | Bootstrap |

## Plugin Actions

| Action | Purpose |
|--------|---------|
| `load-team-template` | YAML → plugin state |
| `provision-team` | Delete old + create agents from template |
| `manual-refresh` | Trigger profile refresh cycle |
| `manual-sync-skills` | Profile → Skills API sync |
| `sync-relationship-graph` | Interaction graph → Company Skill |

## Plugin Tools (agent-callable)

| Tool | Purpose |
|------|---------|
| `kiki-get-profile` | Query user work style |
| `kiki-update-profile` | Update profile with signals |
| `kiki-get-feedback` | Query agent feedback history |
| `kiki-team-graph` | Team interaction patterns |
| `kiki-get-team-structure` | Query hierarchy + routing |
| `kiki-get-agent-role` | Query own role + budget |

## Data Flow Layers

| Layer | Location | Format | Owner |
|-------|----------|--------|-------|
| Raw signals | `memory/signals/` | JSON | kiki-observe |
| Profiles | `memory/profiles/` | JSON | kiki-refresh |
| Team aggregates | `memory/teams/` | Markdown | kiki-refresh |
| Plugin state | Paperclip state API | JSON | Plugin |
| Company Skills | Paperclip Skills API | Markdown | skill-sync |
| Obsidian raw | `vault/raw/kiki-*` | Markdown | kiki-export |
| Obsidian wiki | `vault/projects/kiki/` | Markdown | wiki-ingest |

## Related

- [[paperclip-integration]] — Architecture details
- [[kiki-team-hub]] — Agent team
- [[kiki-domain-hub]] — Domain knowledge
- [[kiki-project-progress]] — Milestones
