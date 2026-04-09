---
title: "장기 실행 자율 에이전트의 안전 설계 — 프론티어 하네스 3종에서 배운 것"
type: reference
category: blog-post
tags: [blog, research]
source: "blog/research/long-running-agent-safety.md"
created: 2026-04-08T00:00:00Z
---

# 장기 실행 자율 에이전트의 안전 설계 — 프론티어 하네스 3종에서 배운 것

> Date: 2026-03-28 | Author: rooftopsnow | Tags: autonomous-agent, long-running, safety, loop-guard, context-management, Claude-Code, OpenClaw, Karpathy, GEODE

---

## 목차

1. 문제 정의: "끝날 때까지 돌려"의 위험
2. 프론티어 하네스 3종 비교
3. 종료 조건: 반복 횟수 vs 시간 예산 vs 목표 달성
4. 루프 안전: 래칫과 다양성 강제
5. 컨텍스트 관리: 1M 토큰 시대의 생존 전략
6. 에러 복구: 4단계 에스컬레이션 체인
7. GAP 매트릭스와 구현 우선순위
8. 마무리

---

## 1. 문제 정의: "끝날 때까지 돌려"의 위험

자율 실행 에이전트에게 "이 문제를 해결할 때까지 계속 돌아"라고 지시하는 순간, 두 가지 상반된 요구가 충돌합니다.

- **자유도**: 턴 제한 없이 복잡한 문제를 끝까지 풀 수 있어야 합니다
- **안전성**: 무한 루프, 비용 폭주, 컨텍스트 붕괴가 발생하면 안 됩니다

50턴 제한을 걸면 안전하지만 복잡한 작업을 완수하지 못합니다. 제한을 풀면 새벽 3시에 API 비용 $200을 태우고도 같은 에러를 반복하고 있을 수 있습니다.

이 글에서는 프론티어 하네스 3종(Claude Code, OpenClaw, Karpathy autoresearch)이 이 문제를 어떻게 해결하는지 분석하고, 자체 에이전트 시스템(GEODE)에 적용하며 발견한 GAP을 공유합니다.

---

## 2. 프론티어 하네스 3종 비교

| 항목 | Claude Code | OpenClaw | Karpathy autoresearch |
|------|-----------|----------|----------------------|
| **종료 조건** | `max_rounds=50` + WRAP_UP | Binding별 `max_rounds` | `TRAINING_BUDGET_SECONDS=300` |
| **루프 안전** | 동일 에러 4회 수렴 감지 | Lane Queue 직렬 기본 | 래칫(modify→evaluate→revert) |
| **컨텍스트** | 서버 압축(Anthropic) + 클라이언트 요약(OpenAI) | Auto-compaction 후 재시도 | L1 차단/L2 추출/L3 요약 |
| **에러 복구** | 프로바이더 간 모델 에스컬레이션 | 4단계 Failover(인증→사고수준→압축→모델) | 래칫이 복구를 대체 |
| **스케줄** | 없음 (대화형) | Heartbeat + Cron + Active Hours | 고정 시간 예산 내 자율 |
| **설계 철학** | 대화형 안전 우선 | 데몬 운영 안전 | 연구 효율 최적화 |

> 세 하네스는 서로 다른 사용 시나리오를 위해 설계되었지만, **"제어된 자율성"**이라는 공통 원칙을 공유합니다. 제약(CANNOT)이 자유도(CAN)보다 먼저 정의됩니다.

---

## 3. 종료 조건: 반복 횟수 vs 시간 예산 vs 목표 달성

### 3.1 Claude Code — 반복 횟수 기반 + Wrap-Up Headroom

```python
# core/agent/agentic_loop.py
DEFAULT_MAX_ROUNDS = 50
WRAP_UP_HEADROOM = 2

for round_idx in range(self.max_rounds):
    remaining = self.max_rounds - round_idx
    force_text = remaining <= WRAP_UP_HEADROOM  # 마지막 2턴
    tool_choice = {"type": "none"} if force_text else {"type": "auto"}

    response = await self._call_llm(system_prompt, messages, tool_choice=tool_choice)

    if response.stop_reason != "tool_use":
        return AgenticResult(...)  # 자연 종료
```

> `WRAP_UP_HEADROOM`은 Claude Code의 핵심 안전 장치입니다. max_rounds 도달 2턴 전부터 `tool_choice=none`으로 강제 전환하여, 에이전트가 새로운 도구 호출을 시작하지 않고 지금까지의 결과를 정리하게 합니다. 이것이 없으면 50턴째에서 작업 중간에 갑자기 종료됩니다.

**한계**: 50턴이 "많은지 적은지"는 작업마다 다릅니다. 단순 질문에 50턴은 낭비이고, 복잡한 리팩토링에 50턴은 부족합니다.

### 3.2 Karpathy autoresearch — 시간 예산 기반

```python
TRAINING_BUDGET_SECONDS = 300  # 5분

# 에이전트에게 "300초 안에 최선을 다하라"고 지시
# → 효율적인 에이전트일수록 같은 시간에 더 많은 실험을 수행
```

> 반복 횟수 대신 wall-clock 시간을 예산으로 사용하면, 에이전트가 **자체적으로 효율을 최적화**합니다. 느린 방법을 쓰면 3번밖에 못 돌리고, 빠른 방법을 쓰면 10번 돌릴 수 있으니까요. 이것은 "몇 번 돌릴까"가 아니라 "얼마나 쓸까"에 대한 질문입니다.

### 3.3 비교: 세 가지 종료 전략

| 전략 | 예측 가능성 | 효율 최적화 | 복잡 작업 대응 |
|------|:---------:|:---------:|:----------:|
| 반복 횟수 (Claude Code) | 높음 | 낮음 | 제한적 |
| 시간 예산 (autoresearch) | 높음 | 높음 | 보통 |
| 목표 달성 판정 | 낮음 | 최고 | 최고 |

"목표 달성 판정"은 가장 유연하지만, **목표 달성 여부를 누가 판단하는가**라는 문제가 남습니다. LLM 자체가 판단하면 "완료했다"고 거짓 보고할 위험이 있고, 외부 검증이 필요하면 자율성이 떨어집니다.

실용적 해법은 **삼중 종료 조건**입니다:

```
종료 = min(시간 예산, 반복 상한) OR 목표 달성 검증 통과
```

시간이 남아도 목표를 달성하면 멈추고, 목표 미달이어도 예산이 소진되면 wrap-up 후 종료합니다.

---

## 4. 루프 안전: 래칫과 다양성 강제

### 4.1 래칫 메커니즘 (Karpathy P4)

```
LOOP:
  checkpoint = current_state
  modify(state)
  score = evaluate(state)
  if score > best_score:
      best_score = score
      best_state = state   # keep
  else:
      state = checkpoint    # revert
```

> 래칫의 핵심은 **절대 나빠지지 않는다**는 보장입니다. 야간 무인 실행에서 이것은 필수 조건입니다. 아침에 일어났을 때 어젯밤보다 나빠져 있으면 안 되기 때문입니다.

### 4.2 수렴 감지 (Claude Code)

```python
def _check_convergence_break(self) -> bool:
    """동일 에러 4회 반복 시 루프 탈출."""
    if len(self._recent_errors) < 4:
        return False
    last_4 = self._recent_errors[-4:]
    if last_4[0] == last_4[1] == last_4[2] == last_4[3]:
        log.warning("Convergence: 4x identical errors '%s'", last_4[0])
        return True
    return False
```

> 같은 에러가 4번 반복되면 "이 방법으로는 안 된다"고 판단하고 탈출합니다. 단순하지만 효과적입니다. 다만 **에러 메시지가 미세하게 다른 경우**(타임스탬프 포함 등)에는 감지하지 못합니다.

### 4.3 다양성 강제 (Karpathy P4 확장)

```python
# autoresearch의 diversity forcing
if consecutive_same_type >= 5:
    force_different_strategy()
```

수렴 감지가 "같은 실패 반복 → 멈춤"이라면, 다양성 강제는 "같은 시도 반복 → 다른 방향"입니다. local optima에 갇히는 것을 방지합니다.

| 메커니즘 | 목적 | 트리거 |
|---------|------|--------|
| 수렴 감지 | 무한 루프 방지 | 동일 에러 N회 |
| 다양성 강제 | local optima 탈출 | 동일 전략 N회 |
| 래칫 | 품질 하락 방지 | 평가 점수 비교 |

세 가지를 조합하면: **반복하면 멈추고, 같은 길만 가면 돌리고, 나빠지면 되돌린다.**

---

## 5. 컨텍스트 관리: 1M 토큰 시대의 생존 전략

장기 실행에서 가장 먼저 한계에 부딪히는 것은 컨텍스트 윈도우입니다. claude-opus-4-6의 1M 토큰도 수백 턴의 도구 호출 결과가 쌓이면 금방 차올랑합니다.

### 5.1 3계층 전략

```
┌────────────────────────────────────────────────┐
│  80% 도달: WARNING                              │
│  → Anthropic: 서버 사이드 clear_tool_uses       │
│  → OpenAI/GLM: 클라이언트 사이드 LLM 요약       │
├────────────────────────────────────────────────┤
│  95% 도달: CRITICAL                             │
│  → 긴급 프루닝: 첫 메시지 + 브릿지 + 최근 N개    │
│  → 고아 tool_result 정리 (API 400 방지)          │
├────────────────────────────────────────────────┤
│  프루닝 후에도 부족: OVERFLOW_ACTION              │
│  → Hook이 압축 전략 결정 (L3 DECIDE)             │
│  → 대화 요약 → 새 세션 시작 (계획 중)             │
└────────────────────────────────────────────────┘
```

### 5.2 Provider별 분화가 필요한 이유

```python
# Anthropic — 서버가 자동 관리
# clear_tool_uses: 오래된 tool 결과를 서버에서 제거
# compact_20260112: 80% 시점에 서버가 LLM으로 대화 요약

# OpenAI/GLM — 클라이언트가 직접 관리
def compact_conversation(messages, provider, model):
    if usage_pct >= 80:
        summary = llm_summarize(old_messages)
        return [system_msg, compaction_marker, summary, *recent_messages]
```

> Anthropic API는 서버에서 컨텍스트를 자동 관리하지만, OpenAI와 GLM은 클라이언트가 직접 해야 합니다. **같은 에이전트가 여러 프로바이더를 전환하며 사용할 때**, 이 차이를 인지하지 못하면 OpenAI에서 컨텍스트 오버플로우가 발생합니다.

### 5.3 Karpathy의 컨텍스트 예산 3계층

autoresearch는 더 급진적인 접근을 취합니다:

```bash
# L1: 차단 — 컨텍스트에 아예 넣지 않음
uv run train.py > run.log 2>&1   # 출력을 파일로 리디렉션

# L2: 추출 — 필요한 2줄만
grep "^val_bpb:" run.log

# L3: 요약 — LLM이 1비트 판정 (개선/악화)
```

> 핵심 통찰: **컨텍스트를 관리하는 최선의 방법은 애초에 넣지 않는 것**입니다. L1 차단이 가장 저렴하고, L3 요약이 가장 비쌉니다. 장기 실행 에이전트는 도구 결과를 무조건 컨텍스트에 쌓는 대신, 필요한 정보만 선별적으로 넣어야 합니다.

---

## 6. 에러 복구: 4단계 에스컬레이션 체인

장기 실행에서 에러는 필연적입니다. API 타임아웃, 인증 만료, 모델 과부하 등. 문제는 에러가 아니라, **에러 후 어떻게 복구하는가**입니다.

### 6.1 OpenClaw Failover 4단계

```
1. Auth Profile Rotation  — 인증 에러 → 다음 프로필로 → 재시도
2. Thinking Level Fallback — high 미지원 → medium → low → off
3. Context Overflow        — 감지 → Auto-compaction → 재시도
4. Model Failover          — Primary 실패 → Fallback 모델 → 재시도
```

### 6.2 Claude Code 모델 에스컬레이션

```python
# 같은 프로바이더 내 fallback
_ESCALATION_THRESHOLD = 2  # 연속 2회 실패 시

# Anthropic: opus → sonnet
# OpenAI: gpt-5.4 → gpt-5.2 → gpt-4.1
# 같은 프로바이더 소진 → 다른 프로바이더로 cross-escalation
```

### 6.3 GEODE의 전략 체인

```python
class RecoveryStrategy(StrEnum):
    RETRY = "retry"          # 1차: 동일 도구 재시도
    ALTERNATIVE = "alternative"  # 2차: 대체 도구 사용
    FALLBACK = "fallback"    # 3차: 단순화된 방법
    ESCALATE = "escalate"    # 4차: 사용자에게 위임

# 안전 불변식: DANGEROUS/WRITE 도구는 자동 복구 대상에서 제외
EXCLUDED_TOOLS = frozenset({
    "run_bash", "memory_save", "note_save", "set_api_key", "manage_auth",
})
```

> `EXCLUDED_TOOLS`가 중요합니다. 에러 복구가 위험한 도구를 자동으로 재실행하면, 복구 과정에서 더 큰 문제를 만들 수 있습니다. **복구 가능한 것과 복구해서는 안 되는 것을 구분하는 것**이 에러 복구 설계의 핵심입니다.

---

## 7. GAP 매트릭스와 구현 우선순위

자체 에이전트 시스템(GEODE)에 프론티어 패턴을 적용하면서 발견한 GAP입니다.

### 7.1 현황 매트릭스

```
                     AS-IS              TO-BE
───────────────────────────────────────────────────
종료 조건        반복 횟수(50)         시간 예산 + 목표 달성 판정
마무리           즉시 종료             wrap-up headroom
루프 안전        에러 4회 break        래칫 + diversity forcing
컨텍스트         80/95% 3계층          구현 완료
에러 복구        4단계 체인            구현 완료
스케줄 게이팅    cron                  heartbeat + active hours
상태 롤백        없음                  graph-partial-state
```

### 7.2 구현 우선순위

| Phase | 항목 | 변경량 | 효과 |
|-------|------|--------|------|
| **P0** | Wrap-Up Headroom | ~20줄 | 종료 시 결과 정리 보장 |
| **P0** | 시간 예산 모드 | ~50줄 | `max_rounds` 대체, 효율 최적화 유도 |
| **P1** | 래칫 (상태 롤백) | ~200줄 | 야간 무인 실행 안전 보장 |
| **P1** | 다양성 강제 | ~30줄 | local optima 탈출 |
| **P2** | Heartbeat + Active Hours | ~100줄 | 데몬 모드 스케줄 안전 |

> P0 2건(wrap-up + 시간 예산)만 구현하면 **"턴 제한 없이 문제 해결까지, 무한 루프 없이"**가 가능해집니다. P1의 래칫은 야간 무인 실행을 위한 것이고, P2는 데몬 운영을 위한 것입니다.

---

## 8. 마무리

### 핵심 정리

| 원칙 | 설명 | 출처 |
|------|------|------|
| 제약이 자유도보다 먼저 | CANNOT 정의 후 CAN 허용 | OpenClaw Policy Chain |
| 시간이 반복보다 정직 | 반복 횟수 → wall-clock 예산 | Karpathy P3 |
| 절대 나빠지지 않음 | 래칫: 개선만 유지, 악화 시 롤백 | Karpathy P4 |
| 넣지 않는 것이 최선 | 컨텍스트 L1 차단 > L2 추출 > L3 요약 | Karpathy P6 |
| 복구와 방치의 구분 | DANGEROUS 도구는 자동 복구 제외 | Claude Code Safety Gate |
| 직렬이 기본, 병렬은 명시적 | 상태 충돌 방지 | OpenClaw Lane Queue |

### 자가 점검 체크리스트

- [ ] 에이전트가 max_rounds 도달 전에 결과를 정리할 시간이 있는가?
- [ ] 같은 에러가 N회 반복되면 자동으로 멈추는가?
- [ ] 컨텍스트 80% 시점에서 Provider별 적절한 압축이 작동하는가?
- [ ] 위험 도구(bash, 파일 삭제)의 자동 복구가 차단되어 있는가?
- [ ] 야간 실행 시 상태가 어젯밤보다 나빠질 가능성이 있는가?
- [ ] 장시간 실행 시 비용 상한이 설정되어 있는가?

---

*이 글은 GEODE 자율 실행 에이전트를 개발하면서 축적한 설계 결정을 정리한 것입니다. 코드 예시는 [GEODE 리포지토리](https://github.com/mangowhoiscloud/geode)에서 확인할 수 있습니다.*

---

*Source: `blog/research/long-running-agent-safety.md` | Category: [[blog-research]]*

## Related

- [[blog-research]]
- [[blog-hub]]
- [[geode]]
