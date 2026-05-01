---
title: Mango — User Profile
summary: Kiki 관찰 대상 유저. 병렬 프로젝트 운영, 야간 집중 + 4/14 오후-저녁 스프린트 밴드, 주말 2-구간 패턴, harness-first 외부 자기 선언.
tags: [kiki, entity, user, profile]
sources:
  - raw/kiki-profiles/user_mango.md
  - raw/kiki-signals/obs_general_2026-04-10.md
  - raw/kiki-signals/obs_general_2026-04-15.md
  - raw/kiki-signals/obs_general_2026-04-15b.md
created: 2026-04-15
updated: 2026-05-01
provenance: { extracted: 0.85, inferred: 0.15 }
---

# Mango — User Profile

Kiki 프로파일링 파이프라인에서 관찰된 유저 프로필. 4/15 git+LinkedIn+Slack 3-modal 관찰로 confidence 상향.

## Profile Summary

| 항목 | 값 |
|------|------|
| Role | mango (프로젝트 리드 / system owner) |
| Confidence | 0.91 (4/15 기준, 4/11 decay 후 0.89 → +0.02 회복) |
| Communication | 코드 중심, 간결, 기술 용어 직접 사용 |
| Decision Style | 빠른 판단, 검증 후 즉시 실행 |

## Work Patterns

- **병렬 프로젝트**: GEODE, REODE, Kiki, LLMART 동시 운영
- **세션 강도**: 8K-12K 메시지/세션 (고집중)
- **야간 집중**: 22:00-02:00 핵심 작업 시간 (conf 0.84, 4/15 LinkedIn 01:58 발송으로 사회 인터랙션 영역까지 확장 확인)
- **오후-저녁 스프린트 밴드 (NEW 4/14)**: 17:39–19:58 KST 7-PR 스프린트 — 기존 3-구간(오후/저녁/야간) 위에 추가 (conf 0.85)
- **주말 2-구간 패턴 (NEW 4/12)**: 일요일 오전 ~11시 헬스체크 + 저녁 20–24시 메인 스프린트 (conf 0.78)
- **GitFlow strict**: feature → develop → main 엄수
- **CLI 아키텍처**: Typer, prompt-toolkit, Rich UI 중심

## Communication

- **표준 헬스체크**: `@Kiki 안녕` (4/9 ~ 4/12 5회 반복, conf 0.90)
- **언어 전환 패턴**: 영어 terse 명령 → 한국어 자연어 deep 질문 (conf 0.82)
- **채널 분리 원칙**: `#전체` + `#kiki-maintain`만 활동, 엔지니어링/재무/소셜 채널 0건 (conf 0.82)
- **승인 UI 전환**: 4/13 인터랙티브 버튼 도입 후 emoji 반응 → block-kit 버튼 1차 승인 surface
- **LinkedIn 패턴**: 최소 engagement 수락 + 1줄 관심사 공유 ('LLM 기반 하네스에 신경을 많이 쓰고 있습니다') (conf 0.72)

## Expertise

- AI Agents (LangGraph, Claude Code, OpenClaw)
- Python Backend (FastAPI, asyncio, pydantic)
- CLI Architecture (Typer, prompt-toolkit, Rich)
- TypeScript (Kiki frontend)
- DevOps (GitHub Actions, CI ratchet)
- **Excalidraw diagram integration** (4/14, conf 0.72)
- **LLM-Wiki engine (Karpathy pattern)** (4/12, conf 0.80)
- **LAN infrastructure ops (0.0.0.0 binding + automation scripts)** (4/14, conf 0.70)

## External Self-Declaration

- **harness-first 공개 (4/14~15)**: LinkedIn에서 신규 1촌에게 핵심 방향성 직접 공유 — 내부 프로필 anti-pattern 'RAG' 스탠스가 외부 채널에서 첫 가시화 (conf 0.95)

## Related

- [[mango]] — Global entity page
- [[kiki]] — Kiki 프로젝트
- [[geode]] — GEODE 프로젝트
- [[kiki-maturity-sprint-april]] — 4/12-14 변곡점 synthesis
- [[kiki-signal-2026-04-15-mango]] — git/LinkedIn signal
- [[kiki-signal-2026-04-15-slack]] — Slack-direct companion
