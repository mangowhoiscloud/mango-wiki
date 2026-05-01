---
title: "spec — 2026-04-12-dynamic-squad-resolution-design"
type: spec
created: 2026-04-29
updated: 2026-04-29
tags: [specs]
sources:
  - docs/superpowers/specs/2026-04-12-dynamic-squad-resolution-design.md
---

# Dynamic Squad Resolution — Design Spec

> Full document: `docs/superpowers/specs/2026-04-12-dynamic-squad-resolution-design.md`

## Summary (first 150 lines)


> Eliminate hardcoded agent UUIDs from the dashboard by encoding squad metadata
> in the Paperclip agent `description` field at provisioning time,
> then parsing it dynamically at dashboard render time.

## Problem

The dashboard (`agent-activity-dashboard.html`) contains:

1. **`SQUADS` object** — maps 4 hardcoded UUIDs + `__kiki_operator__` to squad names and colors
2. **`getSquadForAgent()`** — uses hardcoded UUID comparisons for routing logic

When the team is re-provisioned (new UUIDs), or a different team template is used, the dashboard breaks.

## Solution

### Layer 1: Team Template YAML

Add `squad` field to each agent definition:

```yaml
agents:
  - name: CTO
    role: cto
    squad: { name: "경영진", color: "#8b5cf6" }
    reports_to: null

  - name: Lead 1
    role: lead
    squad: { name: "개발팀 1", color: "#3b82f6" }
    reports_to: CTO

  - name: Developer 1
    role: engineer
    reports_to: Lead 1
    # No squad field — inherits from parent (Lead 1)
```

**Inheritance rule**: If an agent has no `squad` field, it inherits from its `reports_to` parent. This keeps the YAML DRY — only squad leaders need the field.

### Layer 2: Plugin agentSpecs Builder

In `index.ts` `agentSpecs` construction (~line 2935), encode squad into the description:

```
description: "Dev Squad 1 Lead — task scoping [squad:개발팀 1:#3b82f6]"
```

Format: `[squad:<name>:<color>]` appended to the original description.

Resolution order during provisioning:
1. Agent's own `squad` field
2. Walk `reports_to` chain to find nearest parent with `squad`
3. Fallback: `{ name: "General", color: "#94a3b8" }`

### Layer 3: Dashboard Dynamic Parsing

Replace the static `SQUADS` object and `getSquadForAgent()` with:

```javascript
function buildSquadsFromAgents(agents) {
  var squads = {};
  agents.forEach(function(a) {
    var parsed = parseSquadTag(a.description);
    if (parsed) {
      squads[a.id] = parsed; // { name, color }
    }
  });
  // KiKi operator — always present via isKikiOperator() pattern
  var kikiAgent = agents.find(function(a) { return isKikiOperator(a); });
  if (kikiAgent) {
    squads[kikiAgent.id] = { name: '운영진', color: '#e879f9' };
  }
  return squads;
}

function parseSquadTag(desc) {
  if (!desc) return null;
  var match = desc.match(/\[squad:([^:]+):([^\]]+)\]/);
  if (!match) return null;
  return { name: match[1], color: match[2] };
}

function getSquadForAgent(agentId, agents, squadMap) {
  var agent = agents.find(function(a) { return a.id === agentId; });
  if (!agent) return null;
  if (isKikiOperator(agent)) return squadMap[agent.id] || { name: '운영진', color: '#e879f9' };
  // Direct squad tag
  if (squadMap[agentId]) return squadMap[agentId];
  // Walk reportsTo chain
  var visited = {};
  var current = agent;
  while (current && current.reportsTo && !visited[current.reportsTo]) {
    visited[current.reportsTo] = true;
    if (squadMap[current.reportsTo]) return squadMap[current.reportsTo];
    current = agents.find(function(a) { return a.id === current.reportsTo; });
  }
  return { name: 'General', color: '#94a3b8' };
}
```

### Layer 4: TypeScript Template Types

Add `squad` to `AgentTemplate`:

```typescript
export interface AgentTemplate {
  // ... existing fields
  squad?: { name: string; color: string };
}
```

## Changes Required

| File | Change |
|------|--------|
| `docs/templates/engineering-team.yaml` | Add `squad` field to CTO, PO, Lead 1, Lead 2 agents |
| `app/paperclip-plugin/src/template-types.ts` | Add `squad?` to `AgentTemplate` |
| `app/paperclip-plugin/src/index.ts` (~2935) | Encode resolved squad tag into `description` |
| `app/dashboard/agent-activity-dashboard.html` | Replace `SQUADS` + `getSquadForAgent` with dynamic parsing |

## Removed Code

- `var SQUADS = { ... }` — 5 hardcoded UUID entries
- `getSquadForAgent()` — 11 lines of UUID-based routing
- All references to specific UUIDs (`6fdf1734...`, `eea15f24...`, etc.)

## Fallback Behavior

| Scenario | Result |
|----------|--------|
| Agent has `[squad:...]` in description | Parsed directly |
| Agent has no tag but `reportsTo` has one | Inherits parent squad |
| No tag in entire chain | `{ name: "General", color: "#94a3b8" }` |
| KiKi operator (name pattern match) | `{ name: "운영진", color: "#e879f9" }` |
| Legacy agents (pre-migration) | Fallback to General until re-provisioned |

## Migration

Existing agents already deployed in Paperclip will not have the `[squad:...]` tag until:
1. `update-routing` action is run (patches description), OR
2. Team is re-provisioned via `provision-team`

During the transition, the dashboard falls back to "General" for untagged agents. This is acceptable — better than wrong UUID-based assignment.



---
*Mirrored from kiki vault (`memory/vault/`) — canonical source for kiki scaffold knowledge. Keep mango-wiki copy as a reference; updates flow kiki → mango-wiki via session sync.*
