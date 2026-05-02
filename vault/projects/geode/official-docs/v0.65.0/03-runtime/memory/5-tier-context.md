---
title: 5-Tier Context Hierarchy
category: runtime-memory
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/memory/context.py:46-212"
  - "core/memory/organization.py:24-80"
  - "core/memory/project.py"
  - "core/memory/vault.py:1-80"
  - "core/auth/credential_breadcrumb.py"
external_refs:
---

# 5-Tier Context Hierarchy

GEODE의 LLM context는 5계층으로 합쳐진다 — Org → Project → Session → Vault → Breadcrumb. 위쪽일수록 안정적, 아래쪽일수록 dynamic.

## 계층

| Tier | 위치 | 안정성 | 내용 |
|---|---|---|---|
| **1. Organization** | `plugins/<domain>/fixtures/`, `~/.geode/org/` | 매우 안정 | 도메인 fixture, 14-axis rubric, 공유 정책 |
| **2. Project** | `.geode/memory/PROJECT.md`, `.geode/rules/*.md` | 안정 | 프로젝트 컨벤션, 사용자 룰 |
| **3. Session** | in-memory (RuntimeContext) | 일회성 | run_id, working_dir, mode |
| **4. Vault** | `.geode/vault/{profile,research,applications,general}/` | 영속 | turn별 자동 적재 아티팩트 |
| **5. Breadcrumb** | LLM context line | 매 turn | 인증 실패/모델 전환 등 LLM-readable 노트 |

## ContextAssembler (`core/memory/context.py:46-212`)

```python
class ContextAssembler:
    def assemble(self, prompt, signals, ...) -> str:
        """5-tier 합쳐서 system+user prompt 생성."""
        org = self.org_memory.get_context_block()        # Tier 1
        project = self.project_memory.get_summary()      # Tier 2
        session = self._get_session_context()             # Tier 3
        vault = self._inject_vault_context()              # Tier 4
        breadcrumb = self._collect_breadcrumb()           # Tier 5
        return f"{org}\n{project}\n{session}\n{vault}\n{breadcrumb}\n{prompt}"
```

## Tier 1 — Organization

`MonoLakeOrganizationMemory` (`organization.py:24-80`):

- `plugins/game_ip/fixtures/*.json` 로드 → `_FIXTURES` 캐시
- `get_common_rubric()` — 14-axis 1-5 scale, confidence threshold 0.7
- 모든 IP 분석 호출에서 동일하게 prefix

## Tier 2 — Project

`ProjectMemory` (`project.py`):

```
.geode/
├── memory/
│   └── PROJECT.md          # ≤200 lines, ≤50 insights
└── rules/
    ├── coding-style.md     # YAML frontmatter로 path matching
    ├── security-rules.md
    └── ...
```

`MAX_INSIGHTS = 50`, `MAX_MEMORY_LINES = 200` — context bloat 방지.

## Tier 3 — Session

`RuntimeContext` 가 보유. run_id, working_dir, active model, current pipeline mode, 사용자 입력 등. ephemeral.

## Tier 4 — Vault

`Vault` (`vault.py`):

```
.geode/vault/
├── profile/        # 사용자 프로필 관련 자동 추출
├── research/       # 리서치 결과 (web_fetch, search 등)
├── applications/   # 작업 애플리케이션 (PR, schedule 등)
└── general/        # 분류 안 된 것
```

키워드 매칭으로 자동 라우팅:

```python
_CATEGORY_KEYWORDS = {
    "profile": {"resume", "career", "preference", ...},
    "research": {"paper", "study", "trend", ...},
    "applications": {"PR", "schedule", "job", ...},
}
```

`store_artifact(category=None)` 시 자동 추론, 명시 시 그대로 저장.

## Tier 5 — Breadcrumb

`credential_breadcrumb.format()` 같은 시스템 노트가 다음 turn 컨텍스트에 prefix 추가:

```
[system] credential note: ...
[system] model switched: claude-sonnet-4-6 → gpt-5.5 (Plus quota exhausted)
[user] ...
```

LLM이 읽고 사용자에게 안내.

## Context Budget

5 tier 합산이 LLM context window (e.g. 200K tokens) 한계 접근 시 **5-layer guard** 작동 (`core/agent/loop.py`):

1. Vault 항목 LRU 트리밍 (오래된 것부터 제외)
2. Project insights 50개 → 25개 압축
3. Session 비핵심 필드 제거
4. Breadcrumb 1개만 유지
5. Org 무조건 유지

trigger threshold: input_tokens > context_window * 0.85.

## 다음

- [[breadcrumb]] — Tier 5 디테일
- [[vault]] — Tier 4 vault routing
- [[prompt-caching]] — STATIC/DYNAMIC split
