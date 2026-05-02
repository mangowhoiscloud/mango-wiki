---
title: Portfolio Sync Decision
type: meta
geode_version: 0.65.0
last_updated: 2026-05-02
status: decided
---

# Portfolio Site ↔ Wiki SOT Sync Decision

## Context

| Surface | 위치 | 페이지 수 | 형식 | 언어 |
|---|---|---|---|---|
| **Wiki SOT** | `mango-wiki/vault/projects/geode/official-docs/` | 71 | Markdown + frontmatter | 한국어 (식별자 영문) |
| **Portfolio Live** | `portfolio/src/app/geode/docs/` | 28 | Next.js TSX (App Router) | 한/영 bilingual |
| **Sitemap SOT** | `portfolio/src/lib/geode-docs/sitemap.ts` | — | TypeScript const | 한/영 |

두 매체는 *대상이 다르다*:
- **Wiki**: 개발자/컨트리뷰터용 깊은 SOT. 코드 인용 위주. 한국어.
- **Portfolio**: 외부 노출용 큐레이트 highlight. 마케팅성 영문 + 한글 병기. 28p로 압축.

따라서 wiki ⊃ portfolio 관계 — wiki는 portfolio 콘텐츠 *전체* 를 포함하되 더 많이 보유.

## 현재 drift

portfolio `page.tsx` (헤더):
```
v0.64.0, 4379 tests, 58 hooks, 57 tools
```

main repo (v0.65.0 머지 후):
```
v0.65.0, 4380+ tests, 58 hooks, (tools 수치 미측정)
```

→ **3개 메트릭 stale**.

또한 wiki에 있고 portfolio에 없는 핵심 페이지:
- `manage-login.md` — v0.65.0 fix story
- `credential-semantics.md` / `oauth-flow.md` / `plan-registry.md` — auth 분리
- `frontier-comparison.md` — 6축 가로 비교
- 개별 provider 페이지 (anthropic / openai-codex / glm / openai-payg / fallback-rotation)
- developer-guide 5개 (workflow / socratic-gate / verification-team / contributing / testing)
- operations 5개 (slack-gateway / debugging / faq / troubleshooting / env-vars)
- skills 3개 + plugins/building-a-plugin

## 4 옵션 비교

### Option A — Full automation (wiki .md → MDX → Next.js)

Wiki 페이지를 SOT로 두고 portfolio는 빌드 단계에서 .md → MDX 컴파일.

| 장점 | 단점 |
|---|---|
| 단일 SOT | Wiki는 한글 only, portfolio는 한/영 → 영문 번역 자동화 별도 필요 |
| 0 drift | 71페이지 모두 portfolio 노출 = 외부 사이트 정보 과잉 |
| | `[[wikilink]]` ↔ Next.js `<Link>` 변환 필요 |
| | DocsShell + Bi 컴포넌트 wrapping 자동화 복잡 |
| 구현 비용 | **HIGH (10-20h)** |

### Option B — Manual sync per release with checklist

Wiki = 마스터 SOT, portfolio = 큐레이트 subset. 매 minor 릴리스마다 체크리스트로 수동 동기.

| 장점 | 단점 |
|---|---|
| 영문 번역 품질 유지 | 매 릴리스 1-2시간 작업 |
| portfolio 정보 양 통제 | drift 위험 (체크리스트 누락 시) |
| 0 추가 인프라 | |
| 구현 비용 | **LOW (1h: checklist 작성)** |

### Option C — One-time bootstrap, then drift

Wiki만 유지, portfolio는 freeze.

| 장점 | 단점 |
|---|---|
| 0 maintenance | 외부 사용자가 잘못된 정보 받음 |
| | portfolio가 사용자 신뢰도 낮춤 |
| 구현 비용 | **0** |

### Option D — Hybrid (drift detector + checklist)

Wiki = SOT, portfolio = 큐레이트. 자동 drift detector + 수동 체크리스트.

| 장점 | 단점 |
|---|---|
| drift 자동 검출 | 동기 자체는 수동 |
| portfolio 영문 번역 품질 유지 | drift detector 도구 유지보수 |
| 영역 별 SOT 분리 | |
| 구현 비용 | **MEDIUM (3-4h)** |

## 결정 — Option D (Hybrid)

**근거**:
- portfolio의 *큐레이트* 가치 유지 (28페이지 polish)
- 영문 번역은 *수동* — Claude로 자동 번역 시 톤 manner 차이로 portfolio brand 깨질 수 있음
- drift는 자동 검출 (LangGraph trace의 prompt_hash 패턴 차용)
- 매 릴리스 체크리스트로 일관성 강제

**Components**:

1. `_meta/portfolio-sync-checklist.md` — 매 minor 릴리스 동기 절차
2. `_meta/scripts/detect_portfolio_drift.py` — wiki ↔ portfolio drift 검출
3. `_meta/portfolio-mapping.yml` — wiki page ↔ portfolio TSX 매핑 SOT
4. (옵션) `_meta/scripts/render_portfolio_link.py` — wiki 페이지에 "see portfolio" 링크 자동 주입

## 매핑 정책

| Wiki 페이지 | Portfolio 매핑 |
|---|---|
| `00-overview/what-is-geode` | `docs/page.tsx` (index) |
| `01-getting-started/quickstart` | `docs/quick-start/page.tsx` |
| `02-architecture/4-layer-stack` | `docs/architecture/overview/page.tsx` |
| `02-architecture/agentic-loop` | `docs/architecture/agentic-loop/page.tsx` |
| `02-architecture/system-index` | `docs/architecture/system-index/page.tsx` |
| `03-runtime/llm/prompt-system` | `docs/runtime/llm/prompt-system/page.tsx` |
| `03-runtime/llm/providers/*` | `docs/runtime/llm/providers/page.tsx` (5 → 1 통합) |
| `03-runtime/auth/*` | `docs/runtime/auth/page.tsx` (4 → 1 통합) |
| ... | ... |
| **wiki에만 있는 신규** | (옵션: portfolio에 추가하거나 wiki-only 유지) |

자세한 매핑은 [[portfolio-mapping.yml]] 참조.

## 책임 분담

- **Wiki**: 내가 (개발자) 매 PR에서 grounding 동반 갱신
- **Portfolio**: 매 minor 릴리스 시점 manual 동기 (체크리스트 따라)
- **Drift detector**: CI 또는 release prep 시점 자동 실행

## 다음

- [[portfolio-sync-checklist.md]]
- `_meta/scripts/detect_portfolio_drift.py`
- `_meta/portfolio-mapping.yml`
