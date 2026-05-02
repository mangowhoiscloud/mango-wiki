---
title: First Analysis (Cowboy Bebop dry-run)
category: getting-started
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "plugins/game_ip/adapter.py"
  - "plugins/game_ip/fixtures/"
  - "core/graph.py"
external_refs:
---

# First Analysis (Cowboy Bebop dry-run)

GEODE의 도메인 파이프라인을 LLM 호출 없이 *완전히* 실행하는 dry-run. 설치 검증 + 흐름 이해에 최적.

## 명령

```bash
uv run geode analyze "Cowboy Bebop" --dry-run
```

`--dry-run` 플래그:
- LLM 호출 skip — fixture에 박힌 dummy responses 사용
- 모든 노드 (router → signals → analysts → evaluators → scoring → verification → synthesizer) 정상 실행
- 결과는 결정적 (같은 fixture → 같은 점수)

## 출력 (요약)

```
▸ [SCORE] PSM + Final Calculation
  PSM: ATT=+31.2% | Z=2.67 (✓>1.645) | Γ=1.8 (✓≤2.0)
  Final Score: ███████████████████████████░░░░░░░░░░░░░ 68.4/100

▸ [VERIFY] Guardrails G1-G4 ✓ | BiasBuster ✓

╭───── RESULT ─────╮
│  A | 68.4 pts | undermarketed                                 │
│  Target: SF Action RPG users (25-40, Explorer/Killer)         │
│  Recommended Action: Marketing Boost                          │
╰───────────────────────────────────────────────────────────────╯
```

## 의미

| 라벨 | 의미 |
|---|---|
| `A | 68.4` | Tier A (60-79 score range) |
| `undermarketed` | 6 cause 중 하나 — IP 파워 대비 마케팅/노출 부족 |
| `Marketing Boost` | 5 actions 중 매핑된 추천 |
| `ATT=+31.2%` | Average Treatment Effect (PSM) — 마케팅 boost 시 +31% lift 추정 |
| `Z=2.67` | 통계 유의성 (>1.645 = 95%) |
| `Γ=1.8` | Rosenbaum sensitivity (≤2.0 = causal robustness) |

자세한 룰은 [[psm-scoring]], [[decision-tree]].

## 3개 fixture 결과 비교

`plugins/game_ip/fixtures/` 에 박힌 IP 3개 — tier 분포가 명확:

| IP | Tier | Score | Cause |
|---|---|---|---|
| Berserk | **S** | 81.2 | conversion_failure |
| Cowboy Bebop | **A** | 68.4 | undermarketed |
| Ghost in the Shell | **B** | 51.7 | discovery_failure |

각 fixture는 [[pipeline]] 의 입력 데이터.

## 다른 IP 분석

```bash
uv run geode analyze "Berserk" --dry-run         # S (81.2)
uv run geode analyze "Ghost in the Shell" --dry-run  # B (51.7)
```

fixture에 없는 IP를 dry-run하면 default fallback fixture로 실행 (테스트 용도).

## 실제 LLM 호출

```bash
uv run geode analyze "Cowboy Bebop"                 # 기본 모델
uv run geode analyze "Cowboy Bebop" --verbose       # 노드별 LLM 출력 표시
```

LLM 호출 시 인증 필요 ([[manage-login]]). 비용 발생.

## E2E 검증 도구로의 활용

`uv run geode analyze "Cowboy Bebop" --dry-run` → A (68.4) 는 GEODE 코어의 E2E 회귀 검증 anchor (CLAUDE.md Quality Gates). 결과가 변하면 파이프라인 변경 의심.

## 다음

- [[pipeline]] — Game IP 파이프라인
- [[psm-scoring]] — PSM 메커니즘
- [[guardrails-g1-g4]] — 검증 게이트
