---
title: Page Usage Measurement
type: meta
geode_version: 0.65.0
last_updated: 2026-05-02
status: design
---

# Page Usage Measurement — 어떤 docs 페이지가 *실제로 쓰이는가*

## 문제

71개 wiki 페이지 + 28개 portfolio 페이지. 모두를 매 minor 릴리스마다 갱신·검증하는 비용이 크다. 우선순위가 필요하다.

질문: **사용자가 실제로 *접근하는* 페이지는?**

## 데이터 소스 4개

### A. Portfolio 방문 통계 (외부 사용자)

Vercel Analytics / Google Analytics — `mangowhoiscloud.github.io/portfolio/geode/docs` 의 page view 카운트.

| 장점 | 단점 |
|---|---|
| 직접 외부 사용자 신호 | portfolio repo 인프라 필요 |
| 페이지별 정확한 카운트 | 28페이지에만 적용 (wiki 71페이지는 외부 비공개) |
| | 익명 — 어떤 사용자인지는 모름 |

### B. LangSmith trace 코드 경로 빈도 (내부 자동 신호)

LangSmith가 trace한 LLM 호출이 어느 코드 경로를 거쳤는지 → 그 경로의 wiki 페이지에 *간접* 사용 신호.

예시 매핑:
- trace에 `evaluate_eligibility` 호출 → [[credential-semantics]] 사용 신호
- trace에 `apply_messages_cache_control` → [[prompt-caching]]
- trace에 `manage_login` tool call → [[manage-login]]

| 장점 | 단점 |
|---|---|
| 간접 신호이지만 *실제 production usage* 반영 | 코드 경로 ↔ 페이지 매핑 manual |
| 사용자 가시 페이지 외에도 internal 페이지 점수 가능 | LangSmith API 호출 비용/quota |

### C. Wiki 자체 git access log

wiki 페이지를 *어떤 사용자/PR* 이 수정했는지 추적. 자주 수정 = 활발한 영역.

| 장점 | 단점 |
|---|---|
| 0 외부 인프라 | 사용자 *읽기* 신호 아님 (작성자 신호) |
| `git log` 만으로 즉시 | dead-but-stable 페이지 구별 못 함 |

### D. Search query (검색 신호)

만약 wiki에 검색 인덱스가 있으면 query log에서 신호 추출. 현재 mango-wiki는 검색 기능 검토 안 됨 → 보류.

## 결정 — B + C 조합

A는 portfolio 인프라 의존도 높고 wiki 71페이지에 적용 불가. D는 인프라 없음. 따라서:

- **B (LangSmith)** — production usage 신호
- **C (git log)** — 작성/유지보수 활발도 신호

두 신호를 합산해 페이지별 *priority score* 산출.

## Priority Score 공식

```
score = w1 * trace_hits_30d_normalized
      + w2 * git_commits_30d_normalized
      + w3 * cross_link_count_normalized
```

| 가중치 | 의미 |
|---|---|
| w1 = 0.6 | LangSmith trace 빈도 (실 usage) |
| w2 = 0.3 | 최근 30일 git 변경 빈도 |
| w3 = 0.1 | 다른 wiki 페이지에서 cross-link 받는 횟수 |

각 항목은 [0, 1] 정규화 후 가중합.

## 측정 스크립트 (`_meta/scripts/measure_page_usage.py`)

(다음 PR — LangSmith API 호출 부분은 user의 LANGSMITH_API_KEY 필요)

기본 골격:

```python
def measure():
    # 1. wiki 페이지 source-map.yml 에서 code_refs 추출
    # 2. LangSmith API: 각 code_ref의 함수명/모듈을 trace metadata에서 검색
    #    GET /runs?filter='contains(metadata.code_path, "core/auth/oauth_login")'
    # 3. git log --oneline --since=30.days.ago -- <wiki-path>
    # 4. cross-link count: grep '\\[\\[<page>\\]\\]' v0.65.0/ recursively
    # 5. 정규화 + 가중합 → page-priority.json 출력
```

## 산출물

```
_meta/page-priority.json
{
  "computed_at": "2026-05-02T...",
  "weights": {"trace_hits": 0.6, "git_commits": 0.3, "cross_links": 0.1},
  "pages": [
    {
      "path": "v0.65.0/04-harness/cli/manage-login.md",
      "priority": 0.92,
      "trace_hits_30d": 120,
      "git_commits_30d": 5,
      "cross_link_count": 8,
      "rank": 1
    },
    ...
  ]
}
```

## 활용

| 시나리오 | 액션 |
|---|---|
| top 10 페이지 | 매 minor 릴리스 *우선* 갱신 + portfolio 동기 |
| bottom 10 페이지 (priority < 0.1) | dead docs 후보 — 6개월 지속 시 archive 또는 통합 검토 |
| trace_hits=0 + cross_link=0 | 외부에서 안 쓰이고 내부에서도 link 안 됨 → 즉시 archive 후보 |
| git_commits 많은데 trace_hits 적음 | 작성자만 활발한 영역 — 외부 사용자 인지 부족 → portfolio 노출 강화 |

## v0.65.0 시점 한계

- LangSmith API 호출 부분 미구현 (user API key 필요)
- 대신: git_commits + cross_links 만으로 partial score 계산 가능
- 첫 minor 릴리스 후 LangSmith 데이터 1개월 누적되면 본격 측정

## 다음 단계

1. `measure_page_usage.py` 골격 구현 (git + cross-link 부분만 — LangSmith는 stub)
2. v0.66.0 릴리스 prep 시점 첫 산출 → 우선순위 기반 portfolio 동기
3. LangSmith client wrapper 완성 (별도 PR)
4. 결과를 `bump_minor.py` 에 통합 — 영향 page 후보를 priority 정렬로 노출
