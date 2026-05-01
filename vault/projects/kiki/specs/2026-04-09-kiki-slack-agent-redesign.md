---
title: "spec — 2026-04-09-kiki-slack-agent-redesign"
type: spec
created: 2026-04-29
updated: 2026-04-29
tags: [specs]
sources:
  - docs/superpowers/specs/2026-04-09-kiki-slack-agent-redesign.md
---

# Kiki Slack Agent Redesign

> Full document: `docs/superpowers/specs/2026-04-09-kiki-slack-agent-redesign.md`

## Summary (first 150 lines)


> Kiki becomes a Paperclip agent in the team workspace. Plugin handles simple queries directly (0 tokens), complex requests invoke the Kiki agent on-demand. Slack work-style signals are collected and propagated to all Paperclip agents.

## Problem

Current Kiki Slack bot is a standalone Socket Mode daemon in a separate workspace. It should be a Paperclip agent embedded in the team's existing Slack workspace, triggered by @Kiki mentions, with automatic work-style signal collection.

## Architecture

```
Team Slack Workspace (e.g. ttree_v1)
  |
  | @Kiki mention / channel activity
  v
Paperclip Plugin (paperclip-plugin)
  |
  |-- slack-handler.ts (Socket Mode listener)
  |     |
  |     |-- Simple query (status, ENG-XX, help, wake)
  |     |     -> Plugin handles directly via Paperclip API
  |     |     -> Responds in Slack thread
  |     |     -> Token cost: 0
  |     |
  |     |-- Complex request (create issue, analysis, advice)
  |           -> ctx.agents.invoke(kikiAgentId, prompt)
  |           -> Kiki agent wakes, processes, posts result
  |           -> Token cost: on-demand only
  |
  |-- signal-collector.ts (periodic observation)
        |
        |-- Reads team Slack channels (configurable)
        |-- Extracts behavioral signals (reuse extract-signals.ts)
        |-- Updates user profiles in plugin state
        |-- Propagates directives to all agents via Skills API
        |-- Schedule: every 6 hours (routine) or on-demand
```

## Components

### 1. Kiki Paperclip Agent

Added to engineering-team.yaml template:

```yaml
- name: Kiki
  role: general
  reports_to: null  # Independent — not in CTO hierarchy
  description: "Slack-based work-style profiler and team communication bridge"
  routing:
    model: claude-opus-4-6
  wake:
    trigger: issue.assigned
    routine: null  # No heartbeat — on-demand only
  budget_tier: S
  skills:
    - kiki-team-profile
  instructions_hint: |
    You are Kiki, the team's work-style profiler and Slack communication bridge.
    You are invoked when a team member asks a complex question via @Kiki in Slack.

    Your capabilities:
    1. Analyze team work patterns from behavioral signals
    2. Generate personalized agent directives based on user profiles
    3. Answer complex questions about team dynamics, agent performance
    4. Create issues with domain analysis and priority recommendation

    Your response will be posted directly to Slack. Use concise formatting.
    Do NOT use markdown headers — use Slack mrkdwn (*bold*, `code`, _italic_).
```

### 2. slack-handler.ts (Plugin Integration)

Replaces standalone bot.ts. Lives in `paperclip-plugin/src/slack-handler.ts`.

Responsibilities:
- Initialize Socket Mode client in plugin setup()
- Listen for `app_mention` events
- Classify intent (reuse intent-classifier)
- Simple queries: respond directly via Slack API
- Complex queries: invoke Kiki agent, post result to Slack
- Safety guards: self-mention filter, event dedup

Intent routing:

| Intent | Handler | Token Cost |
|--------|---------|------------|
| status | Plugin direct (API query) | 0 |
| issue_detail (ENG-XX) | Plugin direct (API query) | 0 |
| help | Plugin direct (static text) | 0 |
| wake_agent | Plugin direct (API call) | 0 |
| create_issue | Kiki agent invoke (domain analysis) | On-demand |
| unknown (natural language) | Kiki agent invoke (interpretation) | On-demand |

### 3. signal-collector.ts (Work-Style Observation)

Replaces the MCP-based observation flow with plugin-integrated collection.

Flow:
1. Plugin reads configured Slack channels via Slack Web API
2. Extracts behavioral signals (reuse extractSignalsFromHistory from slack-collector)
3. Updates user profiles in plugin state (ctx.state.set)
4. Generates directives for each agent (profileToDirectives)
5. Injects directives via Skills API (ctx.agents.updateSkill or AGENTS.md write)

Trigger options:
- Manual: @Kiki observe / @Kiki refresh
- Automatic: plugin routine (every 6 hours, configurable via template)

### 4. Shared Modules (slack-collector -> shared)

Move reusable modules from slack-collector to a shared location:

```
app/mcp/slack-collector/src/
  intent-classifier.ts    -> KEEP (imported by paperclip-plugin)
  paperclip-client.ts     -> KEEP (imported by paperclip-plugin)
  slack-responder.ts      -> KEEP (imported by paperclip-plugin)
  types.ts                -> KEEP (imported by paperclip-plugin)
  bot.ts                  -> DELETE (replaced by slack-handler in plugin)
  index.ts                -> KEEP (MCP server unchanged)
```

paperclip-plugin imports from slack-collector via workspace reference:
```typescript
import { classifyIntent } from "@kiki/slack-collector/intent-classifier";
```

Or simpler: copy the 4 files into paperclip-plugin/src/slack/ directory to avoid cross-package import complexity.

### 5. Environment Variables

```
SLACK_BOT_TOKEN=xoxb-...     # Team workspace bot token
SLACK_APP_TOKEN=xapp-...     # Team workspace app-level token
```

These are the team's Slack workspace tokens, set during kiki-setup Phase 2.

### 6. kiki-setup Integration

Phase 2 (Slack Connection) updates:
- Connect to team's Slack workspace (not a separate kiki workspace)
- Enable Socket Mode on the team's Slack App
- Generate App-Level Token
- Save both tokens to .env

Phase 3 (Team Bootstrap) updates:
- Include Kiki agent in team template
- Kiki agent provisioned alongside CTO, PO, Lead, etc.


---
*Mirrored from kiki vault (`memory/vault/`) — canonical source for kiki scaffold knowledge. Keep mango-wiki copy as a reference; updates flow kiki → mango-wiki via session sync.*
