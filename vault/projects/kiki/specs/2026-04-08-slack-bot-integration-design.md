---
title: "spec — 2026-04-08-slack-bot-integration-design"
type: spec
created: 2026-04-29
updated: 2026-04-29
tags: [specs]
sources:
  - docs/superpowers/specs/2026-04-08-slack-bot-integration-design.md
---

# Slack Bot Integration Design

> Full document: `docs/superpowers/specs/2026-04-08-slack-bot-integration-design.md`

## Summary (first 150 lines)


> @Kiki mention in Slack triggers intent classification, Paperclip API call, and Slack response.

## Problem

Users must use Claude Code CLI to interact with the Paperclip engineering team (create issues, check status, wake agents). There is no way to do this from Slack where the team already communicates.

## Solution

Add a Socket Mode event listener to the existing `slack-collector` package. Same Slack App, same bot token, new entrypoint. When a user mentions `@Kiki` in Slack, the bot classifies intent, calls the Paperclip API, and posts a formatted response.

## Architecture

```
Slack (@Kiki mention)
  |
  v
Socket Mode listener (start:bot entrypoint)
  |
  v
Intent Classifier
  |-- "create issue"  --> POST /companies/{id}/issues
  |-- "status"        --> GET /companies/{id}/issues + /agents
  |-- "ENG-XX?"       --> GET /issues/{id}/comments
  |-- "wake {agent}"  --> POST /agents/{id}/wakeup
  |-- unknown         --> help message
  |
  v
Paperclip Client (shared HTTP calls)
  |
  v
Slack Response Formatter (Block Kit mrkdwn)
  |
  v
Slack channel (threaded reply)
```

## Package Changes

### Modified: `app/mcp/slack-collector/`

No new package. The existing `slack-collector` gains a second entrypoint.

**package.json additions:**
```json
{
  "dependencies": {
    "@slack/socket-mode": "^2.0.0"
  },
  "scripts": {
    "start:mcp": "node dist/src/index.js",
    "start:bot": "node dist/src/bot.js"
  }
}
```

**New files:**
```
src/
  bot.ts              # Socket Mode entrypoint (daemon)
  intent-classifier.ts # Parse @Kiki message -> action + params
  paperclip-client.ts  # Paperclip API wrapper (reusable)
  slack-responder.ts   # Format results as Slack Block Kit
  index.ts             # Existing MCP entrypoint (unchanged)
```

### Process Isolation

`start:mcp` and `start:bot` are **independent Node.js processes**, never run in the same process. The MCP entrypoint captures `process.stdin/stdout` (stdio transport); the bot entrypoint uses WebSocket (Socket Mode). The `"main"` field in package.json should be removed to prevent accidental MCP server startup during testing.

### Environment Variables

```
SLACK_BOT_TOKEN=xoxb-...     # Existing (shared)
SLACK_APP_TOKEN=xapp-...     # New: required for Socket Mode
PAPERCLIP_API_URL=http://localhost:3100/api
PAPERCLIP_COMPANY_ID=<company-uuid>    # Source of truth: paperclip-control SKILL.md
PAPERCLIP_PROJECT_ID=<project-uuid>    # Source of truth: paperclip-control SKILL.md
```

## Component Details

### 1. bot.ts (Socket Mode Entrypoint)

Responsibilities:
- Initialize Socket Mode client with `SLACK_APP_TOKEN`
- Listen for `app_mention` events
- Extract message text (strip `@Kiki` prefix)
- Pass to intent classifier
- Post response as threaded reply

Safety guards:
- **Self-mention filter**: Check `event.bot_id` and ignore events from the bot itself to prevent loops
- **Event deduplication**: Track processed `event_ts` values in a `Set<string>` with 5-minute TTL cleanup to prevent duplicate processing on Socket Mode re-delivery
- **Retry header check**: Respect Slack's `retry_num` / `retry_reason` headers and skip redelivered events

Error handling:
- Socket disconnect: auto-reconnect (built into @slack/socket-mode)
- Paperclip API down: reply "Paperclip API is not reachable. Retrying..." with 3 retries, 2s backoff
- Slack rate limit: respect `chat.postMessage` rate limits (1/sec/channel), queue responses if needed
- Unknown intent: reply with help message listing available commands

### 2. intent-classifier.ts

Pattern-based classification (no LLM needed for v1):

| Pattern | Intent | Params |
|---------|--------|--------|
| `create\|make\|add.*issue\|task\|ticket` | `create_issue` | title, description, domain |
| `status\|dashboard\|overview\|progress` | `status` | optional: domain filter |
| `ENG-\d+` | `issue_detail` | identifier |
| `wake\|start\|run\|trigger` + agent name | `wake_agent` | agent name |
| `help\|commands\|what can you do` | `help` | none |

#### Domain Detection

Reuses the keyword mapping from paperclip-control SKILL.md:
- clock-in/out, gate log, attendance, business trip -> **Work**
- vacation, leave, annual, compensation -> **Vcatn**
- schedule, staggered hours, flex, core time -> **Schdul**
- shift, rotation, group pattern -> **Shift**
- approval, reject, sanction, delegation -> **Sanctn**
- settings, config, holiday, department, role -> **Admin**
- deploy, docker, gradle, CI/CD -> **Infra**
- HR, flexteam, duozone, sync -> **HR**

If domain cannot be detected from the message, reply asking the user to specify.

#### Agent Name Resolution

The bot loads the full agent registry via `GET /companies/{id}/agents` at startup and caches it. Resolution rules (from SKILL.md):
- "work lead", "Work", "work team lead" -> Work-Lead
- "vcatn qa", "vacation QA" -> Vcatn-QA
- "infra", "ops", "devops" -> Infra-Ops
- "hr", "syncer" -> HR-Integrator
- "CTO", "router", "triage" -> CTO-Router
- `{Domain}` alone (no role) -> `{Domain}-Lead` (default)

The registry contains agents across 8 domains (Work, Vcatn, Schdul, Shift, Sanctn, Admin) with Lead/PM/Dev/QA per domain, plus CTO, PO, Planner, Designer, Infra-Ops, HR-Integrator.

#### `create_issue` Field Extraction

Since v1 uses pattern matching without LLM:
1. **Title**: entire message text after intent keyword, truncated to 100 chars
2. **Domain**: extracted via keyword map above. If ambiguous, ask user.
3. **Priority**: defaults to "medium". Override if urgency keywords present:
   - urgent, critical, down, broken, data loss -> "urgent"
   - important, security, compliance -> "high"
   - minor, cosmetic, nice-to-have -> "low"


---
*Mirrored from kiki vault (`memory/vault/`) — canonical source for kiki scaffold knowledge. Keep mango-wiki copy as a reference; updates flow kiki → mango-wiki via session sync.*
