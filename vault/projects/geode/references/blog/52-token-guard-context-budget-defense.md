---
title: "Token Guard — 에이전트의 컨텍스트 예산을 지키는 3중 방어"
type: reference
category: blog-post
tags: [blog, memory-context]
source: "blog/posts/memory-context/52-token-guard-context-budget-defense.md"
created: 2026-04-08T00:00:00Z
---

# Token Guard — 에이전트의 컨텍스트 예산을 지키는 3중 방어

> Opus 4.6의 컨텍스트 윈도우는 1백만 토큰입니다.
> "충분하니까 관리할 필요 없다"고 생각하면,
> web_fetch 한 번이 50,000자를 쏟아내고 에이전트가 멈춥니다.
> 이 글은 GEODE가 컨텍스트 예산을 지키기 위해 구축한
> 3중 방어 체계를 기록합니다.

> Date: 2026-03-23 | Author: geode-team | Tags: context-window, token-guard, overflow, pruning, budget, agentic-loop

---

## 목차

1. 도입: 1백만 토큰이면 충분한가
2. 방어 체계 전체 구조
3. 1차 방어 — 입구 차단: web_fetch hardcap
4. 2차 방어 — 감시: ContextMonitor 이중 임계치
5. 3차 방어 — 긴급 대응: Emergency Prune
6. 서버사이드 위임: clear_tool_uses
7. 컨텍스트 예산 배분: ContextAssembler
8. 프론티어 비교와 설계 결정
9. 마무리

---

## 1. 도입: 1백만 토큰이면 충분한가

Opus 4.6의 컨텍스트 윈도우는 1,000,000 토큰입니다. 한국어 기준으로 약 50만 글자, A4 용지 1,000장 분량입니다. "절대 넘지 않을 것"이라고 생각하기 쉽습니다.

하지만 에이전트는 사람과 다릅니다. 사람은 웹 페이지를 읽을 때 필요한 부분만 눈으로 스캔하지만, 에이전트는 **전체 텍스트를 컨텍스트에 넣습니다**. web_fetch로 긴 문서를 가져오면 50,000자가 한 번에 들어옵니다. 도구를 10번 호출하면 각 결과가 누적됩니다. 분석 파이프라인을 돌리면 4개 Analyst가 각각 수천 토큰의 결과를 생성합니다.

실제로 GEODE에서 발생한 사고입니다:

```
[Turn 12] web_fetch("https://store.steampowered.com/app/...")
          → 48,000자 HTML 전문
[Turn 15] web_fetch("https://reddit.com/r/gaming/...")
          → 35,000자 스레드 전문
[Turn 18] Analyst×4 결과 누적
          → context 사용률 87%
[Turn 20] LLM 응답 생성 실패
          → API error: context_length_exceeded
```

1백만 토큰은 크지만, 무한하지 않습니다. 에이전트가 자율적으로 도구를 호출하면 **예측할 수 없는 속도로** 컨텍스트가 채워집니다. 예산 관리 없이는 언제든 넘칠 수 있습니다.

---

## 2. 방어 체계 전체 구조

GEODE의 컨텍스트 방어는 3중으로 구성됩니다. 각 레이어가 서로 다른 시점에서 서로 다른 위협을 차단합니다.

```
도구 호출 결과
    │
    ▼
┌───────────────────────────┐
│ 1차: 입구 차단              │  web_fetch hardcap 10,000자
│     (도구 실행 시점)        │  단일 결과가 예산을 잡아먹지 않게
└───────────┬───────────────┘
            │
            ▼
┌───────────────────────────┐
│ 2차: 감시                   │  ContextMonitor
│     (매 턴 시작 시점)       │  80% WARNING → 로깅
│                             │  95% CRITICAL → 긴급 대응
└───────────┬───────────────┘
            │ 95% 초과 시
            ▼
┌───────────────────────────┐
│ 3차: 긴급 대응              │  Emergency Prune
│     (CRITICAL 발동 시점)    │  첫 메시지 + 최근 N개만 보존
│                             │  나머지 기계적 삭제
└───────────────────────────┘
```

추가로, Anthropic API의 **서버사이드 `clear_tool_uses`**가 80% 구간에서 점진적 정리를 담당합니다. 클라이언트는 95% 이상에서만 개입하는 **안전망** 역할입니다.

---

## 3. 1차 방어 — 입구 차단: web_fetch hardcap

가장 효과적인 방어는 큰 데이터가 애초에 들어오지 못하게 하는 것입니다.

### 구현

```python
# core/tools/web_tools.py

class WebFetchTool:
    def execute(self, **kwargs):
        url = kwargs["url"]
        max_chars = min(kwargs.get("max_chars", 8000), 10000)  # 하드캡

        content = self._fetch(url)
        return {
            "result": {
                "url": url,
                "content": content[:max_chars],
                "truncated": len(content) > max_chars,
            }
        }
```

LLM이 `max_chars=50000`을 요청해도 **10,000자로 강제 절단**합니다. `min()` 함수 한 줄이 전체 방어의 첫 번째 문입니다.

### 왜 10,000자인가

| max_chars | 토큰 추정 (4자/토큰) | 컨텍스트 점유율 (1M) | 비고 |
|-----------|---------------------|---------------------|------|
| 50,000 | 12,500 | 1.25% | 10회 호출 시 12.5% |
| 10,000 | 2,500 | 0.25% | 10회 호출 시 2.5% |
| 5,000 | 1,250 | 0.125% | 정보 손실 과다 |

10,000자는 일반적인 웹 페이지의 본문 텍스트를 대부분 포함하면서, 10회 호출해도 컨텍스트의 2.5%만 사용합니다. Steam 스토어 페이지, Reddit 스레드, 뉴스 기사 등 GEODE가 주로 접근하는 페이지에서 핵심 정보가 10,000자 이내에 있음을 경험적으로 확인했습니다.

### truncated 플래그

결과에 `"truncated": true`를 포함합니다. LLM이 이 플래그를 보고 "잘린 정보가 있다"는 것을 인식하고, 필요하면 다른 검색 전략(특정 섹션 요청, 다른 소스 탐색)을 선택할 수 있습니다.

---

## 4. 2차 방어 — 감시: ContextMonitor 이중 임계치

### 토큰 추정

정확한 토큰 카운팅은 비쌉니다. tiktoken 라이브러리로 매 턴 전체 컨텍스트를 토큰화하면 수백 밀리초가 걸립니다. GEODE는 보수적 휴리스틱을 사용합니다.

```python
# core/orchestration/context_monitor.py

def estimate_message_tokens(messages: list[dict]) -> int:
    """보수적 4자/토큰 휴리스틱.

    실제 토큰 수보다 과대추정하여 안전 마진을 확보.
    JSON 메타데이터 오버헤드(role, tool_use_id 등)를 고려.
    """
    total_chars = sum(len(str(m.get("content", ""))) for m in messages)
    return total_chars // 4
```

**왜 과대추정하는가?** 과소추정하면 실제 토큰이 임계치를 넘었는데도 경보가 울리지 않습니다. 과대추정하면 경보가 조금 일찍 울릴 뿐, 안전 마진이 됩니다. 방어 시스템에서는 false positive이 false negative보다 낫습니다.

### 이중 임계치

```python
WARNING_THRESHOLD = 0.80   # 80% — 정보성 로깅
CRITICAL_THRESHOLD = 0.95  # 95% — 긴급 개입

RESPONSE_OVERHEAD = 500    # API 응답 + 도구 정의 예약 토큰

def check_context(
    messages: list[dict],
    model: str,
    *,
    system_prompt: str = "",
) -> ContextMetrics:
    context_window = MODEL_CONTEXT_WINDOW.get(model, 200_000)
    system_tokens = len(system_prompt) // 4
    estimated = estimate_message_tokens(messages) + system_tokens
    available = context_window - RESPONSE_OVERHEAD
    usage_pct = estimated / available if available > 0 else 1.0

    return ContextMetrics(
        estimated_tokens=estimated,
        context_window=context_window,
        usage_pct=usage_pct,
        remaining_tokens=available - estimated,
        is_warning=usage_pct >= WARNING_THRESHOLD,
        is_critical=usage_pct >= CRITICAL_THRESHOLD,
    )
```

### 80%에서 하는 일: 아무것도

80% 경보는 **로깅만** 합니다. 이전 버전에서는 80%에서 LLM 기반 요약(Context Compaction)을 실행했지만, 제거했습니다.

```python
if metrics.is_critical:
    # 95%: Emergency Prune
    pruned = prune_oldest_messages(messages, keep_recent=keep_recent)
    messages.clear()
    messages.extend(pruned)
elif metrics.is_warning:
    # 80%: 로깅만, 서버사이드 clear_tool_uses에 위임
    log.info("Context usage %.1f%% — delegating to clear_tool_uses",
             metrics.usage_pct * 100)
```

LLM 요약을 제거한 이유:

1. **비용**: Haiku 호출 비용이 누적됩니다. 에이전트가 활발하게 도구를 쓰면 80%를 자주 넘깁니다.
2. **정보 손실**: 요약은 불가피하게 정보를 잃습니다. 도구 호출의 정확한 파라미터, 에러 메시지의 원문 등이 사라집니다.
3. **Anthropic API의 대안**: `clear_tool_uses`가 서버사이드에서 도구 결과를 정리합니다. 클라이언트가 직접 요약할 필요가 없습니다.

---

## 5. 3차 방어 — 긴급 대응: Emergency Prune

95%를 넘으면 기계적으로 메시지를 삭제합니다.

```python
def prune_oldest_messages(
    messages: list[dict],
    *,
    keep_recent: int = 10,
) -> list[dict]:
    """첫 메시지(시스템 컨텍스트) + 최근 N개만 보존."""
    if len(messages) <= keep_recent + 1:
        return list(messages)

    first = messages[0]           # 사용자의 첫 질문 (목표 보존)
    recent = messages[-keep_recent:]  # 최근 대화 (연속성 보존)

    return [first] + recent
```

### 왜 첫 메시지를 보존하는가

에이전트의 행동은 **첫 메시지의 목표**에 의해 결정됩니다. "Elden Ring의 시장 가치를 분석해줘"라는 요청이 사라지면, 에이전트는 맥락을 잃고 무의미한 행동을 시작합니다. 중간 과정(도구 호출 결과)은 잃어도 되지만, 목표는 잃으면 안 됩니다.

### keep_recent=10의 의미

최근 10개 메시지는 직전 5턴(user + assistant 쌍)에 해당합니다. LLM이 "방금 무엇을 했는지" 기억하고, 다음 행동을 결정하기에 충분한 최소 단위입니다.

### Hook 이벤트 연동

```python
class HookEvent(Enum):
    CONTEXT_WARNING = "context_warning"    # 80% 도달
    CONTEXT_CRITICAL = "context_critical"  # 95% 도달 + prune 실행
```

외부 모니터링 시스템(Slack 알림, LangSmith 태깅 등)과 연동할 수 있습니다. Gateway 데몬이 장시간 실행 중에 95%를 넘으면 운영자에게 알림을 보냅니다.

---

## 6. 서버사이드 위임: clear_tool_uses

GEODE의 80% 구간 전략은 **"클라이언트가 하지 않는다"**입니다. 대신 Anthropic API의 서버사이드 기능에 위임합니다.

### clear_tool_uses란

Anthropic Messages API에서 `clear_tool_uses`를 설정하면, 이전 턴의 `tool_use`/`tool_result` 쌍을 서버가 자동으로 정리합니다. 클라이언트가 전체 대화 기록을 보내도, 서버가 오래된 도구 결과를 제거하여 실제 토큰 사용량을 줄입니다.

### 왜 서버사이드인가

| 관점 | 클라이언트 정리 | 서버사이드 정리 |
|------|--------------|---------------|
| 구현 | 메시지 필터링 로직 필요 | API 파라미터 하나 |
| 정확성 | 4자/토큰 추정 | 서버의 정확한 토큰 카운트 |
| 안전성 | orphan tool_result 위험 | 서버가 쌍 매칭 보장 |
| 비용 | 전송 토큰 감소 없음 | 전송 전 정리 |

클라이언트가 `tool_use`와 `tool_result` 쌍을 직접 삭제하면, 짝이 맞지 않는 **orphan 메시지**가 생길 수 있습니다. API가 이를 에러로 반환합니다. 서버사이드는 이 문제가 원천적으로 발생하지 않습니다.

---

## 7. 컨텍스트 예산 배분: ContextAssembler

방어만으로는 부족합니다. 제한된 컨텍스트를 **어디에 얼마나** 할당할 것인가도 중요합니다.

### 계층별 예산

```python
# core/memory/context.py — ContextAssembler

# 시스템 프롬프트 내 예산 배분
SOUL_BUDGET    = 0.10  # 10% — GEODE 정체성 (SOUL.md)
ORG_BUDGET     = 0.25  # 25% — 조직 규칙 (.geode/RULES.md)
PROJECT_BUDGET = 0.25  # 25% — 프로젝트 컨텍스트 (CLAUDE.md)
SESSION_BUDGET = 0.40  # 40% — 세션 기록 (대화, 도구 결과)
```

```
전체 컨텍스트 윈도우 (1,000,000 토큰)
├── 시스템 프롬프트 (~100,000)
│   ├── SOUL (10%):     GEODE 정체성, 기본 행동 규칙
│   ├── Organization (25%): 팀/조직 수준 규칙
│   └── Project (25%):  프로젝트별 지식
├── 세션 (40%):          대화 기록 + 도구 결과
└── 응답 예약 (500):     API 응답 생성용
```

### 실행 기록 주입

최근 3회 실행 기록을 1줄 요약으로 주입합니다. Karpathy의 "L3 extraction" 원칙 — 실행 기록에서 핵심만 추출하여 새 세션의 컨텍스트 비용을 최소화합니다.

```python
def _inject_run_history(self, context_parts: list[str]) -> None:
    """최근 3회 실행을 1줄 요약으로 주입."""
    recent_runs = self._journal.get_recent(limit=3)
    if recent_runs:
        lines = [f"- {run.summary}" for run in recent_runs]
        context_parts.append("## Recent Runs\n" + "\n".join(lines))
```

3회 × 1줄 = 약 100-200 토큰. 세션 예산의 0.05%로 이전 맥락을 복원합니다.

---

## 8. 프론티어 비교와 설계 결정

### 컨텍스트 관리 전략 비교

| 항목 | GEODE | Claude Code | Codex CLI |
|------|-------|-------------|-----------|
| 토큰 추정 | 4자/토큰 휴리스틱 | 서버 응답 기반 | 미공개 |
| 80% 대응 | 로깅 + 서버 위임 | clear_tool_uses | 자동 압축 |
| 95% 대응 | Emergency Prune | 대화 자동 압축 | N/A |
| 입구 차단 | web_fetch 10K hardcap | 없음 (사용자 제어) | 없음 |
| 예산 배분 | 4계층 비율 배분 | CLAUDE.md 우선 | N/A |

### 왜 hardcap인가

LLM에게 "10,000자까지만 가져와"라고 프롬프트로 지시할 수도 있습니다. 하지만 프롬프트는 무시될 수 있습니다. 특히 "이 페이지의 전체 내용이 필요해"라는 맥락에서 LLM은 `max_chars=100000`을 생성할 수 있습니다. **코드 레벨 `min()`이 프롬프트보다 확실합니다.**

이것은 49편에서 다룬 Defense-in-Depth 원칙의 연장선입니다. 프롬프트 제약은 첫 번째 방어, 코드 하드캡은 두 번째 방어입니다.

### 왜 LLM 요약을 제거했는가

v0.23.0에서는 80% 임계치에서 Haiku로 대화를 요약하는 ContextCompactor가 있었습니다.

```python
# core/orchestration/context_compactor.py (현재 비활성)

class ContextCompactor:
    def compact_context(self, messages, keep_recent=10):
        """중간 메시지를 Haiku 요약으로 대체."""
        to_summarize = messages[1:-keep_recent]
        summary = self._llm.call(
            model="haiku",
            prompt=f"Summarize: {to_summarize}",
        )
        return [messages[0]] + [summary_msg] + messages[-keep_recent:]
```

제거한 이유:

1. **요약 품질 불안정**: Haiku가 도구 호출의 파라미터를 누락하거나, 에러 메시지를 "문제 발생"으로 뭉개는 경우가 있었습니다. 에이전트가 같은 실수를 반복하게 됩니다.

2. **clear_tool_uses의 등장**: Anthropic API가 서버사이드 정리를 제공한 이후, 클라이언트 요약의 필요성이 줄었습니다. 서버가 도구 결과를 정확하게 정리하므로, 클라이언트는 95% 안전망만 유지하면 됩니다.

3. **비용 대비 효과**: 80%에 도달할 때마다 Haiku 호출 비용이 발생합니다. 장시간 세션에서는 요약 비용이 본래 분석 비용의 10-20%에 달했습니다.

---

## 9. 마무리

### 3중 방어 요약

| 방어 레이어 | 시점 | 메커니즘 | 비용 |
|------------|------|---------|------|
| 1차: 입구 차단 | 도구 실행 | `min(max_chars, 10000)` | 0 |
| 2차: 감시 | 매 턴 시작 | ContextMonitor 이중 임계치 | ~1ms |
| 3차: 긴급 대응 | 95% 초과 | Emergency Prune | 0 |
| 보조: 서버 위임 | 80% 이상 | clear_tool_uses | API 내장 |

### 핵심 원칙

1. **입구에서 차단하라**: 큰 데이터가 들어온 후 정리하는 것보다, 처음부터 크기를 제한하는 것이 효과적입니다. `min()` 한 줄이 가장 강력한 방어입니다.

2. **방어 시스템은 과대추정하라**: 4자/토큰 휴리스틱은 실제보다 많게 추정합니다. False positive(조기 경보)은 안전합니다. False negative(늦은 경보)는 API 에러입니다.

3. **서버에 위임할 수 있으면 위임하라**: 클라이언트가 도구 결과를 직접 정리하면 orphan 메시지 위험이 있습니다. 서버사이드가 더 정확하고 안전합니다.

4. **목표를 잃지 마라**: Emergency Prune에서 첫 메시지를 반드시 보존합니다. 과정은 잃어도 목표를 잃으면 에이전트는 방향을 잃습니다.

### 체크리스트

- [x] web_fetch hardcap 10,000자 (`min()` 강제)
- [x] ContextMonitor 80%/95% 이중 임계치
- [x] Emergency Prune (첫 메시지 + 최근 10개 보존)
- [x] Hook 이벤트 (CONTEXT_WARNING, CONTEXT_CRITICAL)
- [x] clear_tool_uses 서버사이드 위임
- [x] ContextAssembler 4계층 예산 배분
- [x] 실행 기록 1줄 요약 주입
- [ ] tiktoken 기반 정확한 토큰 카운팅 (선택적)
- [ ] 도구별 결과 크기 통계 수집

---

*Source: `blog/posts/memory-context/52-token-guard-context-budget-defense.md` | Category: [[blog-memory-context]]*

## Related

- [[blog-memory-context]]
- [[blog-hub]]
- [[geode]]
- [[geode-memory-system]]
