---
title: GEODE Bidirectional Learning
type: concept
category: learning
tags: [geode, learning, feedback, validation, correction, claude-code-pattern]
related:
  - "[[geode-memory-system]]"
  - "[[geode-architecture]]"
  - "[[mango]]"
sources:
  - "geode/core/"
created: 2026-04-07T00:00:00Z
updated: 2026-04-07T11:00:00Z
---

# GEODE Bidirectional Learning

Claude Code pattern: "Record from failure AND success."

## Problem

Unidirectional learning (corrections only) causes **conservative drift**.
Agent avoids past mistakes but loses confidence in validated approaches.

## Solution

| Detector | Signal | Category |
|----------|--------|----------|
| `_detect_correction` | "하지 마", "don't", "wrong" | correction |
| `_detect_validation` | "좋아", "맞아", "perfect", "exactly" | validation |
| LLM subagent | Contextual patterns (every 5 turns) | correction/validation/preference/domain |

## Why Context

Every correction/validation includes `[context: assistant_text]` so edge cases can be judged later.

```
[2026-04-06] [validation] Validated: 좋아. 그대로 진행해. [context: PR body를 4섹션 템플릿으로 작성했습니다]
```

## Wiring

```
auto_learn hook (priority 84) → regex detectors → UserProfile/learned.md
llm_extract_learning (priority 82) → budget LLM → UserProfile/learned.md
system_prompt G3 → UserProfile.get_learned_patterns() → LLM context
```

## Related

- [[geode-memory-system]]
- [[geode-architecture]]
- [[mango]]
- [[geode-claude-code-patterns]]
- [[blog-memory-context]]
- [[index]]
- [[geode]]

## Open Questions

- How to distinguish genuine validation from politeness?
- Should LLM extraction run on every turn or only on significant exchanges?
- [[career-hub]]
- [[geode-session-58-retrospective]]
