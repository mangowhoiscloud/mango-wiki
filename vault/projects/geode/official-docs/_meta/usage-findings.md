---
title: GEODE Usage Findings (P10 데이터 기반)
type: meta
geode_version: 0.65.0
last_updated: 2026-05-02
status: analysis
---

# GEODE Usage Findings — Last 30d LangSmith Traces

## 측정 데이터 (`page-priority.json`)

100 trace sample / 30일 / `geode` LangSmith project.

## 강한 신호 (실제 사용)

| 도구 / 영역 | trace count | 페이지 |
|---|---|---|
| `AgenticLoop.run` + `._call_llm` | **100 turns / 80 LLM calls** | agentic-loop, prompt-system |
| `run_bash` | 24 | safety-tiers |
| `general_web_search` | 9 | tools/protocol |
| `read_document` | 8 | tools/protocol |
| `send_email` | 6 | tools/protocol |
| `glob_files` | 5 | tools/protocol |
| `web_fetch` | 4 | tools/protocol |
| `check_status` | 3 | lifecycle |
| `delegate_task` | 3 | orchestration |
| `grep_files` | 3 | tools/protocol |
| `write_file` | 2 | safety-tiers |
| `note_save`, `manage_login`, `memory_save` | 1-2 | (각각) |

## 약한 / 미사용 신호 (trace=0)

이 카테고리는 **두 가지 의미가 섞여 있음** — 진짜 미사용 vs LangSmith 측정 갭.

### 측정 갭 (실제로는 활성)

`outputs.model` 필드가 자주 비어 있음 → provider 자동 매핑 실패. 따라서 다음은 trace=0 으로 보이나 실제로는 활성:

- `runtime/llm/providers/anthropic.md` — 거의 모든 호출이 거치는데 model 필드 누락으로 카운트 안 됨
- `runtime/llm/providers/openai-codex.md` — Plus quota 활성 사용자인데 미카운트
- `prompt-caching.md`, `prompt-hashing.md` — 모든 LLM 호출에 작용하나 metadata 부재

→ **개선 1**: `core/llm/providers/*.py` 의 LangSmith 콜백에서 `model_id`, `provider`, `prompt_hash` 메타데이터 명시 주입 필요.

### 실제 미사용 / 비활성

다음은 30일 trace 0 + 코드 grep으로도 호출 흔적 미발견:

| 영역 | 페이지 | 이유 후보 |
|---|---|---|
| GLM provider | `glm.md` | 사용자가 GLM 가입 안 함 / Plus + Anthropic 만 사용 |
| OpenAI PAYG | `openai-payg.md` | Plus quota로 충분, PAYG 미등록 |
| Computer use | `computer-use.md` | dangerous — 의도적 회피 |
| Scheduler | `scheduler.md` | 사용자가 스케줄 등록 안 함 |
| Domains | `domains.md` (외 game_ip) | 추가 도메인 plugin 없음 |
| Cross-LLM verification | `cross-llm.md` | --cross-verify 플래그 미사용 |

## 의사결정 분기 3개

### A. 측정 정확도 개선 (Quick win)

`core/llm/providers/*.py` 어댑터에서 LangSmith trace에 다음 metadata 명시 주입:

```python
@traceable(name="...", run_type="llm",
           metadata={"provider": "anthropic", "model": model_id,
                     "prompt_hash": prompt_hash})
def _call_llm(...):
    ...
```

이러면 다음 30일 측정에서 provider별 페이지 정확한 trace count 확보.

비용: ~30분 (3-4 어댑터 + 테스트).
이득: P10 데이터 정확도 + 다음 minor 우선순위 결정 신뢰도.

### B. 미사용 기능 정리 (의도적)

Computer use, Scheduler, Cross-LLM, Domains 중 **사용자가 활용 의향 없는** 기능:
- 코드 archive/experimental 이동
- 또는 documentation에 "현재 미사용" 명시 + 활성화 가이드 추가

비용: 어떤 기능을 archive할지 사용자 결정 필요.
이득: 코드 surface area 감소, 유지보수 부담 ↓.

### C. 미사용 기능 활용 boost (반대 방향)

같은 미사용 기능을 *사용자가 모르고 있을 가능성*:
- Computer use → "geode가 Mac/iPhone 자동화 가능" 마케팅
- Scheduler → "/task daily 9am ..." 데모
- GLM → 비용 절감 가이드
- Cross-LLM → calibration 신뢰도 향상

비용: 사용자 가이드/예제 작성.
이득: 사용자 경험 확장, ROI 검증.

## 권장 (개인 판단)

1. **A 우선 실행** — 측정 정확도가 미흡한 채로 B/C 결정하면 잘못된 결론 가능.
2. 1개월 후 정확한 데이터로 B/C 의사결정.
3. 그동안 사용자가 명시 의향 표명한 기능에 한해 C 진행 (e.g. "스케줄러 좀 써보자").

## 미해결 질문

| 질문 | 답변 출처 |
|---|---|
| 사용자가 의도적으로 회피하는 도구는? | 사용자 직접 |
| 기존 "사용 안 하지만 향후 쓸" 의도는? | 사용자 직접 |
| LangSmith trace 메타 강화 PR 진행할까? | 결정 필요 |

## 다음

- 사용자 결정 → A / B / C 중 선택 → 별도 PR
- A 진행 시: `core/llm/providers/{anthropic,codex,openai,glm}.py` 4 파일 + 테스트
