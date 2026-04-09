---
title: "소크라틱 게이트 — '이미 구현된 것을 다시 만들지 않는' 워크플로우 설계"
type: reference
category: blog-post
tags: [blog, harness-frontier]
source: "blog/posts/harness-frontier/41-socratic-gate-gap-audit-workflow.md"
created: 2026-04-08T00:00:00Z
---

# 소크라틱 게이트 — "이미 구현된 것을 다시 만들지 않는" 워크플로우 설계

> Date: 2026-03-21 | Author: geode-team | Tags: workflow, socratic-method, gap-audit, CANNOT-CAN, over-engineering, frontier, Karpathy

## 목차

1. 도입 — 7개 플랜 중 7개가 이미 구현되어 있었다
2. 문제: Plan → Implement의 검증 부재
3. 프론티어 4종에서 추출한 설계 원칙
4. CANNOT → CAN 구조화
5. GAP Audit — 코드 실측으로 "정말 필요한가" 확인
6. 소크라틱 5문 게이트
7. 실전 적용: 버그 3건 + GAP 2건 발견
8. 마무리 — 워크플로우 v2 전후 비교

---

## 1. 도입 — 7개 플랜 중 7개가 이미 구현되어 있었다

GEODE의 `docs/plans/` 디렉토리에는 15개의 활성 플랜이 있었습니다. P2-multi-llm-ensemble, P3-batch-analysis, P3-async-migration 등 당장 구현해야 할 것처럼 보이는 항목들이었습니다.

실제로 코드를 `grep`으로 확인해 보니, **7개가 이미 구현 완료**였습니다.

```bash
# P2-multi-llm-ensemble → 이미 있었다
grep "ensemble_mode\|secondary_analysts\|_should_use_secondary" core/ -r
# config.py:202, analysts.py:107, llm_port.py:261 ...

# P3-batch → 이미 있었다
grep "cmd_batch\|ThreadPoolExecutor" core/cli/batch.py core/cli/commands.py
# batch.py:2, commands.py:1 ...

# P3-async → 이미 있었다
grep -c "async def\|await " core/cli/agentic_loop.py
# 38
```

코드에 이미 존재하는 기능을 "Draft" 상태의 플랜으로 관리하고 있었습니다. **플랜을 세울 때 AS-IS 코드를 실측하지 않았기 때문**입니다.

---

## 2. 문제: Plan → Implement의 검증 부재

### 2.1 기존 워크플로우 (v1)

```
0. Worktree → 1. Plan → 2. Implement → 3. Verify → 4. Docs → 5. PR → 6. Board
```

Step 1(Plan)의 프로세스:

```
EnterPlanMode → Explore → 플랜 작성 → 사용자 승인 → 구현 착수
```

**빠진 것**:
- "이 기능이 코드에 이미 있는가?"를 확인하는 단계가 없음
- "이 기능이 정말 필요한가?"를 질문하는 게이트가 없음
- "허용된 자유도"가 명시되지 않아 모든 것이 금지인지 허용인지 불분명

### 2.2 결과

| 세션 | 발견한 "이미 구현된" 플랜 | 낭비된 리서치 시간 |
|------|----------------------|----------------|
| GAP 7건 해소 | 0건 (신규 작업) | 없음 |
| 플랜 점검 | **7건** (P2×2, P3×3, ADR-010, geode-context-hub) | 상당함 |

이미 구현된 7건의 플랜을 "Draft"/"IN_PROGRESS"로 관리하면서, 매 세션마다 "다음에 구현할 것"으로 올려놓고 있었습니다.

---

## 3. 프론티어 4종에서 추출한 설계 원칙

### 3.1 탐색 결과

| 시스템 | CANNOT→CAN 패턴 | 측정/검증 패턴 |
|--------|----------------|--------------|
| **autoresearch** | P1: "할 수 없는 것" 먼저 정의 | P4: 래칫 (개선만 유지, 악화 시 복구) |
| **Claude Code** | permissions: allowlist/denylist | Memory: AS-IS 자동 기억 |
| **OpenClaw** | Policy Chain: 6계층 접근 제어 | Heartbeat: 5개 조건 전부 충족 시만 실행 |
| **Codex** | Sandbox: 파일/네트워크 제한 먼저 | TDD: red → green → refactor |

> **4종 모두 "제약을 먼저 정의하고, 나머지를 자유도로 열어둔다"는 구조를 따릅니다.** GEODE의 CANNOT 목록은 있었지만, CAN(허용된 자유도)이 명시되지 않아 모든 것이 암묵적으로 금지 또는 허용인 회색지대였습니다.

### 3.2 프론티어에서 추출한 3가지 원칙

```
원칙 1: 제약(CANNOT)이 자유도(CAN)보다 먼저 온다
  — Karpathy P1, OpenClaw Policy Chain, Codex Sandbox

원칙 2: 구현 전에 실측으로 "이미 있는가" 확인한다
  — Codex TDD (테스트 먼저), autoresearch P4 (래칫)

원칙 3: "코드 삭제 > 코드 추가"
  — Karpathy P10 Simplicity Selection
```

---

## 4. CANNOT → CAN 구조화

### 4.1 CANNOT 테이블 (근거 컬럼 추가)

기존 CANNOT은 규칙만 나열했습니다. "왜 금지인지"가 없어서 상황 판단이 어려웠습니다.

```markdown
# 기존 (v1)
- worktree 없이 코드 작업 시작 금지
- main/develop에 직접 push 금지

# 개선 (v2)
| 영역 | 규칙 | 근거 |
|------|------|------|
| Git | worktree 없이 코드 작업 금지 | 격리 실행 (OpenClaw Session) |
| Git | main/develop 직접 push 금지 | 래칫 (P4) |
```

> 근거가 있으면 **예외 판단**이 가능합니다. "격리 실행"이 근거인 규칙은, 이미 격리된 환경(CI)에서는 예외가 가능합니다. 반면 "래칫"이 근거인 규칙은 예외가 불가합니다.

### 4.2 CAN 섹션 (신규)

```markdown
### CAN — 허용된 자유도

CANNOT에 없는 것은 자유롭게 할 수 있다. 특히:

| 자유도 | 설명 |
|--------|------|
| 단순 버그·문서 수정 | Plan 생략, worktree에서 바로 구현 |
| 플랜에 없는 개선 발견 시 | 현재 작업 완료 후 다음 이터레이션 |
| 테스트 선별 실행 | 변경 범위만 먼저, 최종은 전체 |
```

> CANNOT만 있으면 "이것도 안 되나?"라는 의문이 계속 생깁니다. CAN을 명시하면 **의사결정 속도**가 빨라집니다.

---

## 5. GAP Audit — 코드 실측으로 "정말 필요한가" 확인

### 5.1 프로세스

```
플랜의 TO-BE 항목 → grep/Explore로 코드 실측 → 3단 분류
```

| 분류 | 판정 기준 | 액션 |
|------|----------|------|
| **구현 완료** | 코드에 존재 + 테스트 통과 | 플랜에서 제거, `_done/` 이동 |
| **부분 구현** | 코드 존재하나 통합 미완 | 남은 부분만 구현 |
| **미구현** | 코드에 없음 | 구현 대상 |

### 5.2 실전 적용 결과

```bash
# P2-subagent-orchestration-hardening: 10개 GAP 중 9개 구현 완료
grep "SubAgentResult\|ErrorCategory\|_guard_tool_result" core/cli/ -r
# → 전부 존재. 남은 1건(G3 on_progress)만 구현

# P2-multi-llm-ensemble: 전부 구현 완료
grep "ensemble_mode\|_should_use_secondary" core/ -r
# → config.py, analysts.py, llm_port.py 전부 존재

# ADR-010 D1-D6: 전부 해결 완료
grep "TextSpinner\|shutil.get_terminal_size" core/ui/ -r
# → status.py, console.py에 존재
```

**GAP Audit 없이 구현을 시작했다면**, 이미 있는 코드를 다시 작성하거나 충돌을 일으켰을 것입니다.

---

## 6. 소크라틱 5문 게이트

GAP Audit에서 "미구현"으로 분류된 항목에 대해 5개 질문을 적용합니다.

### 6.1 질문 설계

| # | 질문 | 실패 시 | 출처 |
|---|------|--------|------|
| Q1 | 코드에 이미 있는가? | 제거 | GAP Audit 확장 |
| Q2 | 안 하면 무엇이 깨지는가? | 답 없으면 제거 | Codex TDD |
| Q3 | 효과를 어떻게 측정하는가? | 측정 불가 시 보류 | autoresearch P4 |
| Q4 | 가장 단순한 구현은? | 최소만 채택 | Karpathy P10 |
| Q5 | 프론티어 3종 이상에서 동일 패턴인가? | 1종만이면 재검증 | frontier-research |

### 6.2 실전 적용: 탐색된 이슈에 소크라틱 적용

코드 탐색에서 발견된 이슈 목록에 5문을 적용했습니다.

**통과 (수정 대상):**

| 이슈 | Q1 | Q2 | Q3 |
|------|-----|-----|-----|
| SQLite 쓰기 락 없음 | 락 코드 없음 | 서브에이전트 병렬 실행 시 DB 손상 | 테스트로 확인 |
| prune 로그 산술 오류 | 버그 존재 | 디버깅 시 오해 유발 | 로그 출력 검증 |
| BadRequest non-retryable 누락 | 목록에 없음 | 스키마 오류 시 불필요 재시도 + 비용 | 재시도 횟수 측정 |
| Config 시작 검증 없음 | 검증 코드 없음 | 오류 설정이 파이프라인 중간에서 터짐 | startup 로그 |
| geode init 템플릿 누락 | 템플릿 없음 | 사용자 수동 생성 부담 | init 실행 후 확인 |

**탈락 (수정 불필요):**

| 이슈 | 탈락 질문 | 이유 |
|------|----------|------|
| 테스트 커버리지 150/154 부재 | Q2 | 2941 통합 테스트가 커버. 단위 테스트 추가 가성비 낮음 |
| 어댑터 위치 통합 | Q2 | 현재 동작에 영향 없음 |
| 두 번째 도메인 예제 | Q2 | Protocol 문서로 충분 |
| .env cascade | Q5 | 프론티어 3종이 환경변수만 사용 |
| MCP 실패 3건 | Q2 | Graceful degradation이 정상 동작 |

---

## 7. 실전 적용: 버그 3건 + GAP 2건 발견

소크라틱 게이트를 통과한 5건만 수정했습니다.

### 7.1 B1: 프루닝 로그 산술 오류

```python
# 수정 전: messages.clear() 후에 len(messages) 참조
pruned = prune_oldest_messages(messages, keep_recent=10)
if len(pruned) < len(messages):
    messages.clear()
    messages.extend(pruned)
    log.info("Pruned: %d → %d", len(messages) + (len(messages) - len(pruned)), len(pruned))
    #                            ^^^^^^^^^^^^^^^ messages는 이미 pruned와 동일

# 수정 후: 사전 캡처
original_count = len(messages)
if len(pruned) < original_count:
    messages.clear()
    messages.extend(pruned)
    log.info("Pruned: %d → %d", original_count, len(pruned))
```

> `messages.clear()` 이후 `len(messages)`는 `len(pruned)`와 같으므로, 로그에 "10 → 10"처럼 의미 없는 수치가 출력되었습니다. 1줄 수정으로 해결.

### 7.2 B2: SQLite 쓰기 락

```python
# 수정 전: check_same_thread=False인데 락 없음
self._conn = sqlite3.connect(str(self._db_path), check_same_thread=False)

# 수정 후: threading.Lock으로 쓰기 보호
self._lock = threading.Lock()
self._conn = sqlite3.connect(str(self._db_path), check_same_thread=False)

def upsert(self, meta: SessionMeta) -> None:
    with self._lock:
        self._conn.execute(...)
        self._conn.commit()
```

> WAL 모드는 동시 **읽기**를 허용하지만, 동시 **쓰기**는 여전히 위험합니다. 서브에이전트 5개가 병렬로 `upsert()`를 호출하면 데이터 손상 가능.

### 7.3 B3: BadRequest non-retryable

```python
# 수정 전: AuthenticationError만
_NON_RETRYABLE_ERRORS = (anthropic.AuthenticationError,)

# 수정 후: BadRequestError 추가
_NON_RETRYABLE_ERRORS = (anthropic.AuthenticationError, anthropic.BadRequestError)
```

> 스키마 오류(`{"error": "invalid schema"}`)에 3회 재시도 + fallback 모델 전환이 발생하면 불필요한 비용과 지연이 생깁니다.

### 7.4 G1 + G2: Config 검증 + Init 템플릿

startup 시 routing.toml과 model-policy.toml을 eager load하여 오류를 조기 발견하고, `geode init`에 템플릿을 추가했습니다.

---

## 8. 마무리 — 워크플로우 v2 전후 비교

### 구조 비교

```
v1: CANNOT → 워크플로우 (0~6)
      Step 1: Plan = Explore → 플랜 작성 → 승인

v2: CANNOT(+근거) → CAN → 워크플로우 (0~7)
      Step 1: GAP Audit = 코드 실측 → 3단 분류
      Step 2: Plan + 소크라틱 5문 = Q1~Q5 통과해야 구현
```

### 정량 비교

| 메트릭 | v1 (이전 세션) | v2 (이번 세션) |
|--------|-------------|-------------|
| 활성 플랜 → 실제 구현 필요 | 15건 중 ??? | 15건 중 **2건** |
| 불필요한 구현 시도 | 7건 (이미 구현) | **0건** |
| 소크라틱 탈락 이슈 | — | 5건 (정당하게 제거) |
| 수정한 코드 변경 | — | **5건** (정밀 타격) |

### 핵심 교훈

| # | 교훈 |
|---|------|
| 1 | 플랜이 있다고 구현이 필요한 것은 아니다 — **코드를 먼저 확인하라** |
| 2 | "안 하면 깨지는가?"에 답이 없으면 **하지 마라** |
| 3 | CANNOT만으로는 부족하다 — **CAN을 명시해야 의사결정이 빨라진다** |
| 4 | 코드를 추가하지 않는 것이 최선의 엔지니어링일 수 있다 |

### 체크리스트

- [ ] 구현 전에 `grep`으로 코드에 이미 존재하는지 확인했는가
- [ ] 소크라틱 5문(Q1~Q5) 중 하나라도 실패하는 항목을 제거했는가
- [ ] CANNOT에 "근거" 컬럼이 있는가
- [ ] CAN(허용된 자유도)이 명시되어 있는가
- [ ] 프론티어 3종 이상에서 동일 패턴인지 확인했는가

### 한 줄 요약

> 좋은 워크플로우는 "무엇을 할 것인가"가 아니라 **"무엇을 하지 않을 것인가"**를 먼저 결정합니다. 소크라틱 게이트는 과잉 엔지니어링을 코드 한 줄 쓰기 전에 걸러냅니다.

---

*Source: `blog/posts/harness-frontier/41-socratic-gate-gap-audit-workflow.md` | Category: [[blog-harness-frontier]]*

## Related

- [[blog-harness-frontier]]
- [[blog-hub]]
- [[geode]]
