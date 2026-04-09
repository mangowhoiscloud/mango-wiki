---
title: "Context Hub — AI 코딩 에이전트의 '기억 문제'를 해결하는 세 번째 레이어"
type: reference
category: blog-post
tags: [blog, memory-context]
source: "blog/posts/memory-context/context-hub-agent-context-management.md"
created: 2026-04-08T00:00:00Z
---

# Context Hub — AI 코딩 에이전트의 "기억 문제"를 해결하는 세 번째 레이어

> Date: 2026-03-19 | Author: rooftopsnow | Tags: [context-hub, agent-harness, context-engineering, Andrew Ng, REODE]

## 목차

1. 도입: 에이전트는 왜 틀린 코드를 쓰는가
2. Context Hub란 무엇인가
3. 세 가지 컨텍스트 레이어 — 행동, 도구, 사실
4. 프론티어 비교: 5대 하네스는 이 문제를 어떻게 푸는가
5. REODE의 접근: 3-Tier ContextAssembler
6. 한계와 전망
7. 마무리

---

## 1. 도입: 에이전트는 왜 틀린 코드를 쓰는가

AI 코딩 에이전트에게 "OpenAI GPT-5.2를 호출하는 코드를 작성해줘"라고 요청하면, 높은 확률로 1년 전의 Chat Completions API를 사용합니다. 최신 Responses API가 아니라요. 에이전트의 학습 데이터가 수개월에서 수년까지 뒤처지기 때문입니다.

이것이 **API 환각(Hallucination)** 문제입니다. 잘못된 함수 시그니처, 존재하지 않는 엔드포인트, SDK 버전 혼동 — 에이전트가 "자신있게 틀린 코드"를 작성하는 근본 원인입니다.

여기에 **세션 기억상실(Session Amnesia)** 이 더해집니다. 한 세션에서 "Stripe webhook 검증에는 raw body가 필요하다"는 것을 알아냈어도, 다음 날 새 세션에서는 같은 실수를 반복합니다.

Andrew Ng 팀이 2026년 3월에 릴리스한 **Context Hub**는 이 두 가지 문제에 대한 직접적인 답입니다.

---

## 2. Context Hub란 무엇인가

Context Hub(`@aisuite/chub`)는 **에이전트용 패키지 매니저**입니다. npm이 코드 의존성을 관리하듯, Context Hub는 **API 문서 의존성**을 관리합니다.

### 핵심 아키텍처

```
content/ (Markdown + YAML frontmatter)
    ↓ chub build
registry.json + content tree
    ↓ CDN 배포
CLI (chub get) → 에이전트가 fetch
    ↓
~/.chub/ (로컬 캐시 + annotations)
```

> Context Hub의 설계는 의도적으로 단순합니다. 정적 마크다운 파일을 CDN으로 배포하고, CLI로 가져오는 구조입니다. 복잡한 서버 인프라 없이 "정확한 문서를 정확한 시점에 전달"하는 것에 집중합니다.

### 두 가지 콘텐츠 유형

| 유형 | 파일 | 성격 | 수명 |
|------|------|------|------|
| **Docs** | `DOC.md` | API 레퍼런스 — "what to know" | fetch 후 사용, 후 폐기 |
| **Skills** | `SKILL.md` | 절차적 가이드 — "how to do it" | 에이전트 스킬에 영구 설치 |

### CLI 워크플로우

```bash
# 1. 문서 검색
chub search stripe

# 2. 언어별 문서 가져오기
chub get stripe/api --lang js

# 3. 작업 후 발견한 지식 저장
chub annotate stripe/api "Webhook verification requires raw body"

# 4. 문서 품질 평가
chub feedback stripe/api up --label accurate
```

> 어노테이션(annotation) 시스템이 Context Hub의 핵심 차별점입니다. 에이전트가 작업 중 발견한 워크어라운드를 로컬에 저장하면, 다음 `chub get` 시 문서 끝에 자동 첨부됩니다. "세션 기억상실" 문제의 직접적 해법입니다.

### 현황 (2026-03-19)

- GitHub Stars: 11,373 | Forks: 1,001
- 68+ API 제공자, 600+ 문서 디렉터리
- MCP 서버 모드 (`chub-mcp`) 지원
- Rust 리라이트(`nrl-ai/chub`) 등장: 검색 19배, 빌드 5배, 메모리 1/5

---

## 3. 세 가지 컨텍스트 레이어 — 행동, 도구, 사실

Context Hub를 이해하려면, AI 에이전트가 필요로 하는 컨텍스트를 **세 가지 레이어**로 구분해야 합니다.

```
┌───────────────────────────────────────────────┐
│  Layer 3: Factual Reference                    │
│  "Stripe API의 올바른 호출법은 이것이다"         │
│  → Context Hub, Context7                       │
├───────────────────────────────────────────────┤
│  Layer 2: Tool Execution                       │
│  "이 API를 실제로 호출해라"                      │
│  → MCP Server, Tool Registry                   │
├───────────────────────────────────────────────┤
│  Layer 1: Behavioral Instructions              │
│  "이 프로젝트에서는 TypeScript strict를 쓴다"    │
│  → CLAUDE.md, .cursorrules, program.md         │
└───────────────────────────────────────────────┘
```

> 이 세 레이어는 **경쟁 관계가 아니라 상호 보완 관계**입니다. CLAUDE.md가 "어떻게 행동할지", MCP가 "무엇을 실행할지", Context Hub가 "무엇이 사실인지"를 각각 담당합니다.

### 레이어별 비교

| 항목 | Layer 1 (행동) | Layer 2 (도구) | Layer 3 (사실) |
|------|----------------|----------------|----------------|
| 대표 도구 | CLAUDE.md | MCP Server | Context Hub |
| 콘텐츠 | "이 프로젝트의 규칙" | "이 도구의 실행 방법" | "이 API의 정확한 시그니처" |
| 업데이트 주기 | 프로젝트 변경 시 | 서버 업데이트 시 | API 버전 변경 시 |
| 범위 | 프로젝트 로컬 | 서버별 도메인 | 글로벌 레지스트리 |

---

## 4. 프론티어 비교: 5대 하네스는 이 문제를 어떻게 푸는가

에이전트 하네스들이 "에이전트에게 정확한 정보를 주는 문제"를 어떻게 접근하는지 비교합니다.

### 비교 매트릭스

| 기능 | Context Hub | Claude Code | Codex CLI | Aider | autoresearch |
|------|-------------|-------------|-----------|-------|-------------|
| **외부 문서 주입** | `chub get` (CLI) | CLAUDE.md + Skills | 없음 | 없음 | program.md |
| **컨텍스트 예산** | 없음 (전체 로드) | Compaction | 없음 | Chat Summary | stdout 리다이렉트 |
| **세션 간 학습** | `annotate` | 없음 | 없음 | 없음 | `git commit` (P5) |
| **MCP 통합** | `chub-mcp` | MCP 클라이언트 | 없음 | 없음 | 없음 |
| **문서 최신성** | 커뮤니티 관리 | 수동 | 없음 | 없음 | 없음 |

> Context Hub가 유일하게 **"세션 간 학습"과 "외부 문서 주입"을 모두 제공**하는 도구입니다. 반면 Karpathy의 autoresearch는 `git commit`을 학습 메커니즘으로 사용하고, Aider는 Chat Summary로 컨텍스트를 압축하는 등 각자의 방식으로 문제를 우회합니다.

### Karpathy 패턴과의 교차점

Context Hub의 annotation 시스템은 Karpathy의 **P4(래칫 메커니즘)** 과 **P6(Context Budget 관리)** 의 교차점에 있습니다.

```
P4 래칫:      modify → evaluate → if better: keep, else: revert
Context Hub:  use doc → discover gotcha → annotate → next session에서 자동 로드
```

두 접근 모두 "발견한 개선을 잃지 않는다"는 원칙을 공유하지만, autoresearch는 **코드 수준** (git commit)에서, Context Hub는 **지식 수준** (annotation)에서 래칫을 구현합니다.

---

## 5. REODE의 접근: 3-Tier ContextAssembler

REODE 프로젝트는 Context Hub를 직접 의존하지 않지만, **동일한 철학을 구조화된 아키텍처로 독립 구현**했습니다.

### 계층 구조

```
Tier 0:   Agent Identity (_soul — REODE.md)
  ↓
Tier 0.5: User Profile (FileBasedUserProfile)
  ↓
Tier 1:   Organization Memory (기조직 규칙/인사이트)
  ↓
Tier 2:   Project Memory (프로젝트 특정 규칙/지식)
  ↓
Tier 3:   Session Data (현재 세션 컨텍스트)
```

> Context Hub가 "외부 API 문서"에 집중한다면, REODE의 ContextAssembler는 "프로젝트/조직 지식"을 계층적으로 병합합니다. 같은 문제(에이전트에게 정확한 정보 제공)를 다른 스코프에서 해결하는 셈입니다.

### ContextAssembler의 핵심 코드

```python
# core/memory/context.py
class ContextAssembler:
    def assemble(
        self, session_id: str, project_name: str, model_id: str | None = None
    ) -> dict[str, Any]:
        context: dict[str, Any] = {}

        # Tier 0: Identity
        context["_soul"] = self._load_soul()

        # Tier 1: Organization
        context.update(self._org_memory.get_rules())

        # Tier 2: Project
        context["rules"] = self._project_memory.get_rules(project_name)
        context["insights"] = self._project_memory.get_insights(project_name)

        # Tier 3: Session
        context.update(self._session_store.get(session_id))

        # G9: Model-aware budget
        if model_id:
            profile = get_profile(model_id)
            budget = DEFAULT_BUDGETS[profile.tier]
            context["_context_budget"] = budget

        return context
```

> `model_id`를 받아 모델 능력에 따라 컨텍스트 예산을 조절하는 **G9 tier-aware budgeting**이 Context Hub에는 없는 REODE만의 차별점입니다. Claude Opus 4에는 풍부한 컨텍스트를, Haiku에는 핵심만 전달합니다.

### 파이프라인 주입 흐름

```python
# core/cli/__init__.py (4곳에서 동일 패턴)
memory_context = runtime.assemble_context()
if memory_context:
    initial_state["memory_context"] = memory_context
```

```python
# core/llm/prompt_assembler.py
memory_ctx = state.get("memory_context")
if memory_ctx and isinstance(memory_ctx, dict):
    memory_block = self._format_memory_block(memory_ctx)
    if len(memory_block) > self._max_memory_chars:
        memory_block = memory_block[:self._max_memory_chars]  # G9 truncation
    system = system + "\n\n" + memory_block
```

> PromptAssembler가 모든 파이프라인 노드(assess, plan, fix)에 자동으로 메모리 컨텍스트를 주입합니다. 개발자가 노드마다 수동으로 컨텍스트를 주입할 필요가 없습니다.

### Context Hub vs REODE 비교

| 항목 | Context Hub | REODE ContextAssembler |
|------|-------------|----------------------|
| **대상** | 외부 API 문서 | 프로젝트/조직 지식 |
| **구조** | Flat (registry → fetch) | 계층적 (Org → Project → Session) |
| **예산 관리** | 없음 (전체 로드) | G9 tier-aware budgeting |
| **Freshness** | 버전 태그 수동 관리 | CQRS 패턴 자동 staleness 감지 |
| **주입 방식** | CLI → 프롬프트에 수동 복사 | State → PromptAssembler 자동 |
| **학습 루프** | annotate (로컬 JSON) | 3-Tier Memory (TTL 기반) |
| **팀 공유** | 로컬만 | Org tier로 조직 수준 공유 |

---

## 6. 한계와 전망

### Context Hub의 한계

**1. 어노테이션 격리**: 가장 큰 약점입니다. `~/.chub/annotations/`에 로컬 저장만 가능하여 기기 간, 팀 간 공유가 불가합니다. Rust 리라이트(`nrl-ai/chub`)가 git-tracked annotations으로 부분 해결을 시도하고 있습니다.

**2. 에이전트 인식 문제**: 에이전트가 chub의 존재를 알려면 SKILL.md를 명시적으로 설치해야 합니다. "사용하라고 말해줘야 사용하는" 도구라는 본질적 한계입니다.

**3. 콘텐츠 품질 변동**: 커뮤니티 기여 모델이므로 문서 품질이 기여자에 따라 크게 다릅니다. 자동 검증은 frontmatter 유효성 수준에 그칩니다.

**4. 컨텍스트 예산 부재**: 대형 API 문서를 통째로 로드하면 에이전트의 컨텍스트 윈도우를 과도하게 점유합니다. REODE의 G9 같은 tier-aware budgeting이 필요합니다.

**5. 엔터프라이즈 기능 부재**: 프라이빗 레지스트리, 팀/조직 접근 제어가 없어 기업 환경에서의 도입에 제약이 있습니다.

### 전망

Andrew Ng이 "에이전트용 Stack Overflow"라는 비전을 제시한 것은 정확한 방향입니다. 에이전트가 고품질 문서를 소비하고, 발견한 지식을 축적하며, 커뮤니티가 문서를 검증하는 선순환 구조는 강력한 모멘텀을 가지고 있습니다.

그러나 **컨텍스트 예산 관리**, **팀 수준 어노테이션 공유**, **자동 품질 검증**이 해결되어야 프로덕션 수준의 도구가 될 수 있습니다. REODE의 ContextAssembler가 보여주듯, 계층적 병합과 모델-인지 예산 관리는 이미 실현 가능한 접근입니다.

---

## 7. 마무리

### 핵심 정리

| 항목 | 값/설명 |
|------|---------|
| Context Hub의 본질 | 에이전트용 API 문서 패키지 매니저 |
| 해결하는 문제 | API 환각 + 세션 기억상실 |
| 3-Layer 모델 | 행동(CLAUDE.md) + 도구(MCP) + 사실(Context Hub) |
| REODE 대응 | 3-Tier ContextAssembler + G9 budgeting |
| 최대 강점 | annotation으로 세션 간 학습 |
| 최대 약점 | 어노테이션 로컬 격리, 팀 공유 불가 |
| 현재 버전 | v0.1.3 (초기 단계) |

### 체크리스트

- [ ] Context Hub 설치 및 기본 워크플로우 테스트
- [ ] SKILL.md를 `.claude/skills/`에 설치하여 Claude Code 통합 확인
- [ ] 프로젝트에서 자주 사용하는 API의 문서 가용성 확인
- [ ] annotation 시스템으로 팀 내 지식 축적 전략 수립
- [ ] 3-Layer 모델 기반으로 자체 프로젝트의 컨텍스트 관리 전략 정리

---

*Source: `blog/posts/memory-context/context-hub-agent-context-management.md` | Category: [[blog-memory-context]]*

## Related

- [[blog-memory-context]]
- [[blog-hub]]
- [[geode]]
- [[geode-memory-system]]
