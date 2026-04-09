---
title: "REODE 트러블슈팅 크로니클: fix_node가 Lombok을 풀기까지"
type: reference
category: blog-post
tags: [blog, reode]
source: "blog/posts/reode/48-reode-troubleshooting-chronicle.md"
created: 2026-04-08T00:00:00Z
---

# REODE 트러블슈팅 크로니클: fix_node가 Lombok을 풀기까지

> 이 문서는 REODE의 재귀개선루프(fix_node)가 Java 마이그레이션 에러를 자율적으로
> 해결하는 과정에서 마주한 모든 문제와 해결 과정을 시간순으로 기록한 것입니다.
> 각 트러블슈팅은 독립적으로 읽을 수 있으며, 전체를 통해 읽으시면
> "LLM 기반 자율 코드 수정"의 현실적 난이도를 체감하실 수 있습니다.

---

## TS-01. OpenRewrite 플러그인 주입 — 중복 `<build>` 태그

**발견**: 1차 E2E 실행 (GLM-5, t5-ssm-liyifeng)

**증상**: `Non-parseable POM: Duplicated tag: 'build'`

**원인**: `_ensure_openrewrite_plugin()`이 프로젝트에 `<build>` 섹션이 없을 때 새 블록을 생성하는데, `<plugins>`가 `<reporting>` 등 다른 섹션에 존재하면 Strategy 2가 먼저 매칭되어 삽입. 이후 Strategy 3이 또 `<build>`를 생성하여 중복 발생.

**해결**: 함수를 재작성. `<build>` 존재 여부를 먼저 확인하고, 내부에 `<plugins>` 유무에 따라 분기. 절대 두 번째 `<build>`를 생성하지 않음.

**PR**: #227

**교훈**: 파이프라인 인프라 코드의 버그는 LLM이 고칠 수 없습니다. fix_node는 pom.xml XML 구조를 이해하지 못하고 동일 에러를 반복했습니다. 인프라 레이어와 LLM 레이어의 책임 경계를 명확히 하는 것이 중요합니다.

---

## TS-02. GLM-5 tool-use 포맷 호환성

**발견**: GLM-5로 첫 E2E 시도 시

**증상**: `tools[0].type: type cannot be empty` (GLM API 400 에러)

**원인**: fix_node의 `_build_fixer_tool_defs()`가 Anthropic 포맷(`name`, `input_schema`)으로 도구를 정의. GLM은 OpenAI 포맷(`type: "function"`, `function: {name, parameters}`)을 기대.

**해결**: `OpenAIAdapter._normalize_tools()` — Anthropic 포맷 자동 감지 후 OpenAI 포맷으로 변환.

**PR**: #195

**교훈**: 멀티 프로바이더 지원은 "모델만 바꾸면 된다"가 아닙니다. 도구 정의 포맷, 응답 파싱, 에러 형식까지 전부 정규화해야 합니다.

---

## TS-03. Provider↔Model 불일치 — glm-5가 Anthropic API에 전송

**발견**: `.env`에서 `REODE_MODEL=glm-5` + `REODE_LLM_PRIMARY_PROVIDER=anthropic` 공존 시

**증상**: `not_found_error: model: glm-5` (Anthropic API 404)

**원인**: `settings.model`과 `settings.llm_primary_provider`가 독립 설정. ClaudeAdapter가 Anthropic API에 `model: glm-5`를 전송.

**해결**: Model-First 설계 — `infer_provider(model)`로 모델명에서 프로바이더를 자동 추론. `REODE_LLM_PRIMARY_PROVIDER` 수동 설정 불필요.

**PR**: #201

**교훈**: 종속 관계가 있는 두 설정을 독립 필드로 두면 불일치가 발생합니다. Single Source of Truth 원칙을 적용해야 합니다.

---

## TS-04. 수렴 감지 오탐 — fix_node 실행 전에 포기

**발견**: `_route_after_validate`에 수렴 감지 추가 후

**증상**: fix_node가 한 번도 실행되지 않았는데 `ROUTE: convergence detected → measure` 로그

**원인**: 이전 세션의 LangGraph 체크포인트가 남아있어 `fix_attempts`에 이전 데이터 잔류. 수렴 감지가 현재 validate의 `build_error_output`과 이전 세션의 `build_error_snapshot`을 비교하여 매칭.

**해결**: `fix_attempts[-2:]`에 `build_error_snapshot` 키가 실제로 존재하는지 확인하는 가드 추가. fix_node가 설정한 키만 비교.

**PR**: #232

**교훈**: LangGraph 체크포인트가 세션 간 state를 공유할 수 있습니다. 새 필드를 비교할 때는 "이 필드가 이 노드에 의해 설정되었는가"를 먼저 확인해야 합니다.

---

## TS-05. 에스컬레이션 우선순위 역전 — 수렴이 Opus 기회를 차단

**발견**: 에스컬레이션 + 수렴 감지 동시 활성화 후

**증상**: GLM-5가 3회 실패 → 수렴 감지 → measure로 직행. Opus에게 기회 없음.

**원인**: `_route_after_validate`에서 수렴 감지 블록이 에스컬레이션 recovery 블록보다 먼저 실행. 수렴 → measure 리턴으로 recovery 코드에 도달 불가.

**해결**: 로직 통합. `is_stuck = _is_stuck(state) or converged`. stuck/converged → recovery 먼저, recovery 실패 → 그때 measure.

**PR**: #234

**교훈**: 두 개의 "포기" 조건(stuck, converged)과 하나의 "재시도" 조건(recovery)이 있으면, 재시도가 항상 포기보다 먼저 평가되어야 합니다. 이것은 방어적 프로그래밍의 기본 원칙이기도 합니다.

---

## TS-06. `fix_attempts` 누적 버그 — 에스컬레이션 조건 영원히 미충족

**발견**: cross-provider 에스컬레이션 구현 후 테스트

**증상**: fix_node가 3회 실행됐는데 `fix_attempts: 1`. 에스컬레이션 조건 `len(prior_attempts) >= 2` 미충족.

**원인**: `_merge_event_output()`이 `fix_attempts`를 리스트 누적이 아닌 덮어쓰기로 처리. `errors`와 `analyses`만 특별 처리하고 나머지는 `final_state[k] = v`.

**해결**: `_LIST_ACCUMULATE_KEYS = {"analyses", "errors", "findings", "transforms", "fix_attempts"}` — LangGraph의 `operator.add` reducer와 동일하게 CLI 레벨에서도 누적.

**교훈**: LangGraph 내부에서는 reducer가 정상 작동하지만, CLI의 `graph.stream()` 이벤트를 수동 병합하는 코드가 reducer를 우회합니다. 두 계층의 병합 로직이 반드시 일치해야 합니다.

---

## TS-07. `should_escalate` 조건 오류 — LLM 호출 성공 ≠ 빌드 성공

**발견**: fix_attempts 누적 수정 후 재실행

**증상**: `fix_attempts=3, should_escalate=False`. 3회 시도, 에스컬레이션 안 됨.

**원인**: `should_escalate = len(prior_attempts) >= 2 and all(not a.get("success") for a in prior_attempts[-2:])`. `success=True`는 "LLM 호출이 에러 없이 완료됨"이지 "빌드가 고쳐짐"이 아님. LLM이 코드를 수정했지만 빌드가 여전히 실패해도 `success=True`.

**해결**: `should_escalate = len(prior_attempts) >= 2 and bool(build_error)` — 빌드 에러 존재 여부로 판단.

**교훈**: "시도 성공"과 "문제 해결"은 다른 개념입니다. 에스컬레이션 조건은 반드시 문제 해결 여부를 기준으로 판단해야 합니다.

---

## TS-08. 크로스 프로바이더 에스컬레이션 — adapter 고정 문제

**발견**: `model=claude-opus-4-6`을 GLM adapter에 전달

**증상**: GLM API가 `claude-opus-4-6` 모델명을 거부하거나 무시

**원인**: `get_llm_tool()`이 반환하는 `_tool_fn`이 `ReodeRuntime.create()` 시점의 primary adapter(GLM)에 바인딩. `model=` 파라미터는 같은 adapter 내에서만 유효.

**해결**: secondary adapter의 tool-use callable을 별도 contextvar에 주입. `get_secondary_llm_tool()` → fix_node가 에스컬레이션 시 직접 호출.

**PR**: #237

**교훈**: 멀티 프로바이더 시스템에서 모델 에스컬레이션은 "모델명 교체"가 아니라 "adapter 교체"입니다. 이 구분을 놓치면 잘못된 API 엔드포인트로 요청이 전송됩니다.

---

## TS-09. 탐색 범위 문제 — 에러 파일 ≠ 원인 파일

**발견**: Lombok 패턴 감지 실패 분석

**증상**: `_explore_before_fix()`가 143자 탐색 결과 반환. `@Data` 미발견. Lombok 패턴 미감지.

**원인**: 에러는 `UserController.java`(setter 호출하는 쪽)에서 발생. `@Data`는 `model/User.java`(setter 선언하는 쪽)에 있음. 탐색이 에러 파일의 처음 30줄만 읽으므로 Model 클래스를 발견 못함.

**해결**: `_apply_deterministic_fixes()`에서 exploration 결과와 무관하게 `grep -rl @Data src/` 직접 실행. 에러 파일이 아닌 **소스 전체**에서 Lombok 사용 여부를 확인.

**PR**: #245

**교훈**: 에러 위치와 원인 위치가 다른 것이 Java 마이그레이션의 핵심 난이도입니다. 탐색은 에러 파일이 아니라 프로젝트 전체를 대상으로 해야 합니다.

---

## TS-10. LLM의 str_replace whitespace 매칭 실패

**발견**: 패턴 기반 수정 지시 후

**증상**: `_detect_fix_patterns()`가 정확한 수정 지시를 생성하고 프롬프트에 주입. 하지만 LLM이 `str_replace_editor` 호출 시 pom.xml의 탭/공백 들여쓰기를 정확히 매칭하지 못해 "old_string not found" 에러.

**원인**: pom.xml이 탭으로 들여쓰기되어 있는데, 프롬프트의 예시 코드는 공백으로 작성. LLM이 프롬프트의 공백을 그대로 old_string에 사용.

**해결**: 패턴 감지 시 LLM을 거치지 않고 `_apply_deterministic_fixes()`가 regex로 직접 pom.xml을 수정. 정확한 whitespace 매칭 문제를 우회.

**PR**: #243

**교훈**: LLM에게 "이 텍스트를 정확히 교체하라"는 지시는 whitespace가 중요한 XML/YAML에서 실패할 확률이 높습니다. 알려진 패턴은 결정론적 코드로 처리하는 것이 훨씬 안정적입니다.

---

## TS-11. 3-Hop 추론의 한계와 해결

**발견**: GLM-5 + Opus 모두 Lombok root cause 미해결

**증상**: `cannot find symbol: setMsg() × 40` → GLM-5는 setter 직접 구현 시도. Opus도 동일.

**원인**: root cause까지 3-hop 추론 필요:
```
에러: "setMsg() not found" (Controller)
  → 1hop: User.java에 @Data 어노테이션 존재
    → 2hop: pom.xml Lombok 1.16.8 (Java 22 미호환)
      → 3hop: annotationProcessorPaths 미설정
```
LLM은 에러 메시지만 보고 직접 수정을 시도. Model 클래스를 읽지 않아 @Data를 발견 못함.

**해결 (3단계)**:
1. `_explore_before_fix()` — 에러 파일 + grep으로 증거 수집 (한계: Model 클래스 미포함)
2. `_detect_fix_patterns()` + `_apply_deterministic_fixes()` — 패턴 감지 → 직접 수정
3. `_build_full_project_context()` — Opus 에스컬레이션 시 프로젝트 전체 맵 + pom.xml 전문 + Model 클래스 전문을 프롬프트에 주입

**PR**: #239, #241, #243, #245, 진행중

**교훈**: LLM의 추론 능력에 의존하지 말고, 추론에 필요한 **모든 증거를 프롬프트에 미리 넣어야** 합니다. Claude Code가 같은 문제를 풀 수 있는 이유는 추론이 뛰어나서가 아니라, Grep/Read로 필요한 파일을 **먼저 읽기** 때문입니다.

---

## TS-12. Opus 에스컬레이션의 진짜 의미

**발견**: cross-provider 에스컬레이션 성공 후

**관찰**: Opus도 Lombok을 해결하지 못했습니다. tools=10에서 tools=2로 오히려 줄었습니다.

**원인**: Opus에게도 동일한 제한된 컨텍스트(143자 탐색, 4000자 에러)가 주어졌습니다. 더 강력한 모델에 같은 입력을 주면 같은 결과가 나옵니다.

**해결**: Opus 에스컬레이션 시 **Claude Code와 동일한 수준의 컨텍스트** 제공:
- `_build_full_project_context()`: 파일 트리 + pom.xml 전문 + Model 클래스 전문 + config 파일
- `_build_opus_system_prompt()`: "senior Java migration expert" 전용 프롬프트
- 에러 15000자 (기존 4000자), tool_rounds 30 (기존 10-20)
- recovery 모드 → 에스컬레이션 강제 연동

**최종 실행 기록** (t5-ssm-jiangcaijun):
```
[0] iter=2  GLM-5    → 결정론적: Lombok 1.18.34 + annotationProcessorPaths + Nashorn 제거
[1] iter=3  GLM-5    → 새 에러 (Java 25 javac) 시도, 실패
[2] iter=4  Opus ESC → cross-provider + full-context, 6 tools
```

**PR**: #247

**교훈**: 모델 에스컬레이션은 "더 똑똑한 모델"이 아니라 **"더 많은 컨텍스트를 가진 모델"**이어야 합니다. Claude Code가 Lombok을 풀 수 있는 이유는 Opus라서가 아니라, 프로젝트 전체를 볼 수 있기 때문입니다.

---

## TS-13. Recovery 모드와 에스컬레이션 분리 — 또 다른 연결 고리

**발견**: Opus full-context 구현 후 E2E

**증상**: recovery 경로로 fix_node에 진입했으나 `model=default` — 에스컬레이션 미발동

**원인**: `_route_after_validate`의 recovery 판단(수렴/stuck → fix 재진입)과 `fix_node` 내부의 에스컬레이션 판단(`should_escalate`)이 독립적으로 평가. recovery로 fix_node에 진입해도 `prior_attempts`의 `success` 플래그가 True(LLM 호출 성공)여서 에스컬레이션 조건 미충족.

**해결**: `should_escalate` 조건에 recovery 상태 연동:
```python
in_recovery = _is_stuck(state) or state.get("recovery_attempted", False)
should_escalate = (len(prior_attempts) >= 2 and build_still_failing) or in_recovery
```

**교훈**: 두 개의 독립적인 판단 지점(routing과 node 내부)이 같은 의도("더 강한 모델로 재시도")를 가질 때, 반드시 상태를 공유해야 합니다. 의도가 같은 판단 로직이 분산되면 일관성이 깨지기 쉽습니다.

---

## 시간순 요약

| # | 문제 | 해결 | PR | 핵심 |
|---|------|------|-----|------|
| 01 | 중복 `<build>` | 함수 재작성 | #227 | 인프라 버그 |
| 02 | GLM tool 포맷 | _normalize_tools | #195 | 프로바이더 정규화 |
| 03 | Provider↔Model | Model-First | #201 | SSoT |
| 04 | 수렴 오탐 | snapshot 키 가드 | #232 | 체크포인트 누수 |
| 05 | 에스컬레이션 역전 | 우선순위 통합 | #234 | 재시도 > 포기 |
| 06 | fix_attempts 덮어쓰기 | _LIST_ACCUMULATE_KEYS | hotfix | reducer 일관성 |
| 07 | success ≠ 해결 | build_error 기준 | hotfix | 조건 의미론 |
| 08 | adapter 고정 | secondary tool_fn | #237 | 크로스 프로바이더 |
| 09 | 에러 ≠ 원인 위치 | 직접 grep | #245 | 탐색 범위 |
| 10 | whitespace 매칭 | 결정론적 수정 | #243 | LLM 한계 우회 |
| 11 | 3-hop 추론 | 패턴+결정론+스킬 | #239~245 | 증거 선제공 |
| 12 | 에스컬레이션=컨텍스트 | full project context | #247 | 모델 < 컨텍스트 |
| 13 | recovery↔에스컬레이션 분리 | in_recovery 연동 | hotfix | 상태 공유 |

---

## 현재 도달점

t5-ssm-jiangcaijun (83파일, Lombok+MyBatis+Spring 4.1, Java 8 → 22):

- **Lombok setter 40+ 에러**: 결정론적 수정으로 **전부 해소**
- **Nashorn import**: 결정론적 삭제로 **해소**
- **남은 에러**: `ExceptionInInitializerError: com.sun.tools.javac.code.TypeTag` — Lombok 1.18.34 + Java 25 javac 내부 API 호환성. 빌드 환경(JDK) 문제.
- **에스컬레이션**: GLM-5 → Opus full-context **정상 작동**

13개의 트러블슈팅을 되돌아보면, 멀티 프로바이더 LLM 시스템을 구축할 때 반복적으로 등장하는 패턴이 보입니다. 첫째, **프로바이더 간 인터페이스 차이**는 예상보다 깊습니다 — tool 포맷, 에러 형식, 응답 구조가 각각 다르며, 이를 adapter 레이어에서 완전히 추상화하지 않으면 상위 로직이 프로바이더별 분기로 오염됩니다 (TS-02, TS-03, TS-08). 둘째, **상태 관리의 일관성**이 가장 많은 버그를 유발했습니다 — 체크포인트 잔류(TS-04), reducer 우회(TS-06), 성공 플래그의 의미 혼동(TS-07), 판단 로직 분산(TS-05, TS-13) 등 13건 중 절반 이상이 상태 동기화 문제였습니다. 셋째, **LLM에게 맡길 수 있는 것과 없는 것의 경계**가 명확합니다 — XML whitespace 매칭(TS-10), 인프라 코드 수정(TS-01), 3-hop 추론(TS-11)은 결정론적 코드가 더 안정적입니다. 결국 LLM 자율 시스템의 품질은 모델의 능력이 아니라, 모델에게 얼마나 정확한 컨텍스트를 제공하고 알려진 패턴을 얼마나 결정론적으로 처리하느냐에 달려 있습니다.

---

## 마무리: 멀티 프로바이더 LLM 자율 시스템의 체크리스트

13건의 트러블슈팅에서 추출한 핵심 교훈을 정리합니다.

**설정과 상태 관리**
- 종속 관계가 있는 설정은 Single Source of Truth로 통합했는가 (TS-03)
- LangGraph reducer와 CLI 병합 로직이 동일하게 동작하는가 (TS-06)
- 체크포인트가 세션 간 오염을 일으키지 않는가 (TS-04)
- 상태 플래그의 의미가 모든 소비자에서 동일하게 해석되는가 (TS-07)

**멀티 프로바이더 호환성**
- tool 정의 포맷이 모든 프로바이더에서 유효한가 (TS-02)
- 에스컬레이션 시 모델명이 아니라 adapter가 교체되는가 (TS-08)
- Hot-reload 시 provider가 model과 함께 재추론되는가 (TS-03)

**LLM 자율 수정의 경계**
- 알려진 패턴(Lombok, Nashorn 등)은 결정론적 코드로 처리하고 있는가 (TS-10, TS-11)
- 탐색 범위가 에러 파일에 국한되지 않고 프로젝트 전체를 포함하는가 (TS-09)
- 에스컬레이션 시 모델 업그레이드뿐 아니라 컨텍스트 업그레이드도 함께 수행하는가 (TS-12)

**라우팅과 판단 로직**
- "재시도" 경로가 "포기" 경로보다 항상 먼저 평가되는가 (TS-05)
- 같은 의도를 가진 판단 지점이 상태를 공유하는가 (TS-13)

---

*13개의 트러블슈팅을 거치며 도달한 결론: LLM 자율 코드 수정의 성능은 모델의 추론 능력이 아니라 **프롬프트에 포함된 증거의 양과 질**에 의해 결정됩니다. 그리고 알려진 패턴은 LLM을 거치지 않는 것이 더 안정적입니다.*

---

*Source: `blog/posts/reode/48-reode-troubleshooting-chronicle.md` | Category: [[blog-reode]]*

## Related

- [[blog-reode]]
- [[blog-hub]]
- [[geode]]
- [[geode-architecture]]
