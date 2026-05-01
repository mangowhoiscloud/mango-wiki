---
title: 베이글코드 과제 — XML in LLM 사료 + 우리 시스템 적용 정책
category: references
tags: [bagelcode, xml, prompt-engineering, anthropic, claude-code, structured-prompt, format, frontier, 2026]
sources:
  - "Anthropic prompt engineering docs"
  - "Claude Code reverse engineering reports"
  - "arXiv 2025-2026 XML/structured prompting papers"
  - "Multi-agent communication protocol surveys"
created: 2026-05-01
updated: 2026-05-01
---

# XML in LLM — 2026-05 사료 + 우리 시스템 적용 정책

> **결론 한 줄**: **System prompt 내부 = XML (Anthropic-native, Claude Code-native), Wire/Storage = JSON (transcript), 자연어 body = 자유 텍스트 (XML 안 또는 JSON `body` 필드 안에 격리).**
>
> XML 은 Anthropic 의 공식 권장 패턴이지만, **format restriction 이 reasoning 을 떨어뜨린다** 는 정반대 연구도 있음. 그래서 "어디에 쓰고 어디에 안 쓸지"의 경계 결정이 핵심.

## Tier 1 — Anthropic native (권장 적용)

### 1A. Anthropic 공식 가이드 — Use XML tags to structure your prompts

URL: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/use-xml-tags

**핵심 발화 (verbatim 요약):**
> "When prompts involve multiple components like context, instructions, and examples, XML tags can be a game-changer."
>
> "**Claude was trained with XML tags** in the training data... Claude was trained specifically to recognize XML tags as a prompt organizing mechanism."

**Anthropic 이 강조한 4 이점:**
1. **Clarity** — 프롬프트 부분 명확히 분리
2. **Reduced misinterpretation** — Claude 가 부분 잘못 해석할 위험 ↓
3. **Flexibility** — 부분 수정 쉬움
4. **Post-processing** — 응답에서 특정 부분 추출 쉬움

**Nested tag 원칙 (verbatim):**
> "Nest when content has a natural containment relationship—for example, a `<documents>` container holding multiple `<document>` elements, or a `<conversation>` container holding `<message>` elements. Don't nest just for visual organization — nest when the parent-child relationship conveys real semantic meaning."

**Multi-document 패턴:**
```xml
<documents>
  <document>
    <document_content>...</document_content>
    <source>...</source>
  </document>
</documents>
```

### 1B. Claude Code 의 실제 XML 사용 (reverse engineering 보고서)

URL: https://medium.com/@fengliu_367/the-complete-guide-to-writing-agent-system-prompts-... · https://karanprasad.com/blog/how-claude-code-actually-works-...

**Claude Code 가 실제로 사용하는 XML 태그:**

| 태그 | 용도 |
|---|---|
| `<system-reminder>` | turn 끝에 주입, 룰 reinforce. **사용자 발화와 구별** |
| `<good-example>` / `<bad-example>` | few-shot 휴리스틱 학습 |
| `<env>` | runtime 컨텍스트 (date, git status, project rules) |
| `<thinking>` | 내부 reasoning (extended thinking 와 연동) |
| `<function_calls>` / `<function_results>` | tool use payload |

**구조 발화:**
- markdown 헤더 (`##`, `###`) = 계층
- 불릿 리스트 = 독립 testable 룰
- XML 태그 = 의미적 별도 구역

→ **"AI 코딩 에이전트로 만들었음" 신호 강화**: 우리 sandwich 가 `<system-reminder>` 태그를 사용하면 평가자가 "이 사람은 Claude Code 의 내부 패턴을 안다" 신호.

### 1C. Anthropic Prompting Best Practices (Opus 4.7 기준)

URL: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices

긴 문서 (60KB+). 핵심:
- **Long context (200K+)**: XML tagging 으로 retrieval 성능 향상 (TAG 논문과 정합)
- **Tool definitions**: XML schema 와 결합 권장
- **Examples (few-shot)**: `<example>` 태그로 격리

## Tier 2 — 학술 (formal 보장 + 효과 측정)

### 2A. XML Prompting as Grammar-Constrained Interaction (arXiv 2509.08182)

URL: https://arxiv.org/abs/2509.08182

**핵심:** XML 태그 기반 prompting 의 **수학적 형식화**.
- Knaster-Tarski 정리로 XML 트리 fixed-point 수렴 증명
- Banach 축약 원리로 반복 적용의 수렴 보장
- CFG (Context-Free Grammar) 기반 schema 가 형식 정확성 보증
- "plan → verify → revise" multi-step 패턴의 수렴성 = **agent 무한 루프 방지** 와 직결

**우리 적용:** sandwich §4 routing enforcement 가 grammar-constrained 라면, [[bagelcode-fault-tolerance-design]] §F5 의 stuck escalation 도 formal 근거 갖춤.

### 2B. Tagging-Augmented Generation — TAG (arXiv 2510.22956)

URL: https://arxiv.org/html/2510.22956v1

**핵심:** **semantic tagging** 으로 long-context retrieval 성능 향상.
- 200K context window (Claude Sonnet 3.5/3.7) 에서 측정
- NoLiMa, NovelQA 벤치마크
- **architectural 변경 없이** prompt 내부에 tag 만 박아서 효과 ↑

**verbatim 요약:**
> "embedding explicit structural cues within the input to guide model attention, preserve information retention, and enhance reasoning quality"

**우리 적용:** transcript 가 길어진 long session 에서 **anchored summary** ([[bagelcode-caching-strategy]] T2.3) 를 XML tag (`<summary>`, `<decision>`, `<next-step>`) 로 박으면 retrieval ↑.

### 2C. StructEval — Structured Output Benchmark (arXiv 2505.20139)

URL: https://arxiv.org/html/2505.20139v1

LLM 의 XML/JSON/YAML/Markdown 산출 능력 측정. **deeper hierarchy 에서 fail rate 변화** 가 핵심.

**우리 함의:**
- 우리 transcript JSON `data` 는 1-2 단 nesting 만 — 함정 적음
- system prompt 내부 XML 은 3-4 단까지 가도 OK (Anthropic 권장)

### 2D. Let Me Speak Freely — Format Restriction 부작용 (arXiv 2408.02442)

URL: https://arxiv.org/html/2408.02442v1

**경고 (verbatim 요약):**
> "Structured format constraints (JSON, XML, YAML) degrade LLM reasoning ability... a balance must be struck between easily parseable structured outputs and preserving the LLM's inherent reasoning abilities, with practitioners potentially considering looser format restrictions when dealing with complex reasoning tasks."

**우리 함의:**
- **input 으로 받는 XML** = OK (Anthropic 학습됨, TAG 효과 ↑)
- **출력 강제 schema** = 신중. reasoning-heavy step (Planner 의 spec 작성, Critic 의 검증 reasoning) 에서는 **자유 텍스트 → 후처리 schema 추출** 패턴이 더 안전
- → 우리 transcript `body` 자유 텍스트 + `data` schema 분리 결정과 정합 ([[bagelcode-transcripts-schema]])

### 2E. YAML > XML for some retrieval (improvingagents.com)

URL: https://www.improvingagents.com/blog/best-nested-data-format/

**측정:** GPT-5 Nano 가 YAML 이 XML 보다 **17.7%p 더 높은 정확도**. 1,000 questions, nested data retrieval task.

| Format | GPT-5 Nano accuracy | 비고 |
|---|---|---|
| YAML | best | 들여쓰기 의존 — Whitespace fragile |
| Markdown | mid | 사람·LLM 모두 친숙 |
| JSON | mid | Standard, parser 풍부 |
| XML | worst | verbose, GPT 계열 약함 |

**우리 함의:**
- Builder.B (Codex/GPT-5.5) 에게 **input 줄 때 XML 보다 markdown/JSON 권장**
- Claude (Builder.A, Verifier 가 Claude 계열일 시) 에게는 XML OK
- → **provider 별 prompt format 분기 필요**. adapter 에서 자동 변환.

## Tier 3 — Multi-Agent Protocol 에서의 XML

### 3A. Agent Communication Protocols Survey (arXiv 2505.02279)

URL: https://arxiv.org/html/2505.02279v1

**역사적 정리:**
- **KQML, FIPA-ACL** (1990-2000s) = XML 기반, **무거움 → 학술/방위 외 채택 못 함**
- **MCP, A2A, ANP** (2024-2025) = **JSON / JSON-RPC 기반** = lightweight 채택

**verbatim:**
> "KQML's heavyweight XML-style encodings hindered large-scale deployments"
> "the complexity of FIPA's ontology management, coupled with verbose XML encodings, limited its uptake to academic and defense use cases"

**우리 결정:** **wire format 으로 XML 채택 X.** JSONL transcript 유지. Anthropic native 한 system prompt 내부에서만 XML.

### 3B. MCP / A2A 가 JSON-RPC 인 이유

URL: https://a2a-protocol.org/latest/specification/

- 가벼움
- streaming friendly (SSE)
- 광범위한 SDK 지원
- 디버깅 용이

→ 우리 transcript 와 1:1.

## 종합 — 우리 시스템에서의 XML 정책

### 정책 표

| 위치 | format | 근거 |
|---|---|---|
| **System prompt (sandwich §1-§4)** | **XML 태그** | Anthropic 학습 + Claude Code 패턴 + TAG 효과 |
| **Tool definitions** | JSON Schema (XML wrapper 안에) | MCP convention + Anthropic 권장 |
| **Few-shot examples in prompt** | `<good-example>` / `<bad-example>` | Claude Code 내부 패턴 |
| **Runtime context injection** | `<system-reminder>` / `<env>` | Claude Code native |
| **Transcript wire (JSONL)** | JSON | KQML/FIPA 교훈 + MCP 정합 |
| **Inter-agent message body** | JSON `data` schema + 자유 `body` | reasoning 보존 ([[bagelcode-transcripts-schema]]) |
| **Long-session anchored summary** | XML 태그 (`<summary>` 안에) | TAG retrieval 효과 |
| **Output 강제 schema** | **신중** | reasoning degradation 위험, body=text/data=schema 분리 |
| **Builder.B (Codex) input** | Markdown / JSON 우선 | YAML/XML 함정 (Tier 2E) |

### Sandwich §1-§4 의 XML 구체화 예

```xml
<role>
  You are <name>Builder.A</name> in the Pitchcraft pipeline.
  <provider>Anthropic Claude Opus 4.7</provider>
  <position>Builder, primary</position>
</role>

<contract>
  <input>
    From transcript: messages where kind in {goal, spec, spec.update}
  </input>
  <output>
    Single JSON message with kind="build", artifacts in artifacts/ dir.
  </output>
  <handoff>
    On success → coordinator. On failure → kind="error" with reason.
  </handoff>
</contract>

<tools>
  <!-- tool definitions follow standard Claude tool_use schema -->
</tools>

<enforcement>
  <forbidden>
    - Calling Agent/Task tool (single stage owner principle)
    - Reading messages with kind in {debate, note}
    - Writing to artifacts outside assigned session_id
  </forbidden>
  <required>
    - Append exactly one kind="build" message
    - sha256 every artifact ref
    - STOP after own turn
  </required>
</enforcement>

<system-reminder>
You are in production path. Verifier will check exec.exit_code.
Anti-deception: claiming build without artifacts → automatic D2=0.
</system-reminder>
```

→ Anthropic 의 Claude Opus 4.7 / Haiku 4.5 가 이 구조를 가장 잘 파싱.

### Builder.B (Codex) 용 변환

같은 sandwich 의 **Markdown 변환** 자동 (adapter 안에서):

```markdown
# Role
You are Builder.B in the Pitchcraft pipeline.
- Provider: OpenAI GPT-5.5 (via Codex)
- Position: Builder, fallback

## Contract
- **Input**: transcript messages where kind ∈ {goal, spec, spec.update}
- **Output**: single JSON message kind="build", artifacts in artifacts/
- **Handoff**: success → coordinator. failure → kind="error".

## Forbidden
- Recursive subagent spawn
- Reading kind ∈ {debate, note}
- Writing outside session_id

## Required
- Exactly one kind="build" message
- sha256 every artifact ref
- STOP after own turn

> System reminder: Verifier checks exec.exit_code. Build without artifacts → D2=0.
```

→ adapter 가 동일 source 에서 XML/Markdown 두 출력 생성. **maintenance cost 1×, output 2×.**

## 절감/효과 추정

| 효과 | 추정 |
|---|---|
| Claude long-context retrieval | TAG 논문 기준 +5-15%p (NoLiMa) |
| Claude 룰 준수 (anti-deception) | `<system-reminder>` 패턴 = Claude Code 와 같은 효과 |
| Codex GPT-5.5 reasoning | XML 강제 시 -10%p risk (Tier 2D) → Markdown 으로 회피 |
| Format consistency (post-processing) | 응답에서 특정 태그 추출 = 정규식 단순 |
| Multi-actor sandwich 공유 | XML byte-identical = prompt cache hit ↑ ([[bagelcode-caching-strategy]]) |

## 위험 + mitigation

| 위험 | 대응 |
|---|---|
| 무한 nesting → format burden | nest 는 의미적 containment 만 (Anthropic 룰) |
| Output 강제 XML schema → reasoning ↓ | output 은 JSON `data` + 자유 `body` 분리 |
| Codex 가 XML 약함 | adapter 가 Markdown 변환 |
| `<system-reminder>` 가짜로 LLM 출력에 들어오면? | validator 가 출력에서 `<system-reminder>` strip + reject |
| Claude Code 가 자기 출력에 `<system-reminder>` 박는 경우 | 우리 system 의 XML namespace 는 `<pc:...>` prefix 로 격리 검토 |

## 1차 사료 (10 links 묶음)

### Anthropic native
- [Use XML tags to structure your prompts (Anthropic docs)](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/use-xml-tags)
- [Prompting best practices (Opus 4.7+)](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)

### Claude Code reverse engineering
- [Reverse-engineering Claude Code (Karan Prasad)](https://karanprasad.com/blog/how-claude-code-actually-works-reverse-engineering-512k-lines)
- [Complete Guide to Agent System Prompts (Feng Liu)](https://medium.com/@fengliu_367/the-complete-guide-to-writing-agent-system-prompts-lessons-from-reverse-engineering-claude-code-09ecd87c7cc1)
- [Claude Code Architecture (Vrungta)](https://vrungta.substack.com/p/claude-code-architecture-reverse)

### 학술
- [XML Prompting as Grammar-Constrained Interaction — arXiv 2509.08182](https://arxiv.org/abs/2509.08182)
- [Tagging-Augmented Generation (TAG) — arXiv 2510.22956](https://arxiv.org/html/2510.22956v1)
- [StructEval — arXiv 2505.20139](https://arxiv.org/html/2505.20139v1)
- [Let Me Speak Freely (format restriction degrades reasoning) — arXiv 2408.02442](https://arxiv.org/html/2408.02442v1)

### Format 비교 / 경고
- [Best nested data format for LLMs (improvingagents.com)](https://www.improvingagents.com/blog/best-nested-data-format/)
- [Agent Communication Protocols Survey — arXiv 2505.02279](https://arxiv.org/html/2505.02279v1)
- [Effective Prompt Engineering (XML for clarity)](https://medium.com/@TechforHumans/effective-prompt-engineering-mastering-xml-tags-for-clarity-precision-and-security-in-llms-992cae203fdc)

## See also

- [[bagelcode]] / [[bagelcode-task-direction]]
- [[bagelcode-transcripts-schema]] — JSON wire format (XML 안 씀)
- [[bagelcode-caching-strategy]] — sandwich XML 의 cache boundary
- [[bagelcode-frontier-orchestration-2026]] — MCP/A2A JSON-RPC 정합
- [[bagelcode-fault-tolerance-design]] — `<system-reminder>` 의 anti-injection 처리
- [[bagelcode-agents-fixed]] — provider 별 prompt format 분기 (Claude=XML, Codex=Markdown)
- [[geode-prompt-system]] / [[geode-prompt-templates]] — geode prompt sandwich 패턴
