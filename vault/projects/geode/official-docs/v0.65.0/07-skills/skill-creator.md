---
title: Creating a Skill
category: skills
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/skills/skills.py:199-310"
external_refs:
---

# Creating a Skill

GEODE 스킬은 두 종류 — **런타임 SkillRegistry용** (사용자 명령에 LLM이 호출) 과 **scaffold용** (개발자 워크플로우 가이드). 작성 절차는 동일.

## 위치 결정

| 종류 | 위치 |
|---|---|
| Bundled (코어 내장) | `core/skills/data/<name>/SKILL.md` |
| Global (사용자 전역) | `~/.geode/skills/<name>/SKILL.md` |
| Project (프로젝트 한정) | `.geode/skills/<name>/SKILL.md` |
| Scaffold (개발자) | `.claude/skills/<name>/SKILL.md` |

scaffold 스킬은 *Claude Code 개발 세션 자체*에서 활용. 런타임은 `core/skills/SkillRegistry`.

## SKILL.md 형식

```markdown
---
name: my-skill
description: One-line summary. Triggered by "keyword1", "keyword2".
when_to_use: 사용 시나리오 한 줄
trigger_keywords: [keyword1, keyword2, "한국어"]
priority: 50
---

# My Skill

전체 본문 (Tier 3 — invoke 시에만 로드)

## 절차

1. ...

## 검증

- [ ] ...
```

## Frontmatter 필드

| 필드 | 의미 |
|---|---|
| `name` | 고유 식별자 (디렉터리 이름과 일치) |
| `description` | LLM이 매칭 판정에 쓸 한 줄 |
| `when_to_use` | 발화 시나리오 |
| `trigger_keywords` | 키워드 매칭 (한/영 모두 가능) |
| `priority` | 발견 우선순위 (낮음=높은 우선) |

## 작성 가이드 (skill-creator)

`.claude/skills/skill-creator/` (있다면) 가 메타-스킬. 새 스킬 만들 때 따라야 할 룰:

1. **단일 책임** — 한 스킬 = 한 패턴
2. **Trigger 명확** — 키워드 + when_to_use 둘 다 채움
3. **검증 가능** — 본문에 "Verification" 섹션 또는 checklist 포함
4. **참고 출처** — frontier 시스템 인용 시 URL/section 명시
5. **Anti-deception** — 스킬 자체가 가짜 성공을 권유하지 않는지 (verification-team 패턴 참조)

## 등록

런타임 SkillRegistry는 위 4 위치를 자동 discovery (4-tier 우선). 등록 명시적 호출 불필요 — `~/.geode/skills/<name>/SKILL.md` 만 두면 다음 serve 재시작 시 자동 발견.

scaffold 스킬은 `.claude/skills/<name>/SKILL.md` 위치. Claude Code가 user prompt 분석 시 매칭.

## 테스트

스킬 파일을 `core/skills/data/` 에 두면 `tests/test_skills.py` 가 자동 발견 + 등록 검증:

```python
def test_my_skill_discovered():
    registry = SkillRegistry()
    SkillLoader().load_all(lazy=False)
    assert any(s.name == "my-skill" for s in registry.list_skills())
```

## 24 scaffold 사례

`.claude/skills/` 24개가 reference. 패턴:
- `geode-*`: GEODE 자체 영역별 가이드 (pipeline, scoring, verification, e2e, gitflow, changelog, serve)
- `*-patterns`: 디자인 패턴 (karpathy, openclaw)
- `*-review`: 리뷰 렌즈 (kent-beck, code-review-quality, dependency)
- `*-checklist`: 검증 (anti-deception, verification-team)
- `tech-blog-writer`, `model-onboarding`, ...

## 다음

- [[registry]] — SkillRegistry 동작
- [[catalog]] — 24 scaffold 카탈로그
