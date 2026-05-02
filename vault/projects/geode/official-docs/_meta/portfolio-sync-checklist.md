---
title: Portfolio Sync Checklist (per minor release)
type: meta
geode_version: 0.65.0
last_updated: 2026-05-02
---

# Portfolio Sync Checklist

매 minor 릴리스 후 1-2시간 작업. wiki 변경 → portfolio TSX 반영.

## 사전

- [ ] wiki에서 새 minor 디렉터리 생성 (e.g. `cp -r v0.65.0 v0.66.0`)
- [ ] `_meta/version.json` current 갱신
- [ ] `verify_refs.py` failures 0 확인
- [ ] `detect_portfolio_drift.py` 실행 → drift list 출력

## Step 1 — 메트릭 갱신 (5분)

`portfolio/src/app/geode/docs/page.tsx`:

```tsx
summary="A general-purpose autonomous execution agent built on LangGraph. v<X.Y.Z>, Python 3.12+, <CORE> core + <PLUGINS> plugins, <TESTS> tests, <HOOKS> hooks, <TOOLS> tools."
summaryKo="LangGraph 기반 범용 자율 실행 에이전트. v<X.Y.Z>, Python 3.12+, core <CORE> + plugins <PLUGINS>, <TESTS> 테스트, <HOOKS> 훅, <TOOLS> 도구."
```

값 측정:
- [ ] `<CORE>` = `find core/ -name "*.py" | wc -l`
- [ ] `<PLUGINS>` = `find plugins/ -name "*.py" | wc -l`
- [ ] `<TESTS>` = `uv run pytest tests/ -m "not live" --collect-only -q | tail -1`
- [ ] `<HOOKS>` = `core/hooks/system.py:HookEvent` enum 카운트
- [ ] `<TOOLS>` = `core/tools/definitions.json` array length

## Step 2 — Mapping 1:1 페이지 갱신

`_meta/portfolio-mapping.yml` 의 `mode: 1:1` 항목 (~21개) 각각:

- [ ] wiki `<page>.md` → portfolio `<slug>/page.tsx` 비교
- [ ] DocsShell summary / summaryKo 갱신 (필요 시)
- [ ] Bi 블록 본문 동기 (한/영)
- [ ] 코드 인용 / 메트릭 갱신
- [ ] cross-link href 검증 (slug 경로 변경 없는지)

## Step 3 — Merged 페이지 갱신

`mode: merged` 페이지 (e.g. providers 5→1, auth 4→1):

- [ ] portfolio 단일 페이지에서 wiki 5(또는 4)개 페이지의 핵심 컨텐츠를 섹션으로 분할 표현
- [ ] 각 섹션 끝에 wiki 풀 SOT 링크: "자세한 내용: [Wiki: ...]"

## Step 4 — wiki-only 페이지 처리

`mode: wiki-only` (~31개) — 아무것도 안 함. wiki SOT만 유지.

단, 다음 페이지는 *portfolio 추가 검토 권장*:
- `00-overview/frontier-comparison.md` (외부 노출 가치 큼)
- `04-harness/cli/manage-login.md` (v0.65.0 fix story)
- `99-reference/glossary.md` (사용자 편의)

## Step 5 — Sitemap 갱신 (필요 시)

`portfolio/src/lib/geode-docs/sitemap.ts`:

- [ ] 신규 페이지 추가 시 DOCS_SITEMAP에 entry 추가
- [ ] 페이지 제목 / summary 갱신
- [ ] 섹션 재배열 (필요 시)

## Step 6 — 빌드 검증

```bash
cd /Users/mango/workspace/portfolio
npm run build
# 또는 pnpm/bun
```

- [ ] 빌드 성공
- [ ] 페이지 렌더 검증 (`npm run dev` 후 `localhost:3000/geode/docs` 방문)
- [ ] 깨진 링크 없음
- [ ] 한/영 토글 정상 동작

## Step 7 — Drift detector 재실행

```bash
python3 mango-wiki/vault/projects/geode/official-docs/_meta/scripts/detect_portfolio_drift.py
```

- [ ] drift count = 0 또는 의도된 wiki-only 만 남음

## Step 8 — Commit

| Repo | Commit message |
|---|---|
| portfolio | `docs(geode): sync v<X.Y.Z> from wiki — <N> pages updated` |
| mango-wiki | `docs(geode): portfolio sync v<X.Y.Z> 완료 — drift 0` |

## Step 9 — Deploy (portfolio)

`portfolio` repo는 GitHub Pages or Vercel 배포 — main push 시 자동.

## Step 10 — Outdated wiki 페이지 갱신

`detect_portfolio_drift.py` 결과로 *반대 방향* drift도 검출:
- portfolio가 wiki보다 최신인 부분 (드물지만 가능)
- → 해당 wiki 페이지 `last_grounded` 갱신 + 본문 sync

---

## 매 PR 시점 (minor 릴리스 외)

- 코드 변경이 wiki에 영향 → wiki 갱신
- portfolio sync는 *연기* (다음 minor 시점에 일괄)

> 예외: 사용자 가시 마케팅 콘텐츠 변경 (예: front page metric) 은 wiki + portfolio 양쪽 PR.

## 다음

- [[portfolio-sync-decision]] — 결정 배경
- [[portfolio-mapping.yml]] — 페이지 매핑
- `_meta/scripts/detect_portfolio_drift.py` — drift detector
