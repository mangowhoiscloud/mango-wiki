---
title: Hook System Comparison — Claude Code vs GEODE
tags: [hooks, claude-code, comparison, frontier-research]
sources: [claude-code/utils/hooks.ts, geode/core/hooks/system.py]
created: 2026-04-09
updated: 2026-04-09
---

# Hook System Comparison -- Claude Code vs GEODE

Side-by-side reference comparing the hook systems of Claude Code (Anthropic's CLI harness) and GEODE (general-purpose autonomous execution agent). For production gap analysis derived from this comparison, see [[geode-hook-production-gap]].

## Overview

| Dimension | Claude Code | GEODE |
|-----------|------------|-------|
| Language | TypeScript (Node.js) | Python 3.12 |
| Events | 27 (`HOOK_EVENTS` array) | 49 (`HookEvent` enum) |
| Handler types | 4 (command, prompt, agent, http) | 1 (Python callable) |
| Execution | Async (`Promise.all`), parallel within event | Sync, sequential by priority |
| Timeout | 10 min default, per-hook override | None |
| Pattern | Interceptor (can block/modify/redirect) | Observer (fire-and-forget) |
| Configuration | `settings.json` (JSON) | Python registration + YAML/class discovery |
| Process boundary | External (subprocess/HTTP/LLM) | Internal (same process) |
| Trust model | Hook author = user (full trust) | Hook author = mixed (internal + plugin) |
| Error handling | Per-hook, outcome field (`success`/`error`/`cancelled`) | Per-hook, try/except + log |

## Event Coverage Matrix

| Category | Claude Code Events | GEODE Events |
|----------|-------------------|--------------|
| **Session** | SessionStart, SessionEnd, Setup | SESSION_START, SESSION_END |
| **User Input** | UserPromptSubmit | (missing -- P0 gap) |
| **Tool Pre** | PreToolUse | (missing -- P0 gap) |
| **Tool Post** | PostToolUse, PostToolUseFailure | TOOL_RECOVERY_ATTEMPTED/SUCCEEDED/FAILED |
| **Permission** | PermissionRequest, PermissionDenied | TOOL_APPROVAL_REQUESTED/GRANTED/DENIED |
| **Stop/Cancel** | Stop, StopFailure | SHUTDOWN_STARTED (serve only) |
| **SubAgent** | SubagentStart, SubagentStop | SUBAGENT_STARTED/COMPLETED/FAILED |
| **Context** | PreCompact, PostCompact | CONTEXT_CRITICAL, CONTEXT_OVERFLOW_ACTION |
| **Config** | ConfigChange | CONFIG_RELOADED |
| **Notification** | Notification | (no equivalent) |
| **File/CWD** | CwdChanged, FileChanged | (no equivalent) |
| **Worktree** | WorktreeCreate, WorktreeRemove | (no equivalent) |
| **Task** | TaskCreated, TaskCompleted | (no equivalent) |
| **Team** | TeammateIdle | (no equivalent) |
| **Elicitation** | Elicitation, ElicitationResult | (no equivalent) |
| **Instructions** | InstructionsLoaded | (no equivalent) |
| **Pipeline** | (no equivalent) | PIPELINE_START/END/ERROR/TIMEOUT |
| **Node** | (no equivalent) | NODE_BOOTSTRAP/ENTER/EXIT/ERROR |
| **Analysis** | (no equivalent) | ANALYST/EVALUATOR/SCORING_COMPLETE |
| **Verification** | (no equivalent) | VERIFICATION_PASS/FAIL |
| **Automation** | (no equivalent) | DRIFT_DETECTED, TRIGGER_FIRED, etc. (6) |
| **Memory** | (no equivalent) | MEMORY_SAVED, RULE_CREATED/UPDATED/DELETED |
| **Prompt** | (no equivalent) | PROMPT_ASSEMBLED |
| **LLM Call** | (no equivalent) | LLM_CALL_START/END/FAILED/RETRY |
| **Model** | (no equivalent) | MODEL_SWITCHED, FALLBACK_CROSS_PROVIDER |
| **MCP** | (no equivalent) | MCP_SERVER_CONNECTED/FAILED |
| **Tool Offload** | (no equivalent) | TOOL_RESULT_OFFLOADED |

Claude Code covers the harness perimeter (user input, tool gates, permissions, config, files). GEODE covers the runtime interior (pipeline nodes, analysis, scoring, memory, LLM calls). The overlap is narrow: session lifecycle, subagent lifecycle, context management.

## Execution Model

| Aspect | Claude Code | GEODE |
|--------|------------|-------|
| Concurrency | `Promise.all` -- all hooks for an event run in parallel | Sequential iteration by priority |
| Ordering | No guaranteed order within an event | Priority-sorted (lower number first) |
| Blocking | Hook can return `{ continue: false }` to halt | Cannot halt; observer only |
| Timeout | `TOOL_HOOK_EXECUTION_TIMEOUT_MS` = 600,000 ms (10 min); `SessionEnd` timeout = 1,500 ms; per-hook `timeout` field in seconds | None |
| Async mode | `{ async: true }` response runs hook in background | Not supported |
| Progress | `emitHookProgress()` streams stdout/stderr during execution | Not supported |
| Cancellation | `AbortSignal` propagation | Not supported |

## Hook Types

### Claude Code -- 4 types

| Type | Description | Execution |
|------|-------------|-----------|
| `command` | Shell command (`bash`/`zsh`/`powershell`) | Subprocess with `wrapSpawn()`, stdout/stderr captured |
| `prompt` | LLM prompt evaluated by a model | Model call (configurable model, e.g. `claude-sonnet-4-6`) |
| `agent` | Agentic verifier with tools | Full agent loop (default Haiku, configurable) |
| `http` | HTTP POST to external URL | `fetch()` with headers, env var interpolation, timeout |

### GEODE -- 1 type + plugin discovery

| Type | Description | Execution |
|------|-------------|-----------|
| Python callable | `HookHandler = Callable[[HookEvent, dict], dict \| None]` | Direct function call in-process |
| YAML plugin | Declarative hook registration via YAML config | Loaded at bootstrap, same callable execution |
| Class plugin | `AbstractPlugin` subclass discovered on import | Loaded at bootstrap, same callable execution |

## Data Flow

### Claude Code -- Interceptor

```
User Input → [UserPromptSubmit hooks] → LLM Call
                                          ↓
Tool Request → [PreToolUse hooks] ──→ ALLOW → Execute Tool → [PostToolUse hooks]
                    │                                              │
                    └─→ BLOCK → Skip Tool                         └─→ updatedMCPToolOutput
                    └─→ MODIFY (updatedInput)
```

Hooks sit **between** the agent and the action. They can inspect, modify, block, or approve. The harness enforces the hook's decision -- the agent never sees the blocked tool call.

### GEODE -- Observer

```
Pipeline Start → emit(PIPELINE_START) → [handlers observe]
     ↓
Node Enter → emit(NODE_ENTER) → [handlers observe]
     ↓
Tool Execute → (no hook) → Result
     ↓
Node Exit → emit(NODE_EXIT) → [handlers observe]
     ↓
Pipeline End → emit(PIPELINE_END) → [handlers observe]
```

Hooks sit **alongside** the pipeline. They receive events after the fact. `trigger_with_result()` allows handlers to return data (e.g., context overflow recommendations), but the caller must explicitly check and act on it -- there is no enforcement mechanism.

## Security Model

| Aspect | Claude Code | GEODE |
|--------|------------|-------|
| Hook source trust | User-configured in `settings.json`; managed plugins via marketplace | Internal Python code + YAML/class plugins |
| Managed-only mode | `shouldAllowManagedHooksOnly()` restricts to official plugins | Not supported |
| All-hooks disable | `shouldDisableAllHooksIncludingManaged()` kills all hooks | `HookSystem.clear()` removes all registrations |
| Matcher filtering | `if` field with permission rule syntax (e.g., `"Bash(git *)"`) | No filtering; handler receives all events it registered for |
| Environment isolation | Hooks run as subprocesses with `subprocessEnv()` | Hooks run in-process with full Python access |
| OTel integration | `startHookSpan()` / `endHookSpan()` for distributed tracing | None |
| Analytics | `logEvent()` with `tengu_run_hook` metrics | Logging only |
| Once execution | `once: true` field removes hook after first fire | Not supported |

## Key Architectural Patterns

### Interceptor (Claude Code)

The harness executes hooks as external processes. This provides natural isolation (a crashing hook cannot corrupt agent state) and natural security (hooks cannot access agent internals). The cost is latency: every tool call spawns a subprocess, makes an HTTP call, or runs an LLM prompt. Claude Code mitigates this with `{ async: true }` background execution and `if` matchers that skip non-matching hooks before spawning.

### Observer (GEODE)

The runtime executes hooks as in-process function calls. This provides zero-overhead observation (no IPC, no serialization) and rich data access (handlers receive full Python dicts with references). The cost is coupling: a blocking handler freezes the pipeline, and a crashing handler (though caught) shares the process address space. GEODE mitigates this with priority ordering and per-handler exception isolation.

### Convergence Path

The [[geode-hook-production-gap]] analysis identifies the interceptor pattern as a P1 addition. The proposed architecture adds an `intercept()` channel alongside the existing `trigger()` channel, preserving backward compatibility while enabling pre-execution gates. The [[geode-openclaw-patterns|PolicyChain]] pattern from OpenClaw provides a precedent: a chain of policies evaluated before action execution, where any policy can veto.

## Related

- [[geode-hook-production-gap]] -- production gap analysis derived from this comparison
- [[geode-claude-code-patterns]] -- other Claude Code patterns adopted by GEODE
- [[geode-openclaw-patterns]] -- OpenClaw patterns (PolicyChain as interceptor analog)
- [[geode-architecture]] -- GEODE 4-layer stack
- [[geode-tool-system]] -- GEODE tool execution (missing PreToolUse/PostToolUse hooks)
- [[geode-agentic-loop]] -- GEODE core loop (where interceptor would integrate)
- [[28-hook-system-event-driven-orchestration]] -- original hook system blog post (27 events)
- [[blog-orchestration]] -- orchestration blog category
- [[blog-harness-frontier]] -- harness and frontier research blog posts
- [[blog-safety]] -- safety and verification blog posts
