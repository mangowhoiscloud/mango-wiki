---
title: GEODE Official Docs (mango-wiki SOT)
category: project
tags: [geode, docs, sot, versioned]
created: 2026-05-02
updated: 2026-05-02
geode_current_version: 0.65.0
status: scaffolding
---

# GEODE Official Docs — mango-wiki SOT

mango-wiki 산하 GEODE 공식 문서의 **소스 오브 트루스(SOT)**. portfolio 라이브 사이트(`mangowhoiscloud.github.io/portfolio/geode/docs`)와 외부 공식 문서는 이 디렉터리에서 파생된다.

## 디렉터리 구조

```
official-docs/
├── README.md            ← 이 파일 (SOT 정책)
├── _meta/               ← 버전 매니페스트, 출처 매핑, 그라운딩 룰
│   ├── version.json
│   ├── source-map.yml
│   └── grounding-checklist.md
├── v0.65.0/             ← 현재 활성 버전
│   ├── 00-overview/
│   ├── 01-getting-started/
│   ├── 02-architecture/
│   ├── 03-runtime/
│   ├── 04-harness/
│   ├── 05-verification/
│   ├── 06-plugins/
│   ├── 07-skills/
│   ├── 08-developer-guide/
│   ├── 09-operations/
│   └── 99-reference/
└── archive/             ← frozen 버전 보관소 (예: archive/v0.65.0/ 이동)
```

## 버저닝 정책

- **활성 버전**: `_meta/version.json`의 `current` 필드 = 코드베이스 `pyproject.toml` 버전
- **새 minor 릴리스**: `cp -r v0.65.0 v0.66.0` → diff 기반 업데이트 → `version.json.current` 갱신
- **frozen**: `version.json.frozen` 배열 push → 디렉터리는 `archive/`로 이동
- **migration**: breaking 변경 시 `vX.Y.Z/migration/from-prev.md` 작성
- 각 페이지 frontmatter:
  ```yaml
  geode_version: 0.65.0
  last_grounded: 2026-05-02
  code_refs:
    - "core/cli/tool_handlers.py:882-955"
  external_refs:
    - "https://docs.openclaw.ai/concepts/architecture.md"
  ```

## 그라운딩 룰

자세한 절차는 `_meta/grounding-checklist.md`. 요약:

1. **명칭/숫자/메트릭은 모두 코드 또는 CHANGELOG 인용**
2. **Explore 에이전트로 SOT 검증** 후 페이지 작성
3. **Zero-context cross-check** — 별도 에이전트가 페이지+diff 보고 omission/stub 판정
4. **outdated 트리거**: 코드/CHANGELOG 변경 시 `last_grounded` 만료 → 재검증

## portfolio 라이브 사이트와의 관계

현재(v0.65.0): mango-wiki가 마스터, portfolio 라이브 페이지(28p)는 별도 유지. 동기 자동화 여부는 **별도 의사결정** (`_meta/portfolio-sync-decision.md` 추후 작성).

## 작성 워크플로우

1. **P1** — 스캐폴드 (디렉터리 + frontmatter stub) ← 현재
2. **P2** — `source-map.yml` 채움 (영역별 Explore 결과 정리)
3. **P3-P5** — 본문 작성 (Keep / Expand / Add)
4. **P6** — verification-team cross-check
5. **P7** — portfolio 동기 의사결정

## 카테고리 별 페이지 수 (목표 v0.65.0)

| 디렉터리 | 페이지 | 분류 |
|---|---|---|
| 00-overview | 3 | Keep |
| 01-getting-started | 4 | Expand |
| 02-architecture | 5 | Keep+Expand |
| 03-runtime | 24 | Keep+Expand |
| 04-harness | 8 | Keep+Expand |
| 05-verification | 4 | Keep+Add |
| 06-plugins | 6 | Keep+Add |
| 07-skills | 3 | Add |
| 08-developer-guide | 5 | Add |
| 09-operations | 5 | Add |
| 99-reference | 4 | Keep |
| **합계** | **71** | — |
