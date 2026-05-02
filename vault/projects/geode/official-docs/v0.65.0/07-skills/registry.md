---
title: SkillRegistry
category: skills
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/skills/skills.py:123-310"
external_refs:
  - url: "https://hermes-agent.nousresearch.com/docs/user-guide/features/skills"
    pattern: "Skill loop pattern"
---

# SkillRegistry

`core/skills/skills.py:123-192` — 런타임 SkillRegistry. 4-tier discovery + 3-tier Progressive Disclosure.

## 4-Tier Discovery 우선순위

| 순서 | 위치 | 의미 |
|---|---|---|
| 1 | Bundled | GEODE 코드베이스 내장 (`core/skills/data/`) |
| 2 | Global | `~/.geode/skills/<name>/SKILL.md` |
| 3 | Project | `<cwd>/.geode/skills/<name>/SKILL.md` |
| 4 | Extra | 추가 디렉터리 (CLI 옵션) |

위쪽이 우선. 같은 이름 skill이 여러 곳에 있으면 위쪽이 winning.

## 3-Tier Progressive Disclosure

스킬 본문은 무겁다 (수백~수천 줄). 매 turn 모든 스킬 본문을 LLM context에 넣으면 token 폭발. 따라서:

| Tier | 시점 | 내용 |
|---|---|---|
| 1. Metadata | 항상 | name, description, trigger keywords (~50 tokens / skill) |
| 2. SKILL.md frontmatter | metadata 매칭 시 | 파라미터 schema, 예시 (~200 tokens) |
| 3. Body | invoke 시 | 전체 본문 (수천 tokens) |

LLM은 metadata 만 보고 "이 스킬 쓸지?" 판단 → invoke 결정 → body 로드.

## SKILL.md 형식

```markdown
---
name: my-skill
description: One-line summary. Triggered by "keyword1", "keyword2".
when_to_use: 사용 시나리오
trigger_keywords: [keyword1, keyword2]
---

# My Skill

본문 (이 부분이 Tier 3에서만 로드됨)
```

## 핵심 함수

```python
class SkillRegistry:
    def register(self, skill: Skill) -> None: ...
    def list_skills(self) -> list[SkillMetadata]: ...
    def find_by_trigger(self, query: str) -> list[Skill]: ...
    def get_context_block(self) -> str: ...   # metadata 만 포함
```

## SkillLoader (`skills.py:199-311`)

파일 시스템에서 SKILL.md 발견 + 파싱:

```python
class SkillLoader:
    def discover(self) -> list[Path]: ...   # 4-tier 순회
    def load_file(self, path: Path) -> Skill: ...
    def load_all(self, lazy: bool = True) -> list[Skill]: ...
```

`lazy=True` (기본) — Tier 1+2 만 로드. body 는 invoke 시 lazy load.

## 24 Scaffold Skills (.claude/skills/)

`/Users/mango/workspace/geode/.claude/skills/` 의 24개는 *런타임 SkillRegistry와 분리* — Claude Code 개발 세션 자체에서 활용되는 scaffold patterns. 즉 "GEODE 개발자가 GEODE를 개발할 때" 쓰는 가이드.

대표:
- `geode-pipeline`, `geode-scoring`, `geode-analysis`, `geode-verification`, `geode-e2e`
- `geode-gitflow`, `geode-changelog`, `geode-serve`
- `karpathy-patterns`, `openclaw-patterns`, `frontier-harness-research`
- `verification-team`, `anti-deception-checklist`, `code-review-quality`, `dependency-review`, `kent-beck-review`, `codebase-audit`
- `agent-ops-debugging`, `model-onboarding`, `tech-blog-writer`, `explore-reason-act`, `architecture-patterns`, `workflow-orchestrator`

이들은 [[catalog]] 페이지에서 따로 정리.

## 다음

- [[skill-creator]] — 새 skill 만들기
- [[catalog]] — 24 scaffold skills 카탈로그
