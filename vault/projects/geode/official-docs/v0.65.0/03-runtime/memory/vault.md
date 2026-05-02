---
title: Memory Vault
category: runtime-memory
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/memory/vault.py:1-80"
external_refs:
---

# Memory Vault

`.geode/vault/` 하위에 LLM이 만들어낸 *지속해야 할* 아티팩트를 자동 분류 + 저장.

## 4 카테고리

```
.geode/vault/
├── profile/        # 사용자에 관한 정보
├── research/       # 외부 정보 수집 (web_fetch, search, etc.)
├── applications/   # 작업 결과물 (PR, schedule, plan)
└── general/        # 분류되지 않음 (대기열)
```

## 자동 라우팅

`_CATEGORY_KEYWORDS` (`vault.py`):

```python
_CATEGORY_KEYWORDS = {
    "profile": {
        "resume", "career", "preference", "personality", "goal",
        "interest", "background", "이력", "선호",
    },
    "research": {
        "paper", "study", "trend", "analysis", "report",
        "research", "논문", "조사", "트렌드",
    },
    "applications": {
        "PR", "schedule", "job", "task", "plan", "deploy",
        "스케줄", "작업", "계획",
    },
}
```

`store_artifact(content, category=None)` 호출 시 키워드 매칭으로 자동 추정. 어느 카테고리도 매칭 안 되면 `general/`.

## API

```python
vault = Vault(base_dir=".geode/vault")
artifact_id = vault.store_artifact(
    content="<markdown>",
    category=None,        # auto-detect
    title="Q3 trend analysis",
    metadata={"source": "web_search", "model": "..."},
)
# → "research/q3_trend_analysis_20260502.md"

results = vault.search("trend")  # 카테고리 가로질러 키워드 매칭
```

## 저장 형식

```markdown
---
title: Q3 trend analysis
category: research
created: 2026-05-02T10:30:00Z
source: web_search
model: claude-sonnet-4-6
---

# Q3 trend analysis

(content)
```

YAML frontmatter + markdown body. obsidian-vault 스타일 호환.

## Context 주입

`ContextAssembler._inject_vault_context()` 가 다음 LLM turn에 vault 요약을 주입:

```
[system] vault recent (5):
  - profile/preferred_languages_20260501.md (한국어, 영어)
  - research/q3_ai_trends_20260502.md
  - applications/pr_866_login_fix.md
  - ...
```

LLM이 보고 `note_read("research/q3_ai_trends_20260502.md")` 호출 가능.

## LRU + GC

context budget 한계 접근 시:
- 가장 오래 안 쓴 (last accessed) 항목부터 메타데이터만 유지, 본문 archive
- 30일 이상 미사용 → archive 디렉터리 이동
- 90일 이상 → `/clean --older-than=90d` 로 영구 삭제 가능

## 다음

- [[5-tier-context]] — 5-tier 전반
- [[breadcrumb]] — Tier 5 인증 노트
- [[lifecycle]] — `/clean` 명령
