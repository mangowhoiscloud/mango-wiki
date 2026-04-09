# Kiki — Progress Board

> Last updated: 2026-04-07 (engineering team restructure)

## Backlog

- [ ] Confidence decay + auto-archive logic (temporal-profile decay function)
- [ ] Additional team scenarios (HR/Sales/Marketing)

## Done

### Infrastructure & Setup (PRs #1–#8, #12–#17)
- [x] Initial scaffold (harness + code repo structure)
- [x] Slack MCP server — 6 tools (read_channels, read_thread, read_reactions, user_activity, observe_channel, send_observation_report)
- [x] Paperclip Plugin — manifest.ts, worker.ts, definePlugin with events/jobs/tools/actions
- [x] Plugin ctx.http refactor (auto-injected Paperclip API keys)
- [x] Team setup template + kiki-setup skill (4-phase bootstrap)
- [x] Pre-flight auto-install (git, Node, pnpm, curl, Docker)
- [x] Auto-start Paperclip server when DOWN
- [x] Slack channel auto-create + bot join
- [x] Chrome browser automation for token provisioning
- [x] Zombie agent detection + cleanup
- [x] All system prompts converted to English + enforcement hook

### Profile Pipeline (PRs #2–#5)
- [x] Profile → directive conversion engine (profileToDirectives)
- [x] Profile → Company Skill auto-sync pipeline (skill-sync.ts)
- [x] Relationship graph → Company Skill content (graph-to-skill.ts)
- [x] Feedback loop (issue.comment.created → profile correction)
- [x] Temporal profiles (5 context modes: normal/close_period/crisis/audit/planning)
- [x] LLM-based signal extraction (prompt builder + profile diff + contradiction detection)

### Finance Team (scenario validation)
- [x] 3 profiles: CFO (J.Park), Analyst (S.Kim), Accountant (H.Lee)
- [x] Team aggregate: team_finance.md
- [x] Company Skills: kiki-finance-profile + kiki-team-profile
- [x] Agent execution verified (PIN-6, PIN-7, PIN-11)
- [x] Cross-agent references working (CFO ↔ Analyst ↔ Accountant)

### Engineering Team Template (PR #10, restructured #37+)
- [x] Hub-spoke architecture (CTO router + Lead per product + shared specialists)
- [x] Budget tiers (S/M/L/XL) + token estimation (~55% savings vs flat)
- [x] Scaling guide (base 4 + 3 per product)
- [x] v2 restructure: Lead = scope+review only (no self-implementation)
- [x] App Specialist removed → Frontend/Backend Engineers under Lead
- [x] Role enum aligned to Paperclip (cto/pm/engineer/devops/qa)
- [x] Pinxlab legacy org purged (22 agents deleted, CEO + Kiki preserved)
- [x] v3 restructure: legacy attendance system (근태관리) domain-driven
- [x] PO branch added (PO → Planner + Designer) — spec pipeline upstream
- [x] Dual dev squads (Lead1/Lead2) with per-squad QA — FIFO assignment
- [x] 18 modules → 4 domain skills (attendance, organization, reporting, communication)
- [x] Release Engineer removed — deployment handled externally
- [x] Plugin team-bootstrap.ts routing logic generalized (no hardcoded role names)

### Template → Plugin Integration
- [x] Template loader (YAML parser + validator + hierarchy resolver)
- [x] Team bootstrap (profile_seed → UserProfile, template → directive markdown)
- [x] load-team-template action (YAML → plugin state)
- [x] agent.created enhanced (template-aware role directive injection)
- [x] kiki-get-team-structure tool (agents query hierarchy + routing map)
- [x] kiki-get-agent-role tool (agents query own role + budget + instructions)
- [x] refresh-profiles job (regenerate team directive each cycle)
- [x] Obsidian export integration (directives → memory/teams/ → kiki-export pickup)
- [x] Skill docs synced (kiki-setup Phase 3-6.5, kiki-advise tools section)

### LLM Wiki Gaps (PRs #26–#28)
- [x] Delta tracking — observe_channel `oldest` param + .last_observed.json
- [x] Observation log — memory/log.md with [observe]/[refresh]/[advise] entries
- [x] Obsidian vault export — /kiki-export skill (profiles → md + frontmatter + wikilinks)
- [x] Health check — 5 diagnostics in kiki-refresh (stale, low-confidence, orphan, contradictions, missing links)

---

## Skills (6)

| Skill | Purpose |
|-------|---------|
| /kiki-setup | Full Paperclip bootstrap + team creation from template |
| /kiki-observe | Slack → behavioral signal extraction (with delta tracking) |
| /kiki-refresh | Profile update + health check |
| /kiki-advise | Profile → Paperclip agent directives |
| /kiki-export | Memory → Obsidian vault (frontmatter + wikilinks) |

---

## Decision Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-04-01 | External scaffold (badboss pattern) | Physical separation of profiles (sensitive) and code (public) |
| 2026-04-01 | Claude Code as Profiler | Zero infra, existing memory system, incremental expansion |
| 2026-04-01 | TypeScript (Paperclip stack) | Plugin SDK native compat, code sharing |
| 2026-04-01 | File-based profiles instead of PG | MVP speed, PG migration later |
| 2026-04-01 | Hybrid injection: Company Skills + Instructions | Skills API for team, Instructions for per-agent tuning |
| 2026-04-01 | Plugin SDK via symlink + skipLibCheck | External development outside Paperclip monorepo |
| 2026-04-01 | skills/sync API for skill linking | PATCH desiredSkills ignored, POST skills/sync is correct |
| 2026-04-03 | English-only system prompts | Consistency, portability, pre-commit hook enforcement |
| 2026-04-07 | Karpathy LLM Wiki pattern adoption | Delta tracking, observation log, Obsidian export, health check |
| 2026-04-07 | Template → plugin runtime integration | Plugin needs self-healing directive injection, not just setup-time bootstrap |
| 2026-04-07 | memory/ filesystem sync for Obsidian | Simpler than Paperclip API → vault; kiki-export already copies memory/teams/*.md |
| 2026-04-07 | Engineering team v2 (Lead ≠ implementor) | Leads were implementing S/M tasks themselves, blurring scope/review boundary; strict separation improves review quality |
| 2026-04-07 | CEO preserved as org root | Keep stable org root for Kiki Profiler reporting; CTO reports to CEO |

---

## Architecture Notes

### Paperclip Integration

| Company Skill | Linked Agents | ID |
|--------------|---------------|-----|
| kiki-team-profile | All (9) | `34d99c90-ca25-4d86-b56a-f35f8fa8d343` |
| kiki-finance-profile | Finance (3) | `173a2f4e-3592-40ec-918b-962f41e8e201` |

### Plugin Features

| Feature | Type | Description |
|---------|------|-------------|
| agent.created handler | event | Auto-inject profile directives on new agent |
| refresh-profiles | job | Periodic profile refresh via Slack MCP |
| kiki-get-profile | tool | Agent queries user profile |
| kiki-update-profile | tool | Agent updates user profile |
| profiles | data | UI profile listing |
| manual-refresh | action | Manual profile refresh trigger |
| sync-relationship-graph | action | Graph → Company Skill sync |
| manual-sync-skills | action | Manual profile → skill sync |
| load-team-template | action | Parse YAML template into runtime state |
| kiki-get-team-structure | tool | Agent queries team hierarchy + routing |
| kiki-get-agent-role | tool | Agent queries own role + budget + instructions |
| agent.created (template) | event | Auto-inject role directive from template |
| refresh-profiles (template) | job | Regenerate team directive + write to memory/ |

### Data Flow

```
Slack API (observe_channel with delta)
    ↓ behavioral signals only
memory/signals/*.json → .last_observed.json
    ↓ extract + merge
memory/profiles/user_*.json (confidence scoring)
    ↓ aggregate
memory/teams/team_*.md
    ↓ profileToDirectives
Paperclip Skills API (Company Skills + Instructions)
    ↓ inject
Paperclip Agents (behavior-optimized)

Template branch:
  docs/templates/*.yaml
      ↓ load-team-template action
  Plugin state (team-template, team-directive, seeded-profiles)
      ↓ agent.created / refresh-profiles
  memory/teams/team_*_structure.md + role_*.md
      ↓ kiki-export
  Obsidian vault raw/kiki-teams/

Side effects:
  → memory/log.md (activity log)
  → memory/vault/ (Obsidian export via /kiki-export)
```
