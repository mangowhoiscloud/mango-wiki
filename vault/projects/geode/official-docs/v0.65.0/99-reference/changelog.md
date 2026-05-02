---
title: CHANGELOG (Versioned)
category: reference
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "CHANGELOG.md"
external_refs:
  - url: "https://keepachangelog.com/"
    pattern: "Keep a Changelog format"
  - url: "https://semver.org/"
    pattern: "Semantic Versioning"
---

# CHANGELOG (Versioned)

GEODE는 [Keep a Changelog](https://keepachangelog.com/) format + [Semantic Versioning](https://semver.org/) 을 따른다. 각 release 는 main 브랜치의 develop→main PR 머지 시점에 확정.

## Granularity

**Feature-level, not commit-level**. 하나의 논리적 변경 → 한 entry. R1-R8 같은 코드 품질 패스나 merge commit, 문서만 변경은 CHANGELOG 제외.

## 카테고리

| 카테고리 | 의미 |
|---|---|
| `### Added` | 새 기능, 새 모듈 |
| `### Changed` | breaking change (사용자 영향 있는 변경) |
| `### Fixed` | 버그 수정 |
| `### Removed` | 삭제된 기능 |
| `### Infrastructure` | CI / 빌드 / 의존성 |
| `### Architecture` | 구조 결정 (이전 버전과 다른 패턴 채택) |
| `### Documentation` | 사용자 가시 문서 (사소한 typo 제외) |
| `### Reference` | 결정 배경, 외부 출처, 사용자 direction 인용 |

## v0.65.0 — 2026-05-02

### Fixed

- **`manage_login` verdict 표시가 PROVIDER_MISMATCH 로 덮어쓰기 되던 결함.** `core/cli/tool_handlers.py:handle_manage_login` 의 verdict 집계 루프가 dict 키 `(name, profile.provider)` 로 마지막 set-iter prov의 mismatch verdict가 real verdict를 덮어씌움. 마지막 prov가 다른 provider이면 모든 healthy profile이 `eligible=False / provider_mismatch` 로 LLM/대시보드에 표시되었음. 실제 `resolve_routing` 은 equivalence-class fallback으로 그 키들을 정상 사용함 — 보고만 잘못 — 이라 사용자에게 잘못된 자기 진단 전달. Fix: `if v.reason is ProfileRejectReason.PROVIDER_MISMATCH: continue` 필터 추가, `core/auth/credential_breadcrumb.format` 의 v0.51.0 부터의 동일 필터와 일관성 회복. 회귀 테스트 `tests/test_manage_login_tool.py::TestVerdictPerOwnProvider` (3 provider × 3 profile 등록 시 어느 것도 provider_mismatch로 보고되지 않아야 함). (PR #866)

### Added

- **Messages-level cache_control breakpoints in Anthropic agentic adapter (Hermes `system_and_3` parity).** `apply_messages_cache_control(messages, n_breakpoints=3)` helper 신설 — Anthropic 4-슬롯 캐시 한도에서 system block(2 슬롯) 외 마지막 3개 message에도 `cache_control: {"type": "ephemeral"}` 마킹. 다중 turn agentic loop의 message 히스토리 토큰 비용 절감. `MAX_MESSAGE_CACHE_BREAKPOINTS = 3` 상수 export. 테스트 19 케이스 (`tests/test_anthropic_messages_cache.py`). (PR #864, `core/llm/providers/anthropic.py:172-228`)

## v0.64.0 — 2026-04-29

### Changed

- **Game IP domain → `plugins/` namespace**. `core/domains/game_ip/` → `plugins/game_ip/` (12 modules + 220 files). 72 import statements rewritten. Hatchling wheel ships both `core/` + `plugins/`. Quality gates 확장 (`ruff check core/ tests/ plugins/`, `mypy core/ plugins/`). E2E A(68.4) 유지. (`plugins/game_ip/*`, `core/domains/loader.py`)

### Added

- D-3 Experimental modules parking lot (`experimental/`)
- D-2 Research notes commit + personal-report gitignore

## v0.63.0 — 2026-04-29

### Added

- D-1 Lifecycle command suite (`/stop`, `/clean`, `/uninstall`, extended `/status`)
- 9 new path constants in `core/paths.py`
- `tests/test_lifecycle_commands.py` (30 invariants)

## (이하 v0.62.0 이전 — `CHANGELOG.md` 참조)

> 본 wiki 페이지는 v0.65.0 시점 SOT 미러. v0.66.0 발표 시 본 페이지를 archive로 이동, 새 v0.66.0 페이지 생성.

## 관련 룰 (CANNOT)

- `[Unreleased]` 채로 main 도달 금지 (CLAUDE.md:101)
- 4-loc 버전 미스매치 금지 (CLAUDE.md:102)
- code commit에 CHANGELOG 누락 금지 (CLAUDE.md:100)

## 다음

- [[version-policy]] — Versioning 룰
