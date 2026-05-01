---
title: "Kiki Maturity Sprint — 2026-04-12~14"
summary: "1주 안에 LLM-Wiki 엔진, 인터랙티브 승인 UI, LAN 인프라가 모두 들어온 변곡점. mango가 데이터로 자기 행동까지 함께 마크."
tags: [kiki, synthesis, maturity, sprint, llm-wiki, interactive-ui, lan]
sources:
  - raw/kiki-signals/obs_general_2026-04-15.md
  - raw/kiki-signals/obs_general_2026-04-15b.md
related:
  - "[[kiki-signal-2026-04-15-mango]]"
  - "[[kiki-signal-2026-04-15-slack]]"
  - "[[kiki-handoff-retros]]"
  - "[[kiki-skills-index]]"
created: 2026-05-01
updated: 2026-05-01
provenance: { extracted: 0.7, inferred: 0.3 }
---

# Kiki Maturity Sprint — April 12–14, 2026

A one-week inflection where Kiki crossed from "internal scaffold" to "team-accessible operating system." Captured by overlapping git, LinkedIn, and Slack-direct observations on Apr 15.

## Three Axes That Shifted in Parallel

### 1. Knowledge Engine — LLM-Wiki landed (Apr 12, Sun)
- 14 wiki skills installed in a single weekend session (20:24–23:51)
- Karpathy wiki archiver pattern adopted as the canonical knowledge layer
- Kiki-Chat prompt delivery shipped same session
- 4 feature branches merged simultaneously

This is the engine behind both the kiki internal vault (`memory/vault/`) and this mango-wiki itself. See [[kiki-research-index]] entry on LLM Wiki research.

### 2. Approval UX — Emoji → Interactive Buttons (Apr 13)
- `#kiki-maintain` interactive approve/deny buttons shipped
- Startup catch-up broadcast added (operators see what they missed)
- mango joined `#kiki-maintain` 17:22 KST same day (channel-creation → first-user latency: hours)
- 7 days post-launch: zero emoji reactions in the channel — proves block-kit buttons replaced emoji as the primary approval surface, not added alongside

### 3. Reach — LAN Infrastructure (Apr 14)
- All host services rebound to `0.0.0.0` (was `127.0.0.1`)
- `scripts/setup`, `run`, `cleanup` automation added
- Signals shift in operator intent: solo-dev environment → team/collaborator-accessible infrastructure

## Sprint Cadence (mango)

The Apr 14 17:39–19:58 KST window: **7 PRs merged in 2h19m**. Covered:
- Dashboard external-agent support
- Excalidraw diagram integration
- kiki-setup Skill 2.0 refactor
- LAN service binding
- Paperclip patch auto-apply scripts

This established a new behavioral signal: an **afternoon-into-evening sprint band (17:39–19:58)** on top of the previously confirmed three-zone schedule (afternoon / evening / night-focus).

## Cross-Modal Observation Robustness

The Apr 15 signal was reconstructed from **git commit log + LinkedIn outbound** when Slack MCP was unavailable. Hours later when MCP came back online, the Slack-direct signal **confirmed the same window** (Apr 12 weekend morning check, Apr 13 channel join) — proving the multi-modal fallback isn't a degraded mode, it's a parallel mode.

This is itself a kiki-system milestone: behavioral profiling no longer single-points-of-failure on Slack.

## Self-Declaration Pattern

mango's first **external** declaration of the harness-first stance — "최근엔 LLM 기반 하네스에 신경을 많이 쓰고 있습니다" — landed on LinkedIn (Apr 14–15), to a brand-new 1st-degree connection. The internal profile already encoded `harness-first` as a core anti-pattern stance against RAG. The Apr 15 signal is the moment the internal stance became externally visible.

## New Expertise Signals (mango)

| Skill | Date observed | Confidence |
|-------|--------------|------------|
| excalidraw-diagram-integration | 2026-04-14 | 0.72 |
| wiki-engine-llm-karpathy | 2026-04-12 | 0.80 |
| lan-infrastructure-ops | 2026-04-14 | 0.70 |

## Why It Matters

Three kinds of growth landed in the same week — engine, UX, reach — and the operator who built it shipped the proof at the cadence of his own data ledger. The kiki repo went from 81 → 93+ PRs in 4 days; the channel that exists to coordinate maintenance went from "not joined" to "primary approval surface" inside one rollout day.

See also:
- [[kiki-signal-2026-04-15-mango]] — git+LinkedIn fallback signal
- [[kiki-signal-2026-04-15-slack]] — Slack-direct companion
- [[kiki-handoff-retros]] — earlier-cycle failure analysis this sprint built on
- [[mango-user]] — updated with new sprint band + expertise signals
