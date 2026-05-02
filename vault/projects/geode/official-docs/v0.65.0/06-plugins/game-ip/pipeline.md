---
title: Game IP Pipeline
category: plugins-game-ip
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "plugins/game_ip/"
  - "plugins/game_ip/nodes/"
  - "core/graph.py"
external_refs:
---

# Game IP Pipeline

`plugins/game_ip/` — Game IP 분석 파이프라인 참고 구현.

## 흐름 (StateGraph 노드)

```
START → router → signals → analysts(×4 Send) → evaluators(×3 Send)
      → scoring → verification → synthesizer → END
```

자세한 토폴로지는 [[data-flow]].

## 노드별 책임

### router (`nodes/router.py`)

입력 IP 이름 검증 + state 초기화. fixture 매칭 시 fixture 로드, 없으면 라이브 신호 수집 모드.

### signals (`nodes/signals.py`)

외부 신호 수집:

| 신호 | 출처 | 도구 |
|---|---|---|
| YouTube views | YouTube Data API | `youtube_search` tool |
| Reddit subscribers | reddit api | `reddit_sentiment` tool |
| Steam metrics | SteamSpy | `steam_info` tool |
| Google Trends | trends.google | `google_trends` tool |
| 일반 search | DDG / web | `general_web_search` |

dry-run 모드에서는 fixture에서 dummy 데이터 로드.

### analysts (4종, Send 병렬)

| Analyst | 분석 영역 |
|---|---|
| `game_mechanics` | 게임 메커니즘, 전투/탐험/루프 |
| `player_experience` | 플레이어 경험, 스토리, 몰입 |
| `growth_potential` | 성장 잠재력, 시장 사이즈 |
| `discovery` | 발견 가능성, 인지도 |

각 analyst는 14-axis rubric 중 자신의 focus axes에 점수 (1-5) + reasoning.

### evaluators (3종, Send 병렬)

| Evaluator | 평가 |
|---|---|
| `quality_judge` | 코어 품질 합산 (gameplay, polish, narrative) |
| `hidden_value` | 저평가 가치 (IP 파워 vs 현재 노출) |
| `community_momentum` | 팬덤 성장세 (정량 + 정성) |

각 evaluator는 자신의 axes 부분집합 + composite [0,100].

### scoring (`nodes/scoring.py`)

PSM (Propensity Score Matching) 엔진. 자세한 룰은 [[psm-scoring]].

### verification

[[guardrails-g1-g4]] G1-G4 + [[biasbuster]] + 옵션 [[cross-llm]].

### synthesizer (`nodes/synthesizer.py`)

cause classification ([[decision-tree]]) + action 매핑 + 최종 reasoning 생성.

## 입력 / 출력

```python
# 입력
state = {
    "target": "Cowboy Bebop",
    "mode": "full_pipeline",  # dry_run / evaluation / scoring
}

# 출력
result = {
    "tier": "A",
    "final_score": 68.4,
    "cause": "undermarketed",
    "action": "Marketing Boost",
    "subscores": {
        "exposure_lift": 18.5,
        "quality": 14.2,
        ...
    },
    "psm": {
        "att": 0.312,
        "z_value": 2.67,
        "gamma": 1.8,
    },
    "verification": {
        "guardrails": {"g1": True, "g2": True, "g3": True, "g4": True},
        "biasbuster": {"clean": True},
    },
    "audit_trail": [...],
}
```

## 3 fixture 결과

| IP | Tier | Score | Cause |
|---|---|---|---|
| Berserk | S | 81.2 | conversion_failure |
| Cowboy Bebop | A | 68.4 | undermarketed |
| Ghost in the Shell | B | 51.7 | discovery_failure |

이 분포는 의도적으로 Tier 별 1개씩 — 회귀 테스트의 anchor.

## 다음

- [[analysts-evaluators]] — 4 analysts + 3 evaluators 디테일
- [[psm-scoring]] — PSM 엔진
- [[domain-port-protocol]] — 코어 ↔ 도메인 인터페이스
