---
title: Kiki AppMaker Skills Index
category: skills
tags: [kiki-appmaker, skills, px-appmaker, codebase-analysis, db-schema, qa-runtime, setup]
sources:
  - "kiki-appmaker/docs/skills/px-appmaker/SKILL.md"
  - "kiki-appmaker/docs/guides/codebase-analysis-guide.md"
  - "kiki-appmaker/docs/guides/db-schema-collation.md"
  - "kiki-appmaker/docs/guides/qa-runtime-probe-protocol.md"
  - "kiki-appmaker/docs/guides/setup-new-machine.md"
created: 2026-04-30T11:30:00Z
updated: 2026-04-30T11:30:00Z
---

# Kiki AppMaker Skills Index

AppMaker 의 4 가지 운영 가이드 + 1 핵심 skill. agent / 사용자가 반복 수행하는 패턴 정형화.

## px-appmaker SKILL — 외부 회사 provisioning

`docs/skills/px-appmaker/SKILL.md` + 5 references (cdo-lead, cto-lead, pm-lead, qa-lead, quality-standards).

새 외부 회사를 AppMaker 에 onboarding 하는 자동화 skill:

1. **회사 정보 수집** — 회사명, 도메인 (e.g. `<company>.needlup.com`), 초기 멤버 list, budget
2. **Workspace provisioning** — `install/workspaces/40-team/` 에서 회사 yaml 생성 + agent team 17명 설치
3. **Paperclip plugin 설치** — `kiki.profile-injector` plugin 활성화 + 회사 prefix 분리
4. **OAuth credential rotation 설정** — `install/tools/claude-creds-sync.sh` 에 회사 추가
5. **Dashboard provisioning** — `app/dashboard/<company>/` 에 token tracking + agent activity 페이지 설치
6. **Pitch deck deploy** — pitch landing page (`output/pitch/` 기반) `<company>.needlup.com` 으로 D-1..D-9 배포
7. **Smoke test + ACCEPTANCE** — 회사 첫 issue 생성 → CTO routing → 전체 PDCA 1회전 확인

References (`px-appmaker/references/`):
- `cdo-lead.md` — Design 단계 reference (회사별 디자인 컬렉션)
- `cto-lead.md` — Routing reference
- `pm-lead.md` — SPEC 양식
- `qa-lead.md` — Check reference
- `quality-standards.md` — 평가 기준 (40% 디자인 + 30% 독창성)

## 운영 가이드 (4)

### codebase-analysis-guide.md

새 codebase 만났을 때 분석 프로토콜:
1. **scaffold 식별** — `package.json`, `pyproject.toml`, `Cargo.toml` 등으로 stack 결정
2. **entry point 추적** — `main.ts` / `cli/__init__.py` / `bin/` 에서 시작
3. **graph traversal** — 핵심 컴포넌트 + 의존 방향
4. **production path 격리** — test / mock / dev-only 분리
5. **데이터 흐름 매핑** — input → 처리 → output 단계
6. **확장 포인트 식별** — plugin / hook / config

agent 가 이 가이드 따라 새 코드베이스 onboarding 수행. [[geode-development-workflow|geode 개발 워크플로우]] Step 1 GAP Audit 과 유사.

### db-schema-collation.md

DB 스키마 collation (정렬 순서) 통합 가이드. 한국어 + 영어 + 숫자 mixed 데이터에서 발생하는 정렬 이슈:

- **MySQL utf8mb4_general_ci** vs **utf8mb4_unicode_ci** — `_unicode_ci` 권장 (한국어 정렬 안정)
- **collation 충돌** — table / column / 쿼리에 다른 collation 명시 시 join 에러
- **migration 패턴** — 기존 데이터 보존하며 collation 전환

### qa-runtime-probe-protocol.md

QA Lead 가 검증 단계에서 따라야 할 runtime probe 절차:

1. **smoke test** — 핵심 endpoint 5개 HTTP 200 확인
2. **db connectivity** — Prisma client 초기화 + 1 read query 성공
3. **auth flow** — `/login` → 쿠키 set → `/me` 200
4. **payment flow** (해당 시) — Stripe webhook simulator 통과
5. **performance baseline** — `/` 페이지 < 2s 응답
6. **로그 sanity** — error log 없음, warning log < 5건

각 probe 실패 → QA_REPORT.md 에 명시 + Dev 재작업 트리거.

### setup-new-machine.md

새 머신에서 kiki-appmaker 환경 세팅:

```bash
# 1. Repo clone
git clone https://github.com/mangowhoiscloud/kiki-appmaker ~/workspace/kiki-appmaker
cd ~/workspace/kiki-appmaker

# 2. Bootstrap (5 stage workspace install)
bash install/bootstrap.sh

# 3. Doctor (환경 검증)
bash install/doctor.sh

# 4. Container build + start
docker compose up -d

# 5. claude-creds-sync (OAuth 토큰 inject)
bash install/tools/claude-creds-sync.sh

# 6. Smoke test
curl http://localhost:3000/api/health
```

5-stage workspace:
- `10-core` — Paperclip core
- `20-patches` — kiki-patches rebase
- `30-plugins` — kiki-plugin (sibling clone 또는 GitHub Release)
- `40-team` — agent team yaml
- `50-dashboards` — token + diagram dashboards

doctor.sh 가 멱등 검증 (이미 설치된 항목은 skip).

## See also

- [[kiki-appmaker]] — Hub
- [[kiki-appmaker-orchestration]] — Sandwich identity 활용
- [[kiki-appmaker-agent-roles]] — px-appmaker references 의 lead role 정의
- [[kiki-skills-index]] — sister codebase 의 동일 가이드 + runtime skills
- [[index]]
