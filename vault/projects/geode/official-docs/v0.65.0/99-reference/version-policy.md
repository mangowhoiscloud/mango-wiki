---
title: Version Policy
category: reference
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "CLAUDE.md:244"
external_refs:
  - url: "https://semver.org/"
    pattern: "SemVer 2.0.0"
---

# Version Policy

GEODE는 [Semantic Versioning 2.0.0](https://semver.org/) 을 따른다.

## 트리거 (`CLAUDE.md:244`)

| 변경 종류 | 버전 bump |
|---|---|
| 새 feature 추가 (Added) | **MINOR** (0.X.0) |
| breaking change (Changed) | **MAJOR** (X.0.0) — 0.x 시기엔 MINOR로 운영 |
| bug fix (Fixed) | **PATCH** (0.0.X) |
| Documentation only | none |
| Refactor (사용자 비가시) | none |

## 0.x 시기 운영 (현재)

GEODE는 아직 0.x 메이저 버전. SemVer 룰에 따라 0.x 에서는 MAJOR가 의미를 갖지 않으며, MINOR가 사실상 breaking 가능성을 가질 수 있는 단위다. v1.0.0 도달 전까지는:

- **MINOR (0.X.0) 사용** — 모든 새 기능 + 일부 breaking 가능
- **PATCH (0.X.Y) 사용** — bug fix only

## 4-Location 동기

릴리스마다 4 위치를 *동시에* 갱신:

| 파일 | 위치 |
|---|---|
| `pyproject.toml` | line 3 — `version = "0.65.0"` |
| `CLAUDE.md` | "**Version**: 0.65.0" |
| `README.md` | "GEODE v0.65.0 — Long-running …" 헤더 |
| `README.ko.md` | 동일 헤더 |
| `CHANGELOG.md` | `[Unreleased]` → `[0.65.0] — YYYY-MM-DD` 으로 변환 |

추가:
- `uv.lock` 의 self-package geode 항목 (자동 추격, `uv sync` 실행 후 commit)

## Wiki 버저닝 (이 SOT 디렉터리)

`vault/projects/geode/official-docs/_meta/version.json`:

```json
{
  "current": "0.65.0",
  "supported": ["0.65.0"],
  "frozen": [],
  "release_history": [...]
}
```

새 minor 릴리스 시:

```bash
cd official-docs
cp -r v0.65.0 v0.66.0
# diff 기반 업데이트
# version.json.current = "0.66.0", v0.65.0 이동 결정
```

`frozen` 배열에 push된 버전은 `archive/` 로 이동.

## Breaking Change 처리

API/CLI/스키마에 breaking 변경 시:

1. CHANGELOG.md `### Changed` 에 명시 + 마이그레이션 가이드 링크
2. `vX.Y.Z/migration/from-prev.md` 페이지 작성
3. 사용자에게 영향 가는 deprecation은 최소 1 minor 전에 deprecation warning 추가

## 다음

- [[changelog]] — 변경 이력
