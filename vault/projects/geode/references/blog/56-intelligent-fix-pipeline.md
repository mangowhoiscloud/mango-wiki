---
title: "지능형 Fix 파이프라인 — 에러 분류, 구조화 진단, 자동 학습이 만든 3단계 수렴 엔진"
type: reference
category: blog-post
tags: [blog, reode]
source: "blog/posts/reode/56-intelligent-fix-pipeline.md"
created: 2026-04-08T00:00:00Z
---

# 지능형 Fix 파이프라인 — 에러 분류, 구조화 진단, 자동 학습이 만든 3단계 수렴 엔진

> 빌드 에러가 발생했을 때, LLM에게 "고쳐줘"라고 말하는 것과
> "이건 CONFIG 문제야, pom.xml을 먼저 봐, 소스는 건드리지 마"라고 말하는 것은
> 전혀 다른 결과를 만듭니다.
>
> 이 글은 REODE의 fix_node가 **단일 LLM 루프에서 3단계 지능형 파이프라인으로**
> 진화한 과정을 기록합니다. [55번 포스트](https://rooftopsnow.tistory.com/337)가
> DAG 토폴로지를 다뤘다면, 이 글은 **fix_node 내부 구조**에 집중합니다.

---

## 1. 문제: "고쳐줘"는 왜 실패하는가

Java 8 → Java 22 마이그레이션에서 빌드 에러가 발생하면, LLM에게 에러 로그 전체를 넘기고 "수정해줘"라고 요청하는 것이 가장 단순한 접근입니다. 문제는 이 방식의 수렴률이 낮다는 것입니다.

원인은 세 가지입니다.

**첫째, 에러 유형을 구분하지 않습니다.** `JAVA_HOME not set` 같은 환경 문제와 `cannot find symbol` 같은 코드 문제는 전혀 다른 해결 전략이 필요합니다. 그런데 LLM은 둘 다 "소스 코드를 수정"하려 합니다.

**둘째, LLM이 같은 실수를 반복합니다.** 3번째 iteration에서 실패한 접근을 5번째에서 다시 시도합니다. 과거 시도의 결과를 기억하지 못하기 때문입니다.

**셋째, 알려진 패턴도 LLM을 거칩니다.** Lombok 버전 업그레이드, `javax` → `jakarta` 네임스페이스 변환처럼 deterministic(결정적)하게 해결 가능한 문제도 매번 LLM 호출을 소비합니다.

---

## 2. 해결: 3단계 Fix 파이프라인

이 세 가지 문제를 각각 해결하는 3단계 구조를 설계했습니다.

```
빌드 에러 발생
    │
    ▼
┌─────────────────────────────────────────┐
│  Stage 1: Deterministic Pass            │
│  ─ 탐사 (Exploration Phase)             │
│  ─ 패턴 감지 (Pattern Detection)        │
│  ─ 결정적 수정 (No LLM)                │
│  → 해결되면 즉시 반환                    │
└────────────────┬────────────────────────┘
                 │ 미해결
                 ▼
┌─────────────────────────────────────────┐
│  Stage 2: Architect-Editor Pass         │
│  ─ Architect: LLM → FixPlan (구조화)    │
│  ─ Editor: 계획 → 도구 호출 (직접 실행) │
│  → 빌드 성공이면 반환                    │
└────────────────┬────────────────────────┘
                 │ 미해결
                 ▼
┌─────────────────────────────────────────┐
│  Stage 3: LLM Tool-Use Loop (Fallback)  │
│  ─ 에러 분류 힌트 주입                   │
│  ─ 자동 학습 (과거 성공/실패) 주입       │
│  ─ 전체 tool-use 루프                    │
└─────────────────────────────────────────┘
```

> 핵심 설계 원칙은 **비용 상승 순서**입니다. Deterministic은 LLM 호출 0회,
> Architect-Editor는 1회(구조화 출력), Fallback은 N회(도구 루프).
> 저비용 단계에서 해결되면 고비용 단계를 건너뜁니다.

---

## 3. ErrorClassifier — 에러를 분류하면 프롬프트가 달라진다

fix 파이프라인의 첫 번째 개선은 **에러 분류**입니다. 모든 빌드 에러를 동일하게 취급하는 대신, 4가지 카테고리로 분류하고 카테고리별로 다른 프롬프트를 주입합니다.

```python
# core/pipelines/error_classifier.py
class ErrorCategory(StrEnum):
    ENVIRONMENT = "env"       # 인프라/도구체인: JAVA_HOME, Docker, Permission
    BEHAVIOR = "behavior"     # 빌드 성공 + 테스트 실패: assertion, JUnit
    CONFIG = "config"         # 빌드 설정: pom.xml, gradle, dependency
    CODE = "code"             # 소스 코드 컴파일 에러 (fallback)
```

> 4가지 카테고리는 Java 마이그레이션에서 관찰한 에러 패턴을 기반으로 합니다.
> ENVIRONMENT는 LLM이 절대 해결할 수 없고, CONFIG는 소스 수정이 필요 없으며,
> BEHAVIOR는 테스트 코드를 건드리면 안 됩니다. 이 **제약 조건을 프롬프트에 주입**하는 것이
> 분류의 핵심 가치입니다.

분류 알고리즘은 규칙 기반(rule-based)입니다. LLM을 사용하지 않습니다.

```python
# core/pipelines/error_classifier.py
def classify(build_output: str, test_output: str = "") -> ErrorCategory:
    text = (build_output + "\n" + test_output).lower()

    # 1순위: 환경 패턴 (9개)
    env_patterns = ["java_home", "permission denied", "no such file",
                    "connection refused", "docker", ...]
    if any(p in text for p in env_patterns):
        return ErrorCategory.ENVIRONMENT

    # 2순위: 빌드 성공 + 테스트 실패
    build_ok = "build success" in text or "compilation success" in text
    test_fail = "test failure" in text or "tests failed" in text
    if build_ok and test_fail:
        return ErrorCategory.BEHAVIOR

    # 3순위: 설정 파일 패턴 (9개)
    config_patterns = ["pom.xml", "build.gradle", "plugin", "dependency", ...]
    if any(p in text for p in config_patterns):
        return ErrorCategory.CONFIG

    # 4순위: 나머지 → CODE
    return ErrorCategory.CODE
```

> 왜 LLM 기반 분류가 아닌 규칙 기반인가? 세 가지 이유입니다.
> (1) 분류를 위해 LLM을 호출하면 fix 비용이 증가합니다.
> (2) 환경/설정 패턴은 키워드로 충분히 감지됩니다.
> (3) 규칙 기반은 결정적(deterministic)이므로 테스트가 쉽습니다.

각 카테고리는 프롬프트 힌트(prompt hint)를 가지고 있습니다. 이 힌트가 LLM의 행동을 제약합니다.

| 카테고리 | 프롬프트 힌트 |
|----------|--------------|
| **CONFIG** | "pom.xml, build.gradle을 먼저 확인하세요. 소스 코드 수정 금지." |
| **CODE** | "근본 원인을 파악한 후 증상을 수정하세요." |
| **BEHAVIOR** | "테스트 로직과 동작을 비교하세요. **테스트 assertion을 수정하지 마세요.**" |
| **ENVIRONMENT** | "Docker, JDK, 파일 권한, 네트워크를 확인하세요. 소스 코드 금지." |

---

## 4. Stage 1: Deterministic Pass — LLM 호출 0회

3단계 중 첫 번째는 LLM 없이 해결 가능한 패턴을 즉시 수정하는 단계입니다.

### 4.1 탐사 (Exploration Phase)

수정을 시도하기 전에, 프로젝트 상태를 먼저 조사합니다.

```python
# core/pipelines/migration.py — _explore_before_fix()
def _explore_before_fix(source_path, build_error, tool_executor):
    exploration = {}
    # 1. 영향받은 .java 파일 읽기 (처음 30줄)
    exploration["affected_files"] = _read_affected_files(build_error, source_path)

    # 2. Lombok 주석 탐지 (@Data, @Getter, @Builder, ...)
    exploration["lombok_usage"] = _grep_lombok_annotations(source_path)

    # 3. pom.xml 의존성 버전 확인 (lombok, javax, jakarta, nashorn)
    exploration["dep_versions"] = _parse_pom_dependencies(source_path)

    # 4. Import 의존성 그래프 (2-depth)
    exploration["import_graph"] = _build_import_graph(affected_files, depth=2)

    return exploration
```

> 탐사의 핵심 가치는 **context enrichment**(컨텍스트 강화)입니다.
> [44번 포스트](https://rooftopsnow.tistory.com/335)에서 다룬 "Explore-Reason-Act" 패턴의
> 구현체입니다. LLM에게 에러 로그만 주는 대신, 영향 파일의 실제 코드와 의존성 정보를
> 함께 제공합니다.

### 4.2 패턴 감지 + 결정적 수정

알려진 패턴을 감지하면 LLM 호출 없이 직접 수정합니다.

```python
# 예: Lombok 버전 업그레이드 패턴
if "cannot find symbol: method set" in build_error:
    if exploration["lombok_usage"]:
        current_ver = exploration["dep_versions"].get("lombok")
        if current_ver and version_lt(current_ver, "1.18.30"):
            # pom.xml에서 lombok 버전을 직접 업그레이드
            _update_pom_dependency(source_path, "lombok", "1.18.30")
            return attempt, True  # LLM 호출 없이 해결
```

> Deterministic Pass가 해결한 케이스는 LLM 비용이 0입니다.
> Java 마이그레이션에서 빈번한 패턴(Lombok, javax→jakarta, annotation processor)은
> 이 단계에서 처리됩니다.

---

## 5. Stage 2: Architect-Editor Split — 구조화 진단

Deterministic Pass로 해결되지 않으면 LLM을 사용하되, **진단(Architect)과 실행(Editor)을 분리**합니다.

### 5.1 FixPlan — 구조화된 수정 계획

Architect 단계의 출력은 자유 텍스트가 아닌 Pydantic 모델입니다.

```python
# core/pipelines/fix_plan.py
class FixStep(BaseModel):
    file_path: str             # 수정 대상 파일
    description: str           # 한 줄 설명
    old_text: str | None       # 검색할 문자열 (없으면 advisory)
    new_text: str | None       # 치환할 문자열
    line_hint: int | None      # 힌트 줄 번호

class FixPlan(BaseModel):
    root_cause: str                             # 근본 원인 (한 문장)
    category: str = "code"                      # ErrorCategory 값
    affected_files: list[str] = []
    steps: list[FixStep] = Field(max_length=10) # 최대 10단계
    confidence: float = Field(0.5, ge=0.0, le=1.0)
```

> `steps`를 최대 10개로 제한한 이유는 두 가지입니다.
> (1) LLM이 과도하게 많은 수정을 제안하면 부작용 위험이 증가합니다.
> (2) 10단계를 넘기면 근본 원인 분석이 잘못되었을 가능성이 높습니다.
>
> `confidence` 필드는 Architect가 자신의 진단에 대한 확신도를 0~1로 표현합니다.
> 0.3 미만이면 Editor 단계를 건너뛰고 Fallback(Stage 3)으로 직행합니다.

### 5.2 Architect Phase

```python
# core/pipelines/migration.py — _architect_phase()
plan = call_llm_parsed(
    system="You are a Java migration architect. Analyze the build error "
           "and produce a structured fix plan.",
    user=f"""
BUILD ERROR (first 8000 chars):
{build_error[:8000]}

TEST ERROR (first 4000 chars):
{test_error[:4000]}

EXPLORATION:
{json.dumps(exploration, indent=2)}

PRIOR ATTEMPTS (last 3):
{format_prior_attempts(prior_attempts[-3:])}
""",
    output_model=FixPlan,
    model=current_model,
)
```

> Architect에게 `prior_attempts`를 주는 이유는 **이미 시도한 접근의 반복을 방지**하기
> 위해서입니다. "이전에 X를 시도했으나 실패했다"는 정보가 있으면
> LLM은 다른 접근을 선택합니다.

### 5.3 Editor Phase

Architect가 만든 FixPlan을 직접 도구 호출로 실행합니다.

```python
# core/pipelines/migration.py — _editor_phase()
def _editor_phase(plan: FixPlan, tool_executor, source_path) -> tuple[bool, str]:
    applied = []
    for step in plan.steps:
        if step.old_text and step.new_text:
            # 직접 str_replace_editor 호출 (LLM 거치지 않음)
            result = tool_executor(
                name="str_replace_editor",
                path=str(source_path / step.file_path),
                old_str=step.old_text,
                new_str=step.new_text,
            )
            applied.append(step.file_path)
        # old_text 없는 advisory 스텝은 건너뜀

    # 빌드 검증
    build_ok = _run_build_and_check(tool_executor)
    return build_ok, f"Applied {len(applied)} edits"
```

> Architect-Editor 분리의 핵심 이점은 **LLM 호출 횟수 감소**입니다.
> 기존 tool-use 루프는 "파일 읽기 → 에러 분석 → 수정 → 빌드 → 다시 분석"을
> 매번 LLM과 주고받습니다. Architect-Editor는 진단 1회 → 실행 N회(도구 직접 호출)로
> LLM 호출을 1회로 줄입니다.

---

## 6. FixEventLog — 같은 실수를 반복하지 않는 자동 학습

3번째 iteration에서 실패한 접근을 5번째에서 다시 시도하는 문제. 이것을 해결하는 것이 FixEventLog입니다.

### 6.1 에러 서명 (Error Signature)

```python
# core/pipelines/fix_event_log.py
def compute_error_signature(build_output: str) -> str:
    """에러 출력에서 파일 경로와 줄 번호를 정규화한 후 SHA256[:16] 반환."""
    normalized = re.sub(r"\.java:\d+", ".java:0", build_output)
    normalized = re.sub(r"/[\w/]+/src/", "SRC/", normalized)
    return hashlib.sha256(normalized.encode()).hexdigest()[:16]
```

> 줄 번호와 절대 경로를 정규화하는 이유는 "같은 에러"의 판정 기준을 넓히기 위해서입니다.
> `Foo.java:42`와 `Foo.java:45`에서 같은 `cannot find symbol` 에러가 발생하면
> 본질적으로 같은 문제입니다.

### 6.2 학습 주입 (Auto-Learnings Injection)

```python
# core/pipelines/fix_event_log.py
def format_learnings(events: list[FixEvent]) -> str:
    lines = ["## Auto-Learnings (from fix event log)"]
    for e in events:
        tag = "WORKED" if e.result == "success" else "FAILED"
        lines.append(
            f"- [{tag}] iter={e.iteration}, category={e.error_category}: "
            f"{e.summary}"
        )
        if e.result == "failure":
            lines.append("  Avoid this approach.")
    return "\n".join(lines)
```

이 포맷이 LLM 프롬프트에 주입됩니다.

```markdown
## Auto-Learnings (from fix event log)
- [WORKED] iter=1, category=code: Fixed Lombok annotation processor
  Root cause: Missing annotationProcessorPaths in pom.xml
- [FAILED] iter=2, category=config: Wrong plugin version
  Avoid this approach.
```

> `[FAILED]` 뒤에 "Avoid this approach."를 명시적으로 붙이는 것이 중요합니다.
> LLM은 실패 사례를 보더라도 "이번에는 다를 수 있다"고 판단하여 같은 접근을
> 시도하는 경향이 있습니다. 직접적인 금지 지시가 이를 방지합니다.

---

## 7. Convergence Detection — 무한 루프 방지

DAG 토폴로지에서 `validate → fix` 루프는 이론적으로 무한히 반복될 수 있습니다. Convergence Detection(수렴 감지)이 이 문제를 해결합니다.

```python
# core/pipelines/migration.py
def _is_stuck(state: MigrationState) -> bool:
    """마지막 2개 fix_attempt의 에러 서명이 동일하면 수렴 실패."""
    attempts = state.get("fix_attempts", [])
    if len(attempts) < 2:
        return False
    last_two = attempts[-2:]
    return (last_two[0]["error_signature"] == last_two[1]["error_signature"]
            and last_two[0]["result"] == "failure"
            and last_two[1]["result"] == "failure")
```

수렴 실패가 감지되면 **회복 모드(Recovery Mode)**가 작동합니다.

```
validate → stuck 감지
    │
    ├── recovery_attempted=False
    │   └── fix 1회 + auto_learnings 전체 재주입
    │       └── 성공 → validate → measure
    │       └── 실패 → recovery_attempted=True
    │
    └── recovery_attempted=True
        └── 포기 → measure (부분 결과 기록)
```

> 회복 모드가 auto_learnings를 "전체 재주입"하는 이유는 일종의 **리셋**입니다.
> 기존 iteration에서 축적된 컨텍스트가 오히려 LLM을 잘못된 방향으로 유도할 때,
> 과거 성공/실패 사례만 깨끗하게 주입하면 다른 접근을 선택할 가능성이 높아집니다.

---

## 8. Backpressure — 3 편집마다 빌드 검증

LLM이 tool-use 루프에서 파일을 20개 수정한 후에야 빌드를 실행하면, 어느 수정이 문제인지 알 수 없습니다. Backpressure Executor가 이를 방지합니다.

```python
# core/pipelines/migration.py
class _BackpressureExecutor:
    def __call__(self, name: str, **kwargs) -> dict:
        if name == "str_replace_editor":
            self.edit_count_since_build += 1
            if self.edit_count_since_build >= 3:
                # 강제 빌드 (Docker 모드 자동 감지)
                build_result = self.tool_executor(name="java_build", ...)
                self.edit_count_since_build = 0
                return {"result": ..., "build_feedback": build_result}
        elif name == "java_build":
            self.edit_count_since_build = 0
        return self.tool_executor(name=name, **kwargs)
```

> 임계값 3은 경험적 값입니다. 1이면 매 수정마다 빌드하여 느리고,
> 5 이상이면 에러 원인 추적이 어렵습니다. 3은 "관련 파일 그룹 수정 후 검증"에
> 적합한 균형점입니다.

---

## 9. 비용 최적화 — 단계별 비용 구조

3단계 파이프라인의 비용 구조는 의도적으로 설계되었습니다.

| 단계 | LLM 호출 | 모델 | 비용 |
|------|---------|------|------|
| **Deterministic** | 0회 | — | $0 |
| **Architect-Editor** | 1회 (구조화) | Sonnet (기본) | ~$0.02 |
| **Fallback Loop** | N회 (도구 루프) | Sonnet → Opus (에스컬레이션) | $0.10~$1.00+ |

에스컬레이션 규칙:
- 기본: Sonnet으로 시작
- 3회 연속 실패: Opus로 에스컬레이션 (더 강력한 모델)
- Opus에서도 실패 + stuck: 회복 모드 → 포기

각 시도(attempt)별로 토큰 사용량과 비용이 기록됩니다.

```python
attempt = {
    "iteration": 3,
    "input_tokens": 12500,
    "output_tokens": 3200,
    "cost_usd": 0.085,
    "escalated": False,
    "model_used": "claude-sonnet-4-6",
    "error_signature": "a1b2c3d4e5f6g7h8",
    "result": "success",
}
```

> 비용 추적이 중요한 이유는 **예산 게이트(budget gate)** 때문입니다.
> 누적 비용이 `budget_usd`를 초과하면 fix_node는 즉시 중단하고 measure로 이동합니다.
> 이는 Karpathy 래칫 패턴의 "고정 예산(fixed budget)" 원칙입니다.

---

## 10. 전후 비교

| 항목 | 이전 (v0.19) | 현재 (v0.20+) |
|------|-------------|---------------|
| 에러 분류 | 없음 — 모든 에러 동일 취급 | 4가지 카테고리, 카테고리별 프롬프트 힌트 |
| 수정 전 탐사 | 없음 | Exploration Phase (파일, Lombok, 의존성, Import 그래프) |
| 결정적 수정 | 없음 | Deterministic Pass — LLM 호출 0회 |
| 진단 구조 | 자유 텍스트 | Architect-Editor split — FixPlan (Pydantic) |
| 학습 기록 | 없음 | FixEventLog (JSONL) + auto-learnings 주입 |
| 수렴 감지 | 없음 → 무한 루프 위험 | `_is_stuck()` + Recovery Mode |
| 편집 제어 | 무제한 | Backpressure — 3 편집마다 빌드 |
| 비용 추적 | 없음 | 시도별 토큰/USD, 예산 게이트 |
| 코드 규모 | ~385줄 단일 함수 | 3,248줄 + 3 서브모듈 |

---

## 11. 마무리

### 핵심 정리

| 구성요소 | 역할 | 파일 |
|---------|------|------|
| ErrorClassifier | 4-카테고리 규칙 기반 분류 | `error_classifier.py` (151줄) |
| FixPlan | Architect 출력 구조화 모델 | `fix_plan.py` (34줄) |
| FixEventLog | JSONL 자동 학습 추적 | `fix_event_log.py` (102줄) |
| Deterministic Pass | 알려진 패턴 즉시 수정 | `migration.py` Stage 1 |
| Architect-Editor | 구조화 진단 → 직접 실행 | `migration.py` Stage 2 |
| Backpressure | 3 편집마다 빌드 검증 | `migration.py` |
| Convergence Detection | 2회 연속 동일 에러 → 회복/포기 | `migration.py` |

### 설계 체크리스트

- [x] 에러 유형별 다른 프롬프트 제약 주입
- [x] Deterministic 우선 → LLM은 마지막 수단
- [x] Architect(진단)와 Editor(실행) 관심사 분리
- [x] 과거 시도 실패/성공 사례 자동 주입
- [x] 수렴 실패 감지 + 회복 모드 + 최종 포기
- [x] 편집 단위 빌드 피드백 (Backpressure)
- [x] 시도별 비용 추적 + 예산 게이트

---

*Source: `blog/posts/reode/56-intelligent-fix-pipeline.md` | Category: [[blog-reode]]*

## Related

- [[blog-reode]]
- [[blog-hub]]
- [[geode]]
- [[geode-architecture]]
