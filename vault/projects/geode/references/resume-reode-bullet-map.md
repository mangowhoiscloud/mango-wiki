---
title: Resume REODE Bullet Map
type: reference
category: career
tags: [resume, bullet-map, reode, code-migration, openrewrite, ssot]
related:
  - "[[resume-bullet-maps-hub]]"
  - "[[resume-linkedin-narrative]]"
  - "[[blog-reode]]"
  - "[[geode]]"
sources:
  - "/Users/mango/workspace/resume/common/REODE-BULLET-MAP.md"
created: 2026-05-01T05:00:00Z
updated: 2026-05-01T05:00:00Z
---

# Resume REODE Bullet Map — Autonomous Code Migration Harness

REODE 는 GEODE v0.12.0 fork → 범용 Migration & Coding Core Agent. **자율 마이그레이션 에이전트가 5,523 파일을 5시간 48분에 처리**.

원본 53 라인. 소스: reode-distilled SKILL.md, common/index.html REODE 섹션.

## 카테고리 R-A — 하이브리드 마이그레이션 전략

| ID | 핵심 |
|---|---|
| R-A1 | **OpenRewrite 70% + LLM 30% 하이브리드**. 결정론적 변환은 OpenRewrite (import 치환, API 시그니처), 컨텍스트 의존적 변환은 LLM (비즈니스 로직, 테스트). 환각 리스크를 30% 영역으로 구조적 격리. **83/83 빌드 통과** |
| R-A2 | 모듈별 자율 세션 격리, 의존성 그래프 기반 실행 순서. **33 sessions, 1,133 LLM rounds, 5h48m, 83 modules** |

## 카테고리 R-B — 검증과 품질

| ID | 핵심 |
|---|---|
| R-B1 | **빌드 기반 피드백 루프**. 모듈 변환 → 빌드 → 실패 시 LLM 자동 수정 루프 → 최대 N회 재시도. **83/83 pass, 0 manual intervention** |
| R-B2 | 마이그레이션 전후 테스트 비교. 실패 테스트 자동 수정. 회귀 0. |

## 카테고리 R-C — 비용과 효율

| ID | 핵심 |
|---|---|
| R-C1 | OpenRewrite 70% 결정론으로 LLM 호출 최소화. **모듈당 평균 ~34 rounds, ~4.2 min**. 총 비용 **$388** |

## 핵심 수치

| 지표 | 값 |
|---|---|
| Target Files | 5,523 |
| Source Migration | Java 1.8 → 22 |
| Framework Migration | Spring 4 → 6 |
| Build Pass | 83/83 |
| Total Cost | $388 |
| Total Time | 5h 48m |
| Sessions | 33 |
| LLM Rounds | 1,133 |
| Avg per Module | ~34 rounds, ~4.2 min |
| Hybrid Ratio | OpenRewrite 70% / LLM 30% |

## 한 줄 마무리

> The harness generalizes, the domain is just a plugin.
> A failed interview became a revenue-generating product.

## 타겟별 권장 조립

| 타겟 | 권장 항목 | 키 |
|---|---|---|
| Agent-first (NAVER/업스테이지/뤼튼) | R-A1 + R-A2 | "자율 에이전트가 83 모듈을 5h48m 에 마이그레이션, 100% 빌드 통과" |
| Platform/Infra (토스) | R-B1 + R-C1 | "빌드 기반 피드백 루프로 100% 통과 + 모듈당 4.2분" |
| Product/Applied (당근/카카오) | R-A1 1줄 | "OpenRewrite+LLM 하이브리드로 83/83 빌드 통과" |

## Related

- [[resume-bullet-maps-hub]]
- [[blog-reode]] — 9개 REODE 마이그레이션 포스트
- [[geode]] · [[geode-domain-plugin]]
- [[geode-changelog-summary]]

## Open Questions

- $388 / 5h48m 의 비용 대비 가치를 다른 도메인 (Python→Go, Kotlin→Swift) 에서도 재현 가능한가?
- OpenRewrite 의 레시피 커버리지 70% 가 다른 언어 마이그레이션에서도 유지될 수 있는 가정인가?
