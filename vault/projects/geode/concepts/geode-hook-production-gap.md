---
title: Hook System Production GAP Analysis
tags: [hooks, production, gap-analysis, architecture]
sources: [claude-code hook system analysis, geode hook system analysis]
created: 2026-04-09
updated: 2026-04-09
---

# Hook System Production GAP Analysis

Comparative analysis of GEODE's current hook system against production requirements derived from [[hook-claude-code-comparison]] and frontier harness patterns.

## Current State

GEODE's [[geode-architecture|HookSystem]] provides 49 events across 13 categories, using a priority-based synchronous observer pattern with error isolation.

| Dimension | Current |
|-----------|---------|
| Events | 49 (`HookEvent` enum in `core/hooks/system.py`) |
| Pattern | Observer (pub/sub, fire-and-forget) |
| Execution | Synchronous, priority-sorted (lower = first) |
| Timeout | None (handlers can block indefinitely) |
| Error handling | Per-handler try/except, log + continue |
| Thread safety | `threading.Lock` around registration and snapshot |
| Async support | None (sync-only `trigger()` / `trigger_with_result()`) |
| Plugin extension | YAML + class-based discovery |
| Interceptor capability | None (cannot modify, block, or redirect data flow) |

Categories: Pipeline (3), Node (4), Analysis (3), Verification (2), Automation (6), Memory (4), Prompt (1), SubAgent (3), Tool Recovery (3), Context (3), Session (2), LLM Call (4), Tool Approval (3), Infrastructure (8).

See [[28-hook-system-event-driven-orchestration]] for the original 27-event design and rationale.

## Production GAP Inventory

### P0 -- Critical (blocks production safety)

| # | GAP | Current | Target | Rationale |
|---|-----|---------|--------|-----------|
| 1 | **USER_INPUT_RECEIVED** event | Missing | Fire before LLM call on every user input | Claude Code fires `UserPromptSubmit` -- enables input validation, rate limiting, content filtering before the LLM sees the message. Without this, GEODE has no pre-LLM interception point for user input. |
| 2 | **TOOL_EXEC_START/END/FAILED** events | Missing (only TOOL_RECOVERY_*) | Fire on every tool execution lifecycle | Claude Code fires `PreToolUse` / `PostToolUse` / `PostToolUseFailure` on every tool call. GEODE only fires events on recovery attempts, leaving normal tool execution invisible to hooks. This is the single largest observability gap. |
| 3 | **COST_WARNING / COST_LIMIT_EXCEEDED** events | Missing | Fire when session cost crosses configurable thresholds | No hook-based cost control. The token guard exists at the context level ([[geode-context-guard]]) but there is no event for session-level monetary cost tracking. Critical for overnight batch and Slack gateway sessions. |
| 4 | **EXECUTION_CANCELLED** event | Missing | Fire when user or system cancels mid-execution | Claude Code has `Stop` / `StopFailure` events. GEODE has `SHUTDOWN_STARTED` for serve lifecycle but nothing for in-flight request cancellation, leaving cleanup logic unhooked. |
| 5 | **Hook Timeout** | None | Per-handler configurable timeout (default 10s) | A single slow handler blocks the entire pipeline synchronously. Claude Code enforces `TOOL_HOOK_EXECUTION_TIMEOUT_MS` (10 min default) with per-hook overrides. GEODE needs at minimum a global timeout to prevent handler-induced hangs. |

### P1 -- High (blocks production extensibility)

| # | GAP | Description |
|---|-----|-------------|
| 1 | **Interceptor pattern** | Current observer pattern is fire-and-forget. Claude Code hooks can return `{ continue: false }` to halt execution, `{ decision: "block" }` to deny tool use, or `{ updatedInput: {...} }` to modify tool arguments. GEODE needs a parallel interceptor channel for pre-execution gates. |
| 2 | **Async handler support** | All handlers run synchronously on the pipeline thread. For I/O-bound handlers (webhook delivery, metrics push, external audit log), this adds latency to every pipeline step. Need `async_trigger()` with `asyncio.gather()`. |
| 3 | **Auth/Session hooks** | No events for authentication, session creation, or permission changes. Claude Code has `PermissionRequest` / `PermissionDenied` / `Setup` events. Required for multi-user gateway scenarios. |
| 4 | **Rate limit hooks** | No event when an LLM provider returns 429 or when internal rate limits are hit. `LLM_CALL_RETRY` fires but does not distinguish rate-limit retries from error retries. |
| 5 | **Sandbox violation hooks** | No event when a tool attempts a disallowed operation. The sandbox catches the violation but does not emit a hook event for audit or alerting. |

### P2 -- Medium (production hardening)

| # | GAP | Description |
|---|-----|-------------|
| 1 | **Context budget warning** | `CONTEXT_CRITICAL` fires at overflow, but no graduated warnings (e.g., 70%, 85%, 95% thresholds). Claude Code has `PreCompact` / `PostCompact` for context compaction lifecycle. |
| 2 | **MCP health hooks** | `MCP_SERVER_CONNECTED` / `MCP_SERVER_FAILED` exist, but no periodic health check or reconnection events. |
| 3 | **Learning feedback hooks** | [[geode-bidirectional-learning]] operates outside the hook system. Memory extraction and validation should emit events for observability. |
| 4 | **Webhook delivery** | No built-in handler type for HTTP POST delivery. Claude Code has first-class `http` hook type with URL, headers, timeout, and env var interpolation. |
| 5 | **Hook error aggregation** | Errors are logged per-handler but not aggregated. No circuit breaker for repeatedly-failing handlers. |

### P3 -- Low (future architecture)

| # | GAP | Description |
|---|-----|-------------|
| 1 | **Multi-tenant scoping** | All hooks are global. No per-session or per-user hook registration for gateway multi-tenancy. |
| 2 | **Hook dependency graph** | No way to declare that handler B must run after handler A completes. Priority is a weak proxy. |
| 3 | **OpenTelemetry bridge** | Claude Code has `startHookSpan()` / `endHookSpan()` for distributed tracing. GEODE hooks have no tracing integration. |
| 4 | **Managed hooks only mode** | Claude Code supports `shouldAllowManagedHooksOnly()` to restrict hooks to official plugins only. GEODE has no trust boundary for hook sources. |
| 5 | **Plugin sandboxing** | User-defined hook handlers execute in the same process with full access. No isolation or capability restriction. |

## Architecture Transition

```
CURRENT                          TARGET
Observer (49 events)    →    Observer + Interceptor

trigger(event, data)         trigger(event, data)         [observer, unchanged]
  └─ fire-and-forget           └─ fire-and-forget

                             intercept(event, data) → InterceptResult
                               └─ can ALLOW / BLOCK / MODIFY
                               └─ runs BEFORE the action
                               └─ first BLOCK wins (short-circuit)
```

The interceptor channel handles pre-execution gates (P0-2, P1-1, P1-3, P1-5). The observer channel remains for post-execution logging and metrics. This mirrors Claude Code's architecture where `PreToolUse` hooks return decisions that the harness enforces.

## Key Insight

**Claude Code = harness-level interceptor.** Hooks are external shell commands, HTTP endpoints, or LLM prompts that execute outside the agent process. They can block, modify, and redirect -- the harness enforces their decisions. The agent itself has no knowledge of hooks.

**GEODE = runtime-level observer.** Hooks are Python callables registered inside the same process. They observe events after they happen but cannot prevent or modify them. The boundary between hook and runtime is a function call, not a process boundary.

This difference is not accidental. Claude Code hooks guard a single-user CLI with full trust in the hook author. GEODE hooks instrument a multi-entry-point daemon (CLI + Gateway + Scheduler) where hook author trust varies. The interceptor pattern must be added with a trust model that accounts for this.

## Related

- [[hook-claude-code-comparison]] -- side-by-side system comparison
- [[geode-architecture]] -- 4-layer stack where HookSystem lives at Harness layer
- [[geode-claude-code-patterns]] -- other Claude Code patterns adopted by GEODE
- [[geode-openclaw-patterns]] -- OpenClaw patterns (PolicyChain as interceptor analog)
- [[geode-context-guard]] -- existing context-level guard (P0-3 overlap)
- [[geode-tool-system]] -- tool execution lifecycle (P0-2 target)
- [[28-hook-system-event-driven-orchestration]] -- original hook system blog post
- [[blog-orchestration]] -- orchestration blog category
- [[blog-safety]] -- safety and verification blog category
- [[geode-development-workflow]] -- development workflow with quality gates
