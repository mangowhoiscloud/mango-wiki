---
title: Kiki Slack Integration — Intent Commands + Pipeline Notifier
type: concept
tags: [kiki, slack, intent, notifier, websocket]
created: 2026-04-11T00:00:00Z
updated: 2026-04-11T00:00:00Z
---

# Kiki Slack Integration

Native WebSocket (Socket Mode) + Intent Classifier + Pipeline Notifier.

## 9 Intent Commands

| Command | Intent | Routing |
|---------|--------|---------|
| `@Kiki status` | status | Direct response |
| `@Kiki pipeline` | pipeline | Direct response |
| `@Kiki ENG-38` | issue_detail | Direct response |
| `@Kiki profile [name]` | profile | Direct response |
| `@Kiki observe` | observe | Direct response |
| `@Kiki refresh` | refresh | Direct response |
| `@Kiki create issue [desc]` | create_issue | Agent invoke |
| `@Kiki wake [agent]` | wake_agent | Direct response |
| `@Kiki help` | help | Direct response |

## Intent Classification

Pattern-based regex matching with priority ordering:
1. `ENG-\d+` → issue_detail (highest)
2. help → before creation
3. create → before generic
4. wake → before observe
5. status → catch-all

## Pipeline Notifier (fire-and-forget)

| Event | Format |
|-------|--------|
| issue.created | `[NEW] ENG-123: title \| priority \| assignee` |
| issue.assigned | `[ASSIGN] ENG-123 -> agent_name` |
| status_changed | `[STATUS] ENG-123: in_progress -> done` |
| scorecard | `[SCORE] ENG-123: 85/100 \| pass` |
| agent.run.failed | `[FAIL] agent_name: error_reason` |

## Agent Response Router

```
Slack mention → classifyIntent()
  → direct intent → compute + reply immediately
  → agent_invoke → invokeAgent() → registerPending(runId, 60s timeout)
    → agent completes → lookup pendingRequests → reply in thread
```

## Related

- [[kiki]]
- [[kiki-scorecard-guards]]
