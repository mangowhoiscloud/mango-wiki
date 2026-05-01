---
title: Research Documents — Detailed Index
summary: GEODE 관련 13개 리서치 문서 상세 인덱스. 프론티어 하네스, 메모리, 안전성, 인프라 등.
tags: [geode, research, frontier, reference]
sources: [raw/geode-blog/research/]
created: 2026-04-15
updated: 2026-04-15
provenance: { extracted: 0.85, inferred: 0.15 }
---

# Research Documents — Detailed Index

GEODE 개발 과정에서 참조한 13개 리서치 문서 인덱스.

## Frontier Harness & Agent Infrastructure

| Document | Topic | Key Insight |
|----------|-------|-------------|
| anthropic-sandbox-runtime | Anthropic sandbox-runtime OS 레벨 샌드박싱 (Seatbelt/bubblewrap/seccomp) | 프록시 기반 도메인 필터링이 syscall 차단보다 세밀한 네트워크 격리를 제공; deny-default + mandatory deny 목록으로 우회 방지 |
| claude-code-search-fetch-pipeline | Claude Code 5-Layer context overflow 방어 파이프라인 (Per-Tool Cap → HTML→MD → Haiku 요약 → Disk Persistence → Aggregate Budget) | 컨텍스트를 관리하는 최선은 "애초에 넣지 않는 것"; L1 차단이 가장 저렴하고 L3 요약이 가장 비쌈 |
| cmux-harness-infrastructure | cmux (Ghostty 기반 macOS 터미널) 하네스 인프라 분석 — 알림/사이드바/브라우저/소켓 API | cmux는 하네스가 아닌 "하네스를 실행하는 인프라"(Layer 1); 프로바이더 혼합으로 rate limit 풀 분리 가능 |
| paperclip-ai-agent-orchestration | Paperclip 자율 AI 에이전트 오케스트레이션 — Control Plane/Execution Plane 분리, 61 테이블, 7종 어댑터 | "에이전트를 도구가 아닌 조직 구성원으로" — 조율 공백(Coordination Gap)을 조직도+예산+거버넌스로 해결 |

## Memory & Context

| Document | Topic | Key Insight |
|----------|-------|-------------|
| context-hub-chub | Context Hub (Andrew Ng) 상세 리서치 — CLI/MCP 기반 API 문서 주입 + annotations/feedback 자기 개선 루프 | "할루시네이션은 모델 한계가 아니라 컨텍스트 부재"; Progressive Disclosure로 50K 토큰 문서를 진입점만 먼저 로드 |
| context-hub | Context Hub 프론티어 비교 매트릭스 — REODE ContextAssembler vs Context Hub vs MCP vs CLAUDE.md | Context Hub는 "사실 레퍼런스" 레이어로 행동(CLAUDE.md)/도구(MCP)와 보완 관계; REODE는 동일 철학의 구조화된 독립 구현 |
| mem0-long-term-memory | Mem0 장기 메모리 아키텍처 — 텍스트(Mem0) + 그래프(Mem0g) 이중 변종, LOCOMO 벤치마크 | 1M 토큰 full-context에서도 복합 추론 정확도 하락(RULER 96.6→81.2%); 구조화된 메모리가 검색 실패를 49% 감소 |

## Safety & Reliability

| Document | Topic | Key Insight |
|----------|-------|-------------|
| long-running-agent-safety | 장기 실행 에이전트 안전 설계 — 종료 조건, 래칫, 수렴 감지, 에러 복구 4단계 | 삼중 종료 조건(시간 예산 + 반복 상한 + 목표 달성 검증); DANGEROUS 도구는 자동 복구에서 제외해야 함 |
| rich-thread-safety-console-print | Rich console.print() thread-safety 조사 — thread-local 버퍼, RLock, Live/Progress race condition | Live/Progress 비활성 시 대체로 안전(cosmetic issue); 활성 시 race condition 발생 → Queue-Based 패턴이 gold standard |
| lanequeue-coalescingqueue-geode-evolution | OpenClaw LaneQueue/CoalescingQueue → GEODE SessionLane 진화 — per-key Semaphore, idle eviction, dead code 삭제 | Lock 스코프 분리(dict lock ≠ semaphore lock)가 per-key 병렬성의 핵심; 5개 동시성 게이트를 2개로 통합 |

## ML Infrastructure (TurboQuant)

| Document | Topic | Key Insight |
|----------|-------|-------------|
| turboquant-research | Google TurboQuant 개요 — KV 캐시 3-bit 양자화, 6x 메모리 감소, 8x 속도 향상, training-free | 벡터 재구성이 아닌 내적(어텐션 스코어) 정확도를 최적화하므로 높은 벡터 오류에도 모델 출력이 유지됨 |
| turboquant-kv-cache-compression | TurboQuant 기술 증류 — PolarQuant(극좌표 변환) + QJL(1-bit 잔차 보정) 2단계 파이프라인 | data-oblivious 특성으로 인덱싱 18만 배 빠름; 정보이론 하한 대비 ~2.7x 이내의 near-optimal 압축 |
| turboquant-cs-fundamentals-appendix | TurboQuant 기반 CS 기초 — 벡터 양자화, JL Lemma, 정보이론 하한, KV Cache in Attention | Rate-distortion tradeoff의 1/4^b 스케일링이 TurboQuant 최적성 증명의 이론적 근거 |

## Related

- [[blog-research]] — Blog research category hub
- [[geode-architecture]] — GEODE architecture overview
- [[geode-claude-code-patterns]] — Claude Code adopted patterns
- [[geode-openclaw-patterns]] — OpenClaw adopted patterns
- [[geode-memory-system]] — GEODE memory system concepts
- [[geode-agentic-loop]] — GEODE agentic loop design
- [[geode-adaptive-thinking]] — Anthropic adaptive thinking 구현 + Think@N 비교 (외부 가지치기 vs 모델 자율 분배)
