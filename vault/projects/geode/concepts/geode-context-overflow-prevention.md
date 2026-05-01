---
title: Context Overflow Prevention — 5-Layer Defense
tags: [geode, context, overflow, claude-code, frontier]
sources: [raw/geode-blog/research/claude-code-search-fetch-pipeline.md]
created: 2026-04-15
updated: 2026-04-15
provenance: { extracted: 0.85, inferred: 0.15 }
---

# Context Overflow Prevention — 5-Layer Defense

Claude Code의 tool result context overflow 방어 아키텍처에서 추출한 패턴과 GEODE 적용 분석.

## Core Insight

> 컨텍스트를 관리하는 최선의 방법은 애초에 넣지 않는 것이다.

## 5-Layer Defense Model (Claude Code)

```
L1: Per-Tool Cap       — 20K~100K chars per tool result
L2: HTML→MD Conversion — Turndown으로 구조 보존 압축
L3: Haiku Summary      — Secondary model이 대형 결과 요약
L4: Disk Persistence   — 50K+ chars → 디스크 저장 + 2KB preview
L5: Aggregate Budget   — 200K chars per API message (합계 제한)
```

## Key Patterns Extracted

### Per-Tool Size Cap

각 도구가 자체 `maxResultSizeChars`를 선언. GrepTool은 20K, WebFetchTool은 100K. 초과 시 잘림.

- `--max-columns 500`: minified/base64 줄을 원천 차단
- `head_limit=250`: LLM이 필요한 만큼만 요청하는 파라미터

### HTML→Markdown Conversion

Turndown 라이브러리로 HTML→Markdown 변환 후 원본 해제(GC). 구조를 보존하면서 토큰 밀도를 높인다.

### Large Result Persistence

50K chars 초과 → 전체 내용 파일 저장 → LLM에는 `<persisted-output>` 태그로 2KB preview + 파일 경로만 전달. LLM이 전체 필요 시 `Read` tool로 접근.

### Message Compaction Pipeline

```
applyToolResultBudget → snipModule → microcompact → contextCollapse → autocompact
```

5단계로 history를 점진적 압축. 오래된 메시지부터 제거/요약.

## GEODE GAP Analysis

| Claude Code Pattern | GEODE Status | GAP |
|---------------------|-------------|-----|
| Per-tool `maxResultSizeChars` | 설정만 존재, MCP 미적용 | MCP tool result에 강제 적용 필요 |
| HTML→MD 변환 | 없음 (raw HTML) | `markdownify` 도입 필요 |
| Haiku 사전 요약 | overflow 시에만 작동 | tool result 크기 기준 사전 요약 추가 |
| Disk persistence + preview | `tool_offload` 존재 (5000 tokens) | threshold 조정 필요 |
| Per-message aggregate budget | 없음 | 단일 API 호출의 tool_result 합계 제한 추가 |
| `--max-columns 500` | MCP ripgrep 미적용 | MCP tool args에 전달 필요 |

### Priority

1. **P0**: GLM context overflow 감지 (수정 완료)
2. **P1**: MCP tool result 크기 제한 (browser_snapshot 90K+ 토큰)
3. **P1**: HTML→MD 변환
4. **P2**: Per-message aggregate budget
5. **P2**: Haiku 사전 요약

## Karpathy 3-Layer Comparison

autoresearch의 더 급진적 접근과의 대비:

| Layer | Strategy | Cost |
|-------|----------|------|
| L1 | 차단 — stdout을 파일로 리다이렉트, 컨텍스트에 넣지 않음 | 최저 |
| L2 | 추출 — `grep "^val_bpb:"` 필요한 2줄만 | 중간 |
| L3 | 요약 — LLM이 1비트 판정 (개선/악화) | 최고 |

## Related

- [[geode-context-guard]] — GEODE context guard system
- [[geode-agentic-loop]] — Agentic loop and context management
- [[geode-long-running-safety]] — Long-running agent safety patterns
- [[blog-research-detail]] — Full research document index
