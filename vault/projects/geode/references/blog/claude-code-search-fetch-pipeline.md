---
title: "Claude Code 검색/Fetch 파이프라인 — Context Overflow 방지 아키텍처"
type: reference
category: blog-post
tags: [blog, research]
source: "blog/research/claude-code-search-fetch-pipeline.md"
created: 2026-04-08T00:00:00Z
---

# Claude Code 검색/Fetch 파이프라인 — Context Overflow 방지 아키텍처

> Date: 2026-04-06 | Source: claude-code codebase (npm @anthropic-ai/claude-code)
> Purpose: GEODE에서 동일 패턴 적용을 위한 Ground Truth 정리

---

## 1. 핵심 설계 원칙

Claude Code는 **5-Layer 방어**로 tool result가 context window를 넘치지 않게 한다:

```
L1: Per-Tool Cap (20K~100K chars)
L2: HTML→MD Conversion (Turndown)
L3: Secondary Model Summarization (Haiku)
L4: Per-Result Persistence (>50K → disk + 2KB preview)
L5: Per-Message Aggregate Budget (200K chars)
```

| Layer | 위치 | 한도 | 초과 시 |
|-------|------|------|---------|
| L1 | Tool class `maxResultSizeChars` | 20K (Grep), 100K (WebFetch) | 잘림 |
| L2 | `utils.ts:454` Turndown | HTML → MD 변환 | 구조 보존 압축 |
| L3 | `utils.ts:503` queryHaiku | Haiku가 요약 | 토큰 대폭 감소 |
| L4 | `toolResultStorage.ts` | 50K chars | 디스크 저장 + `<persisted-output>` |
| L5 | `toolLimits.ts:49` | 200K chars/message | 집계 초과 시 잘림 |

---

## 2. WebFetchTool — HTML→MD→Summary 파이프라인

### 2.1 Turndown (HTML → Markdown)

```
tools/WebFetchTool/utils.ts:85-97
```

- **Turndown** 라이브러리 사용 (lazy singleton)
- `@mixmark-io/domino`로 DOM 파싱 (~1.4MB heap)
- HTML → Markdown 변환 후 원본 HTML 해제 (GC 허용)

```typescript
// utils.ts:454
if (contentType.includes('text/html')) {
  markdownContent = (await getTurndownService()).turndown(htmlContent)
}
```

### 2.2 Truncation (100K chars)

```typescript
// utils.ts:128
const MAX_MARKDOWN_LENGTH = 100_000

// utils.ts:492-496
const truncatedContent =
  markdownContent.length > MAX_MARKDOWN_LENGTH
    ? markdownContent.slice(0, MAX_MARKDOWN_LENGTH) +
      '\n\n[Content truncated due to length...]'
    : markdownContent
```

### 2.3 Haiku Summarization

```
tools/WebFetchTool/utils.ts:503
```

Truncated markdown → Haiku (small fast model)가 prompt에 맞게 요약.
Preapproved 도메인 + 짧은 MD는 Haiku skip.

```typescript
// WebFetchTool.ts:263-278
if (isPreapproved && contentType.includes('text/markdown') && content.length < MAX_MARKDOWN_LENGTH) {
  result = content  // Skip Haiku for preapproved short markdown
} else {
  result = await applyPromptToMarkdown(prompt, content, signal)
}
```

### 2.4 Copyright Protection

```
tools/WebFetchTool/prompt.ts:23-46
```

비신뢰 도메인: 125자 인용 한도, 의역 필수.
Preapproved 도메인 (60+): 코드 예시 + 상세 발췌 허용.

---

## 3. GrepTool — ripgrep 통합

```
tools/GrepTool/GrepTool.ts:160
```

| 설정 | 값 | 목적 |
|------|-----|------|
| `maxResultSizeChars` | 20,000 | 결과 크기 상한 |
| `DEFAULT_HEAD_LIMIT` | 250 lines | 기본 출력 줄 수 |
| `--max-columns` | 500 | minified/base64 줄 차단 |
| ripgrep buffer | 20MB | stdout 버퍼 |
| timeout | 20s (WSL: 60s) | 프로세스 타임아웃 |

```typescript
// GrepTool.ts:108
const DEFAULT_HEAD_LIMIT = 250
```

핵심: `head_limit` 파라미터로 LLM이 필요한 만큼만 요청. 기본 250줄, `head_limit=0`으로 무제한.

---

## 4. Tool Result 저장 + Preview

```
utils/toolResultStorage.ts
constants/toolLimits.ts
```

### 4.1 Persistence Threshold

```typescript
// toolLimits.ts
DEFAULT_MAX_RESULT_SIZE_CHARS = 50,000
MAX_TOOL_RESULT_BYTES = 400,000  // 100K * 4 bytes/token
MAX_TOOL_RESULTS_PER_MESSAGE_CHARS = 200,000
```

### 4.2 대형 결과 → 디스크 + Preview

```typescript
// toolResultStorage.ts:189
function buildLargeToolResultMessage(filepath, size, preview) {
  return `<persisted-output>
Output too large (${tokenEst} tokens). Full output saved to: ${filepath}

Preview (first 2KB):
${preview}
</persisted-output>`
}
```

50K chars 초과 → 전체 내용 파일 저장 → LLM에는 2KB preview + 파일 경로만 전달.
LLM이 전체 내용이 필요하면 `Read` tool로 파일을 읽음.

### 4.3 Per-Message Aggregate Budget

```typescript
// toolLimits.ts:49
MAX_TOOL_RESULTS_PER_MESSAGE_CHARS = 200,000
```

한 번의 API 호출에 포함되는 모든 tool_result의 합계가 200K를 넘으면 가장 큰 결과부터 persistence로 교체.

---

## 5. Token Estimation

```
services/tokenEstimation.ts
```

| 타입 | bytes/token | 용도 |
|------|-------------|------|
| 일반 텍스트 | 4 | 기본값 |
| JSON/JSONL | 2 | 토큰 밀도 높음 |
| Haiku 정밀 | API call | 정확한 토큰 수 필요 시 |

```typescript
// tokenEstimation.ts:203
function roughTokenCountEstimation(text: string): number {
  return Math.ceil(Buffer.byteLength(text) / 4)
}
```

---

## 6. Message Compaction Pipeline

```
query.ts:365-395
```

```
1. applyToolResultBudget()  — per-message 200K 예산 적용
2. snipModule               — history 스니핑 (오래된 메시지 제거)
3. microcompact             — 캐시된 대형 tool result 압축
4. contextCollapse          — 오래된 컨텍스트 요약
5. autocompact              — 최종 context window 관리
```

---

## 7. GEODE에 적용할 패턴 (GAP 분석)

| Claude Code 패턴 | GEODE 현재 | GAP |
|-------------------|------------|-----|
| Per-tool `maxResultSizeChars` | `max_tool_result_tokens` (설정만, MCP 미적용) | MCP tool result에 강제 적용 필요 |
| HTML→MD (Turndown) | 없음 (raw HTML 그대로) | `html2text` 또는 `markdownify` 도입 |
| Haiku summarization | `summarize_tool_results` (context overflow 시에만) | 사전 요약 (tool result 크기 기준) 추가 |
| Disk persistence + preview | `tool_offload` (threshold 5000 tokens) | 이미 있음, threshold 조정 필요 |
| Per-message aggregate budget | 없음 | 단일 API 호출의 tool_result 합계 제한 추가 |
| `--max-columns 500` (ripgrep) | MCP ripgrep에 미적용 | MCP tool args에 max-columns 전달 |
| GLM "Prompt exceeds max length" 감지 | **수정 완료** (errors.py + fallback.py) | `"prompt exceeds"`, `"max length"` 패턴 추가 |

### 우선순위

1. **P0**: GLM context overflow 감지 — 이번 세션에서 수정 완료
2. **P1**: MCP tool result 크기 제한 — browser_snapshot이 90K+ 토큰 반환하는 것이 직접 원인
3. **P1**: HTML→MD 변환 — web_fetch/browser 결과의 토큰 효율 개선
4. **P2**: Per-message aggregate budget — 복수 tool result의 합계 제한
5. **P2**: Haiku 사전 요약 — 대형 결과에 대해 secondary model 요약

---

## 8. Source Files Reference

| Component | Path | Key Lines |
|-----------|------|-----------|
| WebFetch Turndown | `tools/WebFetchTool/utils.ts` | 85-97, 454-466 |
| WebFetch Truncation | `tools/WebFetchTool/utils.ts` | 128, 492-496 |
| WebFetch Haiku | `tools/WebFetchTool/utils.ts` | 503 |
| WebFetch Cache | `tools/WebFetchTool/utils.ts` | 61-69 |
| WebFetch Preapproved | `tools/WebFetchTool/preapproved.ts` | 14-131 |
| Copyright Prompt | `tools/WebFetchTool/prompt.ts` | 23-46 |
| GrepTool | `tools/GrepTool/GrepTool.ts` | 108, 160 |
| GlobTool | `tools/GlobTool/GlobTool.ts` | 57-177 |
| Tool Limits | `constants/toolLimits.ts` | 13, 33, 49 |
| Tool Result Storage | `utils/toolResultStorage.ts` | 109, 189 |
| Token Estimation | `services/tokenEstimation.ts` | 203, 217, 251 |
| Compaction Pipeline | `query.ts` | 365-395 |
| ripgrep | `utils/ripgrep.ts` | 80, 295, 338 |

---

*Source: `blog/research/claude-code-search-fetch-pipeline.md` | Category: [[blog-research]]*

## Related

- [[blog-research]]
- [[blog-hub]]
- [[geode]]
- [[geode-memory-system]]
