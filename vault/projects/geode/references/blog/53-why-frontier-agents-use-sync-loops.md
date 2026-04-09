---
title: "프론티어 에이전트는 왜 동기 루프를 선택하는가 — Claude Code, Codex, Devin, autoresearch의 설계 근거"
type: reference
category: blog-post
tags: [blog, architecture]
source: "blog/posts/architecture/53-why-frontier-agents-use-sync-loops.md"
created: 2026-04-08T00:00:00Z
---

# 프론티어 에이전트는 왜 동기 루프를 선택하는가 — Claude Code, Codex, Devin, autoresearch의 설계 근거

> "비동기가 더 빠르지 않나요?"
> 에이전트 시스템을 설계하면 자연스럽게 드는 질문입니다.
> 그런데 Claude Code, OpenAI Codex, Devin, Karpathy의 autoresearch —
> 프론티어 에이전트 전부가 **동기 루프**를 선택했습니다.
> 이 글은 왜 그런지, 실제 코드와 공식 문서에서 근거를 추적합니다.

> Date: 2026-03-23 | Author: geode-team | Tags: agentic-loop, sync-vs-async, claude-code, codex, devin, autoresearch, architecture, design-decision

---

## 목차

1. 도입: 비동기가 당연해 보이는 이유
2. 프론티어 6종의 실제 구현
3. 5가지 엔지니어링 근거
4. 핵심 구분: I/O async ≠ 아키텍처 async
5. 비동기가 등장하는 지점
6. Karpathy와 Anthropic의 직접 발언
7. GEODE에서의 적용
8. 마무리

---

## 1. 도입: 비동기가 당연해 보이는 이유

웹 서버를 만들면 `asyncio`를 씁니다. 데이터 파이프라인을 만들면 Celery나 RabbitMQ로 비동기 처리합니다. "느린 작업은 비동기로" — 백엔드 엔지니어의 기본 원칙입니다.

LLM API 호출은 느립니다. 한 번에 2-30초가 걸립니다. 에이전트가 도구를 10번 호출하면 총 대기 시간이 분 단위입니다. 비동기로 병렬화하면 빨라질 것 같습니다.

그런데 프론티어 에이전트 시스템을 들여다보면, **전부 동기 루프**입니다. 실수가 아닙니다. 의도적인 설계 결정입니다.

---

## 2. 프론티어 6종의 실제 구현

### Claude Code — while(true) 루프

Claude Code의 핵심은 `agent-loop.ts`에 있습니다:

```typescript
// claude-code/src/core/agent-loop.ts
export async function runAgentLoop(state: AgentLoopState): Promise<void> {
  while (true) {
    const response = await streamApiCall(request, ...);
    const { contentBlocks, stopReason } = await processStream(response);

    if (stopReason === "end_turn") break;
    if (stopReason === "tool_use") {
      const toolResults = await executeTools(toolUseBlocks, state);
      state.messages.push({ role: "user", content: toolResults });
      continue;
    }
  }
}
```

> Boris Cherny(Claude Code 창시자)는 Pragmatic Engineer 인터뷰에서 "transparency and directness over abstraction layers"를 설계 원칙으로 밝혔습니다. 벡터 DB와 재귀 인덱싱보다 **plain glob과 grep이 더 잘 작동했다** — 같은 단순성 원칙이 루프 구조에도 적용됩니다.

PromptLayer의 분석은 이를 **"single-threaded synchronous master loop"**로 정의합니다. 핵심 이유:

| 속성 | 설명 |
|------|------|
| 디버깅 가능성 | 투명한 감사 추적 |
| 신뢰성 | 단순화된 제어 흐름 = 실패 모드 감소 |
| 예측 가능성 | 단일 스레드 = 경쟁 조건 없음 |

### OpenAI Codex CLI — ReAct 동기 루프

OpenAI의 공식 블로그 "Unrolling the Codex Agent Loop"에서:

> "There's just one agent reasoning at a time, sequentially accumulating conversation history as a flat list of messages."

전체 대화 히스토리를 매 API 호출에 포함하기 때문에, Step N의 결과 없이 Step N+1을 호출할 수 없습니다. Codex는 이 순차적 비용을 **prompt caching**(정확한 prefix 매칭)으로 해결합니다. 병렬화가 아닙니다.

### Devin — 순차적, 단일 스텝 내 병렬

Cognition의 블로그에서:

> "Rather than working strictly sequentially, the model will overlap work where it can."

Sonnet 4.5가 도입한 것은 **단일 스텝 내 병렬** — bash 명령 여러 개를 동시에 실행하거나 파일 여러 개를 동시에 읽는 것입니다. 하지만 추론 루프 자체는 순차적입니다.

### Karpathy autoresearch — 단일 GPU, 단일 실험

```
modify train.py → commit → train 5min → check val_bpb → keep or git reset → repeat
```

700회 실험, 2일. 1 GPU, 1 에이전트, 한 번에 1 실험. 의도적으로 **단일 스레드 hill-climbing**입니다.

### LangGraph — invoke()는 블로킹

```python
result = graph.invoke(input_state)  # 블로킹
```

`ainvoke()`가 있지만, 이는 I/O 레벨 비동기입니다. 그래프 순회 자체는 위상 정렬 순서로 순차 실행됩니다. StateGraph의 상태는 공유 가변 딕셔너리이기 때문입니다.

### Anthropic Multi-Agent Research System

Anthropic Engineering 블로그에서 직접 인용:

> "Our lead agents execute subagents **synchronously**, waiting for each set of subagents to complete before proceeding."

---

## 3. 5가지 엔지니어링 근거

### 근거 1: 인과적 의존 체인 (구조적 제약)

LLM 추론 루프의 핵심 속성입니다:

```
Step 1: LLM → "파일을 읽어야 합니다" → tool_use(read_file)
Step 2: tool_result("파일 내용: ...") → LLM → "버그를 발견했습니다" → tool_use(edit_file)
Step 3: tool_result("수정 완료") → LLM → "테스트를 실행합니다" → tool_use(run_tests)
```

Step 2는 Step 1의 파일 내용을 봐야 버그를 판단합니다. Step 3는 Step 2의 수정 결과를 봐야 테스트 실행 여부를 결정합니다. **각 스텝이 이전 스텝의 출력에 인과적으로 의존합니다.** 이것은 구현의 한계가 아니라 LLM 추론의 구조적 속성입니다.

> shareAI 분석: "Each loop iteration depends on the previous response. Tool results must be collected and appended to the message history before the next API call, creating an **inherent sequential requirement**."

### 근거 2: 공유 가변 상태 (정확성)

대화 히스토리 `messages[]`는 단일 누적 리스트입니다. 비동기 분기를 만들면 세 가지 선택지가 생깁니다:

| 전략 | 문제 |
|------|------|
| 잠금(lock) | 병렬의 의미가 사라짐 |
| 복사(copy) | 컨텍스트 분열 — 각 브랜치가 다른 정보를 보유 |
| 병합(merge) | 불일치 위험 — 어느 브랜치의 결과를 우선할 것인가 |

어떤 전략을 선택해도 동기 루프보다 복잡해지고, 정확성 보장이 어려워집니다.

### 근거 3: 디버깅 가능성 (운영)

동기 루프의 실행 트레이스는 **선형이고 결정적**입니다:

```
Turn 1: LLM → tool_use(search) → result
Turn 2: LLM → tool_use(read_file) → result
Turn 3: LLM → tool_use(edit_file) → result
Turn 4: LLM → "완료했습니다"
```

비동기 루프의 트레이스는 인터리빙됩니다:

```
Turn 1a: LLM-A → tool_use(search)
Turn 1b: LLM-B → tool_use(read_file)
Turn ??: search result arrives → LLM-A → ...
Turn ??: read_file result arrives → LLM-B → ...
```

비결정적 실행 순서는 버그 재현을 불가능하게 만듭니다. Karpathy가 autoresearch에서 **선형 Git history**를 선택한 이유와 동일합니다 — 감사 추적 자체가 가치입니다.

### 근거 4: 에러 전파 (신뢰성)

동기 루프에서 에러가 발생하면:

```
LLM → tool_use(bash: "mvn test")
     → tool_result: "FAILED: 3 tests"
     → LLM: "3개 테스트가 실패했습니다. 원인을 분석합니다..."
```

모델이 에러를 **즉시 관찰**하고 다음 행동을 결정합니다.

비동기에서 에러가 발생하면:
- 어느 브랜치가 실패했는가?
- 다른 브랜치를 취소해야 하는가?
- 리드 에이전트가 실패를 어떻게 알 수 있는가?

> Anthropic: "asynchronicity adds challenges in **result coordination, state consistency, and error propagation** across the subagents."

### 근거 5: 단순성이 기능이다 (철학)

Anthropic의 "Building Effective Agents" 블로그:

> "The most successful implementations use **simple, composable patterns** rather than complex frameworks."

Hacker News 토론에서의 공감대:

> "95% of the magic is in the LLM itself and how it's been fine-tuned to do tool calls."

루프는 가치가 만들어지는 곳이 아닙니다. 모델이 잘 추론하도록 도구 결과를 전달하는 것이 루프의 역할입니다. 이것을 복잡하게 만들면 위험만 추가됩니다.

---

## 4. 핵심 구분: I/O async ≠ 아키텍처 async

혼동하기 쉬운 지점입니다. Claude Code의 TypeScript 코드에는 `async/await`가 있습니다. GEODE의 Python 코드에도 `await`가 있습니다. 하지만 이것은 **I/O 레벨 비동기**입니다.

| 레이어 | 패턴 | 이유 |
|--------|------|------|
| 네트워크 I/O | `async/await` | HTTP 응답 대기 중 스레드 낭비 방지 |
| 단일 턴 도구 실행 | `Promise.all` / `asyncio.gather` | 독립적 도구 동시 실행 가능 |
| **추론 루프** | **순차적** | **각 스텝이 이전 스텝에 인과적 의존** |
| 태스크 레벨 | 격리 에이전트 (worktree, VM) | 독립 작업, 추론 공유하지 않음 |

`async/await`는 "API 응답을 기다리는 동안 스레드를 블로킹하지 않겠다"는 의미이지, "여러 추론 스텝을 동시에 실행하겠다"는 의미가 아닙니다.

---

## 5. 비동기가 등장하는 지점

프론티어 시스템이 비동기를 완전히 배제하는 것은 아닙니다. 특정 레이어에서는 병렬성이 존재합니다:

### 단일 턴 내 도구 병렬

Claude Code에서 모델이 한 번의 응답에서 여러 도구를 요청하면:

```typescript
const results = await Promise.all(
  toolUseBlocks.map(block => executeOneTool(block, state))
);
```

3개의 `read_file`을 동시에 실행합니다. 하지만 **다음 추론 스텝은 3개 결과가 모두 도착한 후**에 시작됩니다.

### 서브에이전트 (격리된 자식 루프)

Claude Code의 Agent tool은 자식 루프를 스폰합니다. GEODE의 SubAgentManager도 `IsolatedRunner(MAX_CONCURRENT=5)`로 병렬 실행합니다. 하지만 각 서브에이전트는 **독립된 컨텍스트**에서 실행됩니다. 부모의 추론 상태를 공유하지 않습니다.

### 백그라운드 에이전트

Cursor의 Background Agent, Claude Code의 worktree 에이전트는 별도 VM이나 Git 브랜치에서 실행됩니다. **태스크 레벨 병렬성**이지, 추론 레벨 병렬성이 아닙니다.

Boris Cherny는 터미널 탭 5개에서 Claude Code 5개를 5개 Git worktree에서 동시에 실행합니다. 병렬성은 **인간이 오케스트레이션**합니다.

---

## 6. Karpathy와 Anthropic의 직접 발언

두 명의 핵심 인물이 이 선택에 대해 직접 언급했습니다.

### Karpathy (autoresearch)

> "The next step for autoresearch is that it has to be **asynchronously massively collaborative** for agents. The goal is not to emulate a single PhD student, it's to emulate a **research community** of them. Current code synchronously grows a single thread of experiments."

동기가 **출발점**이고, 비동기는 **근본적으로 다른 아키텍처**가 필요한 미래 과제입니다. "단일 PhD 학생"에서 "연구 커뮤니티"로의 전환은 단순히 `asyncio`를 추가하는 것이 아닙니다.

### Anthropic (Multi-Agent Research System)

> "Asynchronous execution would enable additional parallelism: agents working concurrently and creating new subagents when needed. [But] asynchronicity adds challenges in **result coordination, state consistency, and error propagation** across the subagents."

비동기의 이점을 알고 있지만, **현재 모델 능력으로는 복잡성 대비 이득이 부족**하다는 판단입니다. 모델이 충분히 발전하면 그때 전환하겠다는 의미입니다.

---

## 7. GEODE에서의 적용

GEODE의 `AgenticLoop`도 동일한 패턴을 따릅니다:

```python
# core/cli/agentic_loop.py
class AgenticLoop:
    async def run(self, user_input: str) -> AgenticResponse:
        self._messages.append({"role": "user", "content": user_input})

        while True:
            response = await self._adapter.agentic_call(
                model=self.model,
                messages=self._messages,
                tools=self._tools,
            )

            if response.stop_reason == "end_turn":
                return response

            if response.stop_reason == "tool_use":
                results = await self._execute_tools(response.tool_calls)
                self._messages.append({"role": "user", "content": results})
                continue
```

> `async/await`는 I/O 레벨입니다. 루프 자체는 순차적입니다. 이전 턴의 tool_result를 보지 않으면 다음 턴의 tool_use를 결정할 수 없습니다.

병렬성은 특정 레이어에서만 적용합니다:

| 레이어 | 구현 | 병렬 여부 |
|--------|------|---------|
| AgenticLoop 추론 | `while(tool_use)` | 순차 |
| SubAgentManager | `IsolatedRunner(MAX_CONCURRENT=5)` | 병렬 (격리) |
| MCP 연결 | `ThreadPoolExecutor` (110s→15s) | 병렬 (I/O) |
| Send API (Analysts) | `graph.send()` × 4 | 병렬 (독립 컨텍스트) |
| Gateway Pollers | 데몬 스레드 × 3 | 병렬 (격리) |

핵심 추론 루프는 동기, 독립적인 작업 단위는 병렬. 이것이 프론티어의 합의입니다.

---

## 8. 마무리

### 핵심 정리

| 항목 | 결론 |
|------|------|
| 루프 구조 | 모든 프론티어가 동기 선택 |
| 근본 이유 | Step N+1은 Step N의 결과에 인과적 의존 |
| async/await | I/O 비동기이지, 추론 비동기가 아님 |
| 병렬이 존재하는 곳 | 단일 턴 도구, 서브에이전트(격리), 태스크 레벨 |
| 미래 방향 | Karpathy: "연구 커뮤니티" 수준의 비동기는 근본적으로 다른 아키텍처 |
| 설계 원칙 | "단순하고 조합 가능한 패턴" (Anthropic) |

### 프론티어 비교 테이블

| 시스템 | 추론 루프 | 도구 병렬 | 서브에이전트 | 출처 |
|--------|---------|---------|-----------|------|
| Claude Code | `while(true)` 동기 | Promise.all (턴 내) | 격리 자식 루프 | 소스코드 + Anthropic 문서 |
| Codex CLI | ReAct 동기 | 턴 내 | MCP 서버 모델 | OpenAI 블로그 |
| Devin | 순차 plan-execute | bash/file 병렬 | multi-agent dispatch | Cognition 블로그 |
| autoresearch | 단일 스레드 hill-climb | 없음 | 없음 (미래 계획) | GitHub + Fortune |
| Anthropic Multi-Agent | 동기 subagent 실행 | 없음 | 동기 dispatch | Anthropic Engineering |
| LangGraph | graph.invoke() 블로킹 | 노드 내 | Subgraph | LangGraph 문서 |

### 체크리스트: 에이전트 루프 설계 시

- [ ] 추론 루프는 동기로 유지하고 있는가
- [ ] `async/await`가 I/O 레벨에만 적용되어 있는가
- [ ] 병렬성은 독립적인 작업 단위(서브에이전트, 도구)에만 적용되어 있는가
- [ ] 공유 가변 상태(`messages[]`)에 대한 동시 접근이 없는가
- [ ] 실행 트레이스가 선형이고 재현 가능한가
- [ ] 에러 발생 시 모델이 즉시 관찰하고 반응할 수 있는가

---

**참고 자료:**
- [Anthropic Agent Loop Documentation](https://platform.claude.com/docs/en/agent-sdk/agent-loop)
- [Building Claude Code with Boris Cherny (Pragmatic Engineer)](https://newsletter.pragmaticengineer.com/p/building-claude-code-with-boris-cherny)
- [Claude Code: Behind-the-scenes of the master agent loop (PromptLayer)](https://blog.promptlayer.com/claude-code-behind-the-scenes-of-the-master-agent-loop/)
- [Unrolling the Codex Agent Loop (OpenAI)](https://openai.com/index/unrolling-the-codex-agent-loop/)
- [Rebuilding Devin for Claude Sonnet 4.5 (Cognition)](https://cognition.ai/blog/devin-sonnet-4-5-lessons-and-challenges)
- [Karpathy autoresearch (GitHub)](https://github.com/karpathy/autoresearch)
- [The Karpathy Loop: 700 experiments, 2 days (Fortune)](https://fortune.com/2026/03/17/andrej-karpathy-loop-autonomous-ai-agents-future/)
- [Anthropic Multi-Agent Research System](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Building Effective Agents (Anthropic)](https://blog.naitive.cloud/building-effective-agents/)

---

*Source: `blog/posts/architecture/53-why-frontier-agents-use-sync-loops.md` | Category: [[blog-architecture]]*

## Related

- [[blog-architecture]]
- [[blog-hub]]
- [[geode]]
- [[geode-architecture]]
