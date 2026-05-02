---
title: Grounding Checklist
type: meta
geode_version: 0.65.0
last_grounded: 2026-05-02
---

# Grounding Checklist

공식 문서 작성 전 / 작성 후 / 재검증 시 모두 적용되는 절차.

## 작성 전 (Explore 단계)

| # | 점검 | 통과 조건 |
|---|---|---|
| G-1 | 페이지 주제와 매칭되는 코드 경로 식별 | `path/to/file.py:line-line` 형식으로 최소 1개 |
| G-2 | 매칭되는 CHANGELOG 항목 / PR 번호 확인 | 도입 시점 + PR 인용 |
| G-3 | 외부 패턴 빌림 여부 명시 | OpenClaw / Hermes / Claude Code / Codex CLI 출처 URL |
| G-4 | 같은 주제 portfolio 페이지 존재 여부 확인 | 있으면 프론트매터 `legacy_portfolio_path` 채움 |
| G-5 | 메모리/스킬에 관련 출처 있는지 확인 | wiki 내 cross-link 후보 노트 |

## 작성 중 (본문 규칙)

| 규칙 | 위반 시 |
|---|---|
| 모든 명칭(클래스/함수/CLI/슬래시 명령)은 코드 grep로 실재 검증 후 인용 | FAIL — 페이지 보류 |
| 모든 숫자/메트릭(테스트 수, 모듈 수, 토큰 한계)은 측정값 인용 | FAIL — placeholder 금지 |
| 코드 인용은 `path/to/file.py:line` 형식, 가능하면 라인 범위 | 형식 위반 시 자동 검증 스크립트가 차단 |
| CHANGELOG 인용 시 `[버전] — 날짜 (PR #번호)` | 형식 위반 시 차단 |
| 외부 패턴 빌림 시 `(출처: <URL>)` 명시 | 무인용 차용 금지 |
| 한국어 본문 + 영문 식별자 (Korean prose, English identifiers) | 일관성 유지 |

## 작성 후 (Cross-Check)

| # | 검사 | 도구 |
|---|---|---|
| C-1 | frontmatter `code_refs`에 적힌 모든 path/line이 실존 | `_meta/scripts/verify_refs.py` (P6 작성) |
| C-2 | metric 인용된 숫자가 현재 SOT와 일치 | 위 스크립트의 metric 모듈 |
| C-3 | zero-context 에이전트가 페이지 읽고 코드 cross-check | Explore 에이전트 호출 |
| C-4 | 다른 페이지에서 cross-link 가능한 곳 모두 연결 | obsidian `[[...]]` syntax |
| C-5 | OpenClaw / Hermes 패턴 빌린 부분 — 출처 살아있는지 | WebFetch 1회 통과 |

## Outdated 트리거 (재검증 필요)

다음 중 하나라도 해당되면 페이지 `last_grounded` 만료 → P2 재실행:

- 코드 경로 인용된 파일이 변경됨 (`git log -- <path>`로 검출)
- 인용된 메트릭 숫자가 SOT와 다름
- 새 minor 릴리스로 카테고리/명칭 변경
- CHANGELOG에 페이지 영역 관련 Fixed/Changed 항목 추가됨

## Anti-Deception Rule (CLAUDE.md §4c, anti-deception-checklist 스킬 backport)

| 위반 패턴 | 검출 방법 |
|---|---|
| 코드에 없는 함수/클래스 인용 | `grep -F "<symbol>" core/ plugins/` |
| 메트릭 placeholder ("XXX+", "수십 개") | regex `\b(XXX+|수십\s*개|some)\b` 검사 |
| 외부 패턴 출처 누락 | `(출처:` substring 카운트로 frontmatter `external_refs` 매칭 |
| frontier-comparison 페이지의 한쪽 일방 비교 | 좌우 횡 비교 표 형식 강제 |

## 본 문서 목적

이 checklist는 **공식 문서를 만든다는 행위가 코드에 거짓말을 추가하는 일이 되지 않도록**, 모든 작성·검증 단계에서 재현 가능한 grounding 절차를 박아둔다.
