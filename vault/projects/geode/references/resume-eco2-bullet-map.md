---
title: Resume Eco2 Bullet Map
type: reference
category: career
tags: [resume, bullet-map, eco2, multi-agent, langgraph, k8s, ssot]
related:
  - "[[resume-bullet-maps-hub]]"
  - "[[resume-linkedin-narrative]]"
sources:
  - "/Users/mango/workspace/resume/common/ECO2-BULLET-MAP.md"
created: 2026-05-01T05:00:00Z
updated: 2026-05-01T05:00:00Z
---

# Resume Eco² Bullet Map — Multi-Agent Orchestration Platform

SeSACTHON 2025 Excellence (4th/181 teams). MVP 2025.10–12, Solo 2025.12–2026.02.

원본 60 라인. 소스: eco2-distilled SKILL.md, eco2-context, common/index.html Eco2 섹션.

## 카테고리 E2-A — 멀티에이전트 아키텍처

| ID | 핵심 |
|---|---|
| E2-A1 | **LangGraph StateGraph** 기반 멀티에이전트. Chat/Analysis/Execution 역할 분리. 상태 그래프로 핸드오프 조건 정의. |
| E2-A2 | **Event Bus 4단계 진화**: Direct Call → Pub/Sub → Event Bus → Prioritized Queue. 3-Tier 아키텍처. |

## 카테고리 E2-B — 인프라와 운영

| ID | 핵심 |
|---|---|
| E2-B1 | **K8s 24-Node 클러스터**. Pod 격리, HPA 부하 기반 스케일링, Namespace 환경 분리 (dev/staging/prod) |
| E2-B2 | **4-Pillar Observability**: Metrics(Prometheus) + Logs(ELK) + Traces(Jaeger/OpenTelemetry) + Events(Event Bus 로깅). 분산 트레이싱으로 호출 체인 추적 |

## 카테고리 E2-C — 평가와 품질

| ID | 핵심 |
|---|---|
| E2-C1 | **Swiss Cheese 평가 모델**. 다층 필터(입력 검증→에이전트 추론→도구 실행→출력 검증). 평가 점수 **69.4 → 99.8/100** |
| E2-C2 | **Auth Offloading**. Gateway/Sidecar 패턴으로 토큰 관리. 에이전트는 인증 없이 내부 API만 호출. zero-trust internal |

## 핵심 수치

| 지표 | 값 |
|---|---|
| 인프라 | K8s 24-node |
| 부하 | VU 1,000 / 97.8% |
| 처리량 | TPM 400M, RPM 373.9 |
| Swiss Cheese 평가 | 69.4 → 99.8/100 |
| 수상 | 🏆 SeSACTHON 2025 Excellence (4th/181 teams) |
| 솔로 기간 | 2025.12 ~ 2026.02 (3개월) |

## 차별화 포인트

- **단일 프롬프트 → LangGraph 인텐트 분류기 + 병렬 라우팅** 으로 채팅 재작성
- **Agent SDK tool-use, SSE streaming, multi-turn**
- **이미지 생성 파이프라인** (nano-banana-pro)
- **RAG 평가 피드백 루프** — ChatGPT 비교 가능한 사용성

## 타겟별 권장 조립

| 타겟 | 권장 항목 | 키 |
|---|---|---|
| Agent-first | E2-A1 + E2-C1 | "LangGraph 멀티에이전트 + Swiss Cheese 다층 평가 (69.4→99.8)" |
| Platform/Infra (토스) | E2-B1 + E2-B2 | "24-Node K8s + 4-Pillar Observability" |
| Product/Applied | E2-A2 + E2-C2 | "Event Bus 4단계 진화 + Auth Offloading zero-trust" |

## Related

- [[resume-bullet-maps-hub]]
- [[resume-linkedin-narrative]]
- [[index]]

## Open Questions

- VU 1,000 / 97.8% 의 측정 방법론 (k6? Locust? JMeter?) 명시 필요 — 면접 답변 신뢰도 향상.
- Swiss Cheese 모델의 4 레이어 정의가 매니저급 면접관에게 일관되게 전달되는가?
