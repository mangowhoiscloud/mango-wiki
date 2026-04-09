---
title: "Explore-Reason-Act 패턴 — fix_node는 왜 `setMsg()`를 직접 구현했는가"
type: reference
category: blog-post
tags: [blog, reode]
source: "blog/posts/reode/44-explore-reason-act-fix-node.md"
created: 2026-04-08T00:00:00Z
---

# Explore-Reason-Act 패턴 — fix_node는 왜 `setMsg()`를 직접 구현했는가

> "cannot find symbol: method setMsg()" 오류 40개.
> LLM은 성실하게 40개의 setter를 손으로 구현했습니다.
> Model 클래스에 `@Data` annotation이 붙어있는데도.

이것은 LLM의 한계가 아닙니다. **탐색 범위(exploration scope)의 실패**입니다.

---

## Context: 3-hop reasoning의 벽

Java 8에서 Java 22로 마이그레이션할 때, Lombok 라이브러리의 버전 비호환은 흔한 문제입니다. Lombok의 `@Data` annotation은 컴파일 타임에 getter/setter/toString/equals를 자동 생성합니다. Lombok 버전이 Java 22와 호환되지 않으면 annotation processor가 실행되지 않고, 결과적으로 "cannot find symbol: method setMsg()" 같은 오류가 수십 개 쏟아집니다.

올바른 해결책은:
1. **오류를 읽고** (setMsg를 찾을 수 없다)
2. **Model 클래스를 탐색하고** (@Data annotation이 있다 -> Lombok 사용 중)
3. **pom.xml의 Lombok 버전을 확인하고** (1.18.20 -> Java 22 비호환)
4. **버전을 업그레이드합니다** (1.18.34 + annotationProcessorPaths 추가)

이것은 **3-hop reasoning**입니다: 오류 -> Model 클래스 -> pom.xml -> 버전 업그레이드. 문제는 fix_node의 LLM이 1-hop에서 멈췄다는 것이었습니다. 오류를 보고, 오류가 발생한 파일만 열고, setter가 없으니 setter를 구현합니다. Model 클래스를 열어보지 않습니다. pom.xml은 더더욱 열어보지 않습니다.

이 행동은 GLM-5와 Claude Opus 모두에서 관찰되었습니다. 모델의 능력 문제가 아니라, **context에 필요한 정보가 없으면 reasoning이 시작되지 않는다**는 구조적 문제였습니다.

---

## Trade-offs: 네 가지 접근

### Approach 1: Prompt-only — "Find the root cause" 지시 (실패)

가장 먼저 시도한 것은 system prompt에 명시적 지시를 추가하는 것이었습니다.

```
When you see many similar errors (e.g., 20+ "cannot find symbol" for setters/getters):
1. Do NOT fix each error individually
2. Identify the ROOT CAUSE (missing dependency, missing annotation processor, removed API)
3. Fix the root cause ONCE
```

**결과**: GLM-5와 Opus 모두 무시했습니다. "root cause를 찾아라"는 지시는 있지만, root cause를 찾기 위해 **어디를 봐야 하는지**에 대한 정보가 없었습니다. LLM은 컨텍스트에 없는 파일을 자발적으로 탐색하지 않습니다 -- 적어도 tool-use loop에서 충분한 rounds가 보장되지 않으면 그렇습니다.

### Approach 2: Pre-exploration — `_explore_before_fix()` (부분 성공)

LLM 호출 전에 프로그래밍적으로 증거를 수집하여 prompt에 주입하는 방식입니다:

```python
def _explore_before_fix(build_error, source_path, tool_executor) -> str:
    findings: list[str] = []

    # 1. Extract affected file paths from build error
    file_pattern = re.compile(r"\[ERROR\]\s+(/[^\s:]+\.java):\[(\d+)")
    affected_files: set[str] = set()
    for match in file_pattern.finditer(build_error):
        affected_files.add(match.group(1))

    # 2. Read first 3 affected files (look for annotations, imports)
    for fpath in list(affected_files)[:3]:
        result = tool_executor(name="read_file", file_path=fpath, start_line=1, end_line=30)
        ...

    # 3. Grep for Lombok annotations
    result = tool_executor(
        name="run_bash",
        command=f'grep -rn "@Data|@Getter|@Setter|@Builder|import lombok" '
                f'"{source_path}/src" 2>/dev/null | head -10',
    )

    # 4. Check pom.xml for dependency versions
    # 5. Check annotation processor config
    ...
    return "\n".join(findings)
```

**부분 성공**: Lombok annotation이 소스 트리 어딘가에 있으면 감지합니다. 하지만 **오류가 발생한 파일(예: Controller)과 annotation이 있는 파일(예: Model)이 다른 패키지에 있으면** 3개 파일만 읽는 것으로는 충분하지 않았습니다. Controller를 읽었는데 거기에는 `@Data`가 없습니다. Model 클래스를 안 읽었으니 Lombok 사용 여부를 판단할 수 없었습니다.

### Approach 3: Pattern detection + deterministic fix (채택)

특정 오류 패턴에 대해 LLM의 추론에 의존하지 않고, **코드로 직접 진단하고 코드로 직접 수정**하는 방식입니다.

```python
def _detect_fix_patterns(build_error, exploration, source_path) -> str:
    instructions: list[str] = []

    # Pattern 1: Lombok getter/setter missing
    has_setter_errors = "cannot find symbol" in build_error.lower() and (
        "method set" in build_error.lower() or "method get" in build_error.lower()
    )
    has_lombok_annotations = "@Data" in exploration or "@Getter" in exploration

    if has_setter_errors and has_lombok_annotations:
        instructions.append(
            "## DETECTED PATTERN: Lombok Getter/Setter Missing\n\n"
            "**Root Cause**: Lombok annotation processor is not generating getters/setters.\n"
            "**Required version for Java 22**: 1.18.34+\n\n"
            "### EXACT FIX (do these steps in order):\n"
            "**Step 1**: Read pom.xml to find the current Lombok dependency\n"
            "**Step 2**: Upgrade Lombok version to 1.18.34\n"
            "**Step 3**: Add annotationProcessorPaths to maven-compiler-plugin\n"
            "**Step 4**: Run java_build to verify ALL setter/getter errors are resolved\n\n"
            "**DO NOT** implement getters/setters manually.\n"
        )
    ...
```

그리고 패턴이 확실한 경우 LLM 없이 직접 수정합니다:

```python
def _apply_deterministic_fixes(build_error, exploration, source_path) -> str:
    changes: list[str] = []
    pom_path = Path(source_path) / "pom.xml"

    has_setter_errors = "cannot find symbol" in build_error.lower() and (
        "method set" in build_error.lower() or "method get" in build_error.lower()
    )
    # Check Lombok in BOTH exploration AND direct source grep
    has_lombok_in_exploration = "@Data" in exploration or "@Getter" in exploration
    if not has_lombok_in_exploration and source_path:
        # Direct grep for Lombok in source (exploration may have missed Model classes)
        grep_result = subprocess.run(
            ["grep", "-rl", "@Data", str(Path(source_path) / "src")],
            capture_output=True, text=True, timeout=5,
        )
        has_lombok_in_exploration = bool(grep_result.stdout.strip())

    if has_setter_errors and has_lombok and pom_path.exists():
        content = pom_path.read_text(encoding="utf-8")
        # Upgrade Lombok version
        old_lombok = re.search(
            r"(<groupId>org\.projectlombok</groupId>\s*"
            r"<artifactId>lombok</artifactId>\s*"
            r"<version>)([\d.]+)(</version>)",
            content, re.DOTALL,
        )
        if old_lombok and old_lombok.group(2) < "1.18.30":
            # ... version upgrade + annotationProcessorPaths injection
            changes.append(f"Lombok version upgraded: {old_lombok.group(2)} -> 1.18.34")
    ...
```

핵심은 exploration이 Model 클래스를 놓쳤을 때의 보완입니다. `exploration`에서 `@Data`를 찾지 못하면, **직접 `grep -rl "@Data" src/`를 실행**하여 Lombok 사용 여부를 확인합니다. 이 한 줄의 grep이 3-hop reasoning 실패를 보완합니다.

### Approach 4: Skill injection (보완)

`java-migration-diagnostic.md` skill 파일에 7개의 known pattern을 기술하여 LLM의 system prompt에 주입합니다. Deterministic fix가 적용되지 않는 미지의 패턴에 대해 LLM의 reasoning을 안내하는 역할입니다.

---

## fix_node의 완성된 흐름

```
build_error 입력
    |
    v
[1] _explore_before_fix()     -- 증거 수집 (affected files, Lombok grep, pom.xml)
    |
    v
[2] _detect_fix_patterns()    -- 패턴 매칭 -> 구체적 fix instruction 생성
    |
    v
[3] _apply_deterministic_fixes() -- 확실한 패턴은 LLM 없이 직접 수정
    |
    +---> 수정 후 rebuild 성공? -> return (LLM 호출 없이 종료)
    |
    v
[4] LLM tool-use loop         -- 나머지 오류에 대해 LLM 투입
    |                             (exploration + instruction이 context에 주입됨)
    v
result
```

이 4단계 파이프라인은 비용을 극적으로 줄입니다. Lombok 패턴의 경우 `_apply_deterministic_fixes()`에서 해결되므로 LLM 토큰 소비가 0입니다. 40개의 "cannot find symbol" 오류가 pom.xml 한 줄 수정으로 모두 해소됩니다.

---

## "Claude Code는 왜 이걸 해결하는데 fix_node는 못하나?"

이 질문이 전체 리팩토링의 동기였습니다. 단순한 기능 비교가 아니라, **agentic system의 설계 원칙을 도출하기 위한 아키텍처 분석**이었습니다. Claude Code와 fix_node는 동일한 LLM을 사용하면서도 전혀 다른 결과를 보여주었고, 그 차이는 모델의 능력이 아니라 **모델을 둘러싼 harness의 구조**에서 비롯된 것이었습니다.

| 요소 | Claude Code | fix_node (개선 전) |
|------|-------------|-------------------|
| 탐색 범위 | 전체 프로젝트 | 오류 파일 3개 |
| Context 크기 | 200K tokens | ~8K tokens |
| Session 연속성 | 유지 | 매 iteration 초기화 |
| Tool rounds | 무제한 | 5~10 rounds |

이 비교가 중요한 이유는, **같은 LLM도 harness 설계에 따라 1-hop 추론에 머물거나 3-hop 추론을 완수할 수 있다**는 사실을 보여주기 때문입니다. Claude Code는 파일 트리를 자유롭게 탐색하고, Model 클래스를 열어보고, pom.xml을 읽고, annotation processor 설정을 확인한 뒤에 Lombok 버전을 업그레이드합니다. 이 모든 것이 하나의 연속된 세션에서 일어납니다.

fix_node의 개선은 이 차이를 **구조적으로 메웁니다**: exploration으로 탐색 범위를 넓히고, pattern detection으로 multi-hop reasoning을 코드화하고, deterministic fix로 확실한 문제는 LLM 없이 해결합니다. Claude Code가 200K 토큰의 context window와 무제한 tool rounds로 달성하는 것을, fix_node는 사전 탐색과 패턴 코드화로 8K 토큰 안에서 달성하는 것입니다.

---

## Decision Rationale

Prompt-only 접근이 실패한 이유는 근본적입니다: **LLM은 context에 없는 정보를 추론할 수 없습니다.**

이 원칙은 harness engineering에서 가장 중요한 통찰 중 하나입니다. LLM은 주어진 context 안에서 놀라울 정도로 정교한 추론을 수행하지만, context에 존재하지 않는 사실을 "발견"하지는 못합니다. "root cause를 찾아라"고 지시해도, Model 클래스의 내용이 context에 없으면 Lombok을 의심할 근거가 없습니다. 이것은 LLM의 결함이 아니라 정보 이론적 한계입니다 -- 입력에 없는 정보는 출력에 나타날 수 없습니다.

따라서 harness 설계자의 역할은 "더 좋은 지시를 작성하는 것"이 아니라, **LLM이 올바른 결론에 도달하기 위해 필요한 증거를 context에 배치하는 것**입니다. Exploration이 바로 그 역할을 수행합니다. `_explore_before_fix()`는 LLM에게 "무엇을 해라"가 아니라 "이것을 보라"를 제공합니다. 지시(instruction)와 증거(evidence)의 차이가 prompt engineering과 context engineering의 차이이며, 이 경험은 후자가 전자보다 훨씬 강력하다는 것을 보여주었습니다.

Deterministic fix를 선택한 이유는 경제적입니다: Lombok 버전 업그레이드는 **항상 동일한 절차**입니다. LLM 토큰을 소비하여 매번 같은 결론에 도달할 이유가 없습니다. 알려진 패턴은 코드로, 미지의 패턴만 LLM으로 처리하는 것이 올바른 분업입니다.

---

## What's Next

현재 `_detect_fix_patterns()`는 4개의 패턴을 지원합니다: Lombok, Nashorn, javax->jakarta, duplicate POM tag. Java 마이그레이션에서 발생하는 패턴은 이보다 훨씬 많습니다.

계획 중인 확장:
- **Pattern registry**: 패턴을 YAML/TOML 파일로 외부화하여 코드 수정 없이 추가합니다. 이것이 중요한 이유는 유지보수성에 있습니다. 현재 패턴은 Python 코드 안에 하드코딩되어 있어서, 새 패턴을 추가하려면 코드를 수정하고 테스트하고 배포해야 합니다. 외부 YAML 파일로 분리하면 패턴 추가가 설정 변경으로 격하되고, 비개발자(예: Java 마이그레이션 전문가)도 자신의 경험에서 발견한 패턴을 직접 등록할 수 있게 됩니다. 패턴 지식과 실행 코드의 분리는 시스템의 성장 속도를 결정하는 핵심 아키텍처 결정입니다.
- **LEARNINGS.md feedback loop**: deterministic fix가 성공하면 LEARNINGS.md에 기록되고, 같은 프로젝트의 다음 iteration에서 참조됩니다.
- **Exploration depth 동적 조절**: 오류 수가 20개 이상이면 affected files 탐색을 3개에서 10개로 확장합니다.

"LLM에게 더 잘 지시하면 된다"는 접근은 한계가 있습니다. 진짜 해결책은 **LLM이 볼 수 있는 세계를 넓혀주는 것**입니다. Explore-Reason-Act는 그 원칙의 코드화입니다.

---

*Source: `blog/posts/reode/44-explore-reason-act-fix-node.md` | Category: [[blog-reode]]*

## Related

- [[blog-reode]]
- [[blog-hub]]
- [[geode]]
- [[geode-architecture]]
