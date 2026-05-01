---
title: Kiki Skills Index
category: skills
tags: [kiki, skills, codebase-analysis, setup-new-machine, paperclip]
sources:
  - "kiki/docs/guides/codebase-analysis-guide.md"
  - "kiki/docs/guides/setup-new-machine.md"
  - "kiki/.claude/skills/* (kiki-setup, kiki-observe, kiki-refresh, kiki-advise, kiki-export, kiki-maintain)"
created: 2026-04-30T11:30:00Z
updated: 2026-04-30T11:30:00Z
---

# Kiki Skills Index

Kiki 의 **runtime skills** (`.claude/skills/kiki-*`) + **운영 가이드** (`docs/guides/`).

## Runtime Skills (`.claude/skills/`)

[[kiki|Kiki Hub §"Skills Registry"]] 참조.

| Skill | 트리거 | 출력 |
|---|---|---|
| `/kiki-setup` | "팀 부트스트랩", "Paperclip 셋업" | YAML 템플릿 → Paperclip agents 설치 + 회사 skill 등록 |
| `/kiki-observe` | "Slack 관찰", "behavioral signal" | Slack channel → behavioral signals (raw text 미저장) |
| `/kiki-refresh` | "프로필 갱신", "health check" | 최신 signals → profile 갱신 + 5 진단 항목 |
| `/kiki-advise` | "agent directive 만들어", "advice" | profile → 각 agent 용 directive |
| `/kiki-export` | "Obsidian 동기화", "wiki 갱신" | memory → Obsidian vault (Karpathy LLM Wiki 패턴) |
| `/kiki-maintain` | "유지보수 제안", "PO+Planner" | 자동화된 maintenance 제안 |

## docs/guides/ — 운영 가이드

### codebase-analysis-guide.md

새 codebase 만났을 때 분석 프로토콜. **Paperclip team onboarding** 용도 — 외부 회사 코드베이스를 처음 받았을 때 `codebase-map` Company Skill에 주입할 분석 결과 생성.

작업 흐름:
1. 대상 codebase 가 있는 워크스페이스에서 실행
2. 자동으로 stack 식별 + entry point 추적 + 의존 graph
3. 산출물 → Paperclip team 의 `codebase-map` Company Skill 에 주입
4. 그 회사의 모든 agent 가 `codebase-map` skill 호출 시 사전 분석 정보 활용

[[kiki-appmaker-skills-index|AppMaker 의 동일 가이드]] 와 byte-identical (kiki canonical).

### setup-new-machine.md

다른 머신에서 GitHub 기반으로 Kiki 전체 환경을 세팅.

Prerequisites:
- macOS / Linux (Windows 미지원)
- git, node 22+, docker, claude-code CLI
- Slack workspace + bot token
- Paperclip account + API key
- (선택) Obsidian vault

세팅 단계:
1. Repo clone (`kiki` + 선택적으로 `kiki-appmaker`)
2. `.env` 작성 (SLACK_BOT_TOKEN, PAPERCLIP_API_KEY 등)
3. Paperclip 서버 install (별도 docker compose 또는 cloud)
4. `/kiki-setup` 으로 첫 팀 provisioning
5. `/kiki-observe` 로 첫 Slack 채널 관찰
6. `/kiki-export` 로 Obsidian vault 첫 sync

## See also

- [[kiki]] — Hub
- [[kiki-profile-pipeline]] — `/kiki-observe` + `/kiki-refresh` + `/kiki-advise` 의 5-stage pipeline
- [[kiki-research-index]] — paperclip-best-practices 의 plugin 패턴
- [[kiki-appmaker-skills-index]] — sister AppMaker 의 동일 가이드 + px-appmaker skill
- [[index]]
