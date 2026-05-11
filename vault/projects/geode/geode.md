---
title: GEODE
category: project
tags: [geode, autonomous-agent, langgraph, python, mcp]
source_path: /Users/mango/workspace/geode
sources:
  - "geode/GEODE.md"
  - "geode/CLAUDE.md"
  - "geode/CHANGELOG.md"
created: 2026-03-10T00:00:00Z
updated: 2026-04-15T00:00:00Z
---

# GEODE — General-Purpose Autonomous Execution Agent

A general-purpose autonomous execution agent built on LangGraph.
Autonomously performs research, analysis, automation, and scheduling from a single natural-language command.

Version: v0.48.0 | Python 3.12+ | 215 modules | 3939+ tests | 48 hooks | 56 tools

## Key Concepts
- [[geode-architecture]] — 4-layer stack (Model→Runtime→Harness→Agent)
- [[geode-agentic-loop]] — while(tool_use) core primitive
- [[geode-tool-system]] — 56 tools, 16 MCP servers, 4-tier safety
- [[geode-memory-system]] — 5-tier context hierarchy
- [[geode-bidirectional-learning]] — Correction + validation (Claude Code pattern)
- [[geode-computer-use]] — Provider-agnostic desktop automation
- [[geode-oauth-policy]] — Anthropic disabled (ToS), OpenAI Codex active
- [[geode-gateway]] — Thin CLI → IPC → serve daemon
- [[geode-domain-plugin]] — DomainPort Protocol, Game IP pipeline
- [[geode-context-guard]] — MCP 25K token guard + HTML→MD
- [[geode-sandbox-breadcrumb]] — 3-layer LLM path error steering
- [[geode-vault]] — Purpose-routed artifact storage
- [[geode-llm-models]] — 3-provider fallback chain (9 models)
- [[geode-tool-routing]] — AgenticLoop autonomous tool selection
- [[geode-quality-evaluation]] — 5-Layer verification (Game IP)
- [[geode-petri-alignment-audit]] — Petri × GEODE alignment audit PoC (v0.92.0+, 8 seeds, audit-mode)
- [[geode-scaffold-production]] — Scaffold production system (CANNOT/CAN, 8-Step, CI Ratchet)
- [[geode-unified-scaffold]] — Hook-Driven State Machine enforcement

## System Index

- [[geode-system-index]] — 모든 1차 서브시스템 색인 (4계층 스택, docs sitemap 토대)

## Prompt System Series

- [[geode-prompt-system]] — Series hub (5계층 아키텍처 + 빠른 참조표)
- [[geode-prompt-templates]] — 17 base/extended 템플릿 + 3 axes 데이터 카탈로그
- [[geode-prompt-assembly]] — `PromptAssembler.assemble()` 6단계 + `PROMPT_ASSEMBLED` Hook
- [[geode-prompt-hashing]] — Karpathy P4 ratchet (SHA-256[:12] × 18 핀) + 재핀 워크플로
- [[geode-prompt-frontier-comparison]] — Hermes / OpenClaw / Claude Code / GEODE 4-way 수평 비교
- [[geode-prompt-evolution]] — 8개 GAP 우선순위 (P1: skill ratchet + Anthropic cache)

## Case Study: REODE Legacy Migration

GEODE v0.12.0 fork → REODE: 범용 Migration & Coding Core Agent.
Java 1.8→22, Spring Framework 4→6 마이그레이션 파이프라인 실증.

| Metric | Value |
|--------|-------|
| Target Files | 5,523 |
| Source Migration | Java 1.8 → 22 |
| Framework Migration | Spring 4 → 6 |
| Test Results | 83/83 pass |
| Total Cost | $388 |
| Total Time | 5h 48m |

## Blog
- [[blog-hub]] — 99 posts central index
- [[blog-architecture]] — 12 architecture posts
- [[blog-tools-mcp]] — 6 tools & MCP posts
- [[blog-memory-context]] — 13 memory & learning posts
- [[blog-harness-frontier]] — 13 harness research posts
- [[blog-orchestration]] — 15 orchestration posts
- [[blog-safety]] — 10 safety posts
- [[blog-technical]] — 8 technical posts
- [[blog-llm-resilience]] — 7 resilience posts
- [[blog-narrative]] — 4 narrative posts
- [[blog-reode]] — 9 REODE migration posts
- [[blog-release]] — 2 release notes
- [[blog-research]] — 13 research documents
- [[blog-internal]] — Internal evaluations
- [[blog-legacy]] — Legacy architecture & plans
- [[blog-logs]] — Kanban session logs

## Career
- [[resume-targets]] — 21 companies, 45+ positions
- [[portfolio-geode]] — 10 version deck (PPTX/PDF)
- [[nexon-ai-live]] — Nexon AI Live 과제 (GEODE 원점)

## Frontier Patterns
- [[geode-claude-code-patterns]] — Claude Code patterns adopted
- [[geode-openclaw-patterns]] — OpenClaw patterns adopted

## Related
- [[mango]] — Project lead and operator
- [[kiki]]
- [[index]]
- [[2026-04-07]]
- [[career-hub]]
