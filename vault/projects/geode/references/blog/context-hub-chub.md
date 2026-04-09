---
title: "Context Hub (chub) 리서치 — 코딩 에이전트의 '실시간 API 문서' 인프라"
type: reference
category: blog-post
tags: [blog, research]
source: "blog/research/context-hub-chub.md"
created: 2026-04-08T00:00:00Z
---

# Context Hub (chub) 리서치 — 코딩 에이전트의 "실시간 API 문서" 인프라

> Date: 2026-03-22 | Author: rooftopsnow | Tags: context-hub, chub, andrew-ng, API-docs, hallucination, annotation, MCP, harness-infrastructure

---

## 1. Context Hub란 무엇인가

[Context Hub](https://github.com/andrewyng/context-hub)는 **Andrew Ng 팀이 2026년 3월 9일에 공개한 오픈소스 CLI 도구**입니다. 코딩 에이전트에게 최신 API 문서를 제공하여 API 할루시네이션을 방지합니다.

| 항목 | 값 |
|------|-----|
| GitHub | [andrewyng/context-hub](https://github.com/andrewyng/context-hub) |
| Stars | 11,066+ |
| Forks | 973 |
| 언어 | JavaScript (Node.js ≥ 18) |
| 라이선스 | MIT |
| npm | `@aisuite/chub` |
| 공개일 | 2026-03-09 |
| 등록 API | 68+ 프로바이더 (Stripe, OpenAI, Anthropic, Supabase, Firebase, Twilio 등) |

핵심 문제 정의:

> **"코딩 에이전트는 오래된 API를 사용하고, 파라미터를 할루시네이션하며, 세션이 끝나면 학습한 것을 잊어버립니다."**

```
Without Context Hub              With Context Hub
─────────────────                ─────────────────
웹 검색 → 노이즈               큐레이팅된 문서 fetch
코드 실패                      코드 동작 확률 ↑
수정에 노력 소모               에이전트가 gap/workaround 기록
지식 소멸                      다음 세션에서 더 똑똑
↻ 매 세션 반복                 ↗ 점진적 개선
```

---

## 2. 아키텍처

### 2.1 전체 구조

```
Content repo (소스 오브 트루스: Markdown + YAML frontmatter)
  ↓ chub build → registry.json + content tree
CDN (cdn.aichub.org/v1)                          ← 원격 소스
  ↓ CLI가 여기서 fetch
~/.chub/ (로컬 캐시)                              ← 캐시
  ↓ CLI가 여기서 읽음
Agent / Human (stdout 또는 -o 파일로 소비)
  ↑ CLI도 여기서 직접 읽음
로컬 폴더 (사내/비공개 문서)                       ← 로컬 소스
```

### 2.2 콘텐츠 이원 구조: Docs vs Skills

| | Docs ("what to know") | Skills ("how to do it") |
|---|---|---|
| 용도 | API/SDK 레퍼런스 (지식 cutoff 극복) | 행동 지침, 코딩 패턴, 자동화 플레이북 |
| 크기 | 대형 (10K-50K+ tokens) | 소형 (<500줄 진입점) |
| 수명 | 일회성, 태스크별 fetch | 영구 설치 가능 (.claude/skills/) |
| 발견 | 에이전트가 명시적으로 search + fetch | 파일시스템에서 자동 발견 |
| 언어/버전 | O — 언어별, 버전별 변형 | X — 언어 무관 |
| 파일명 | `DOC.md` | `SKILL.md` |

이 구분은 **접근 패턴의 차이**에서 비롯됩니다. 50K 토큰짜리 API 레퍼런스를 "SKILL.md"로 부르면, 에이전트가 시스템 프롬프트에 로드하여 토큰을 낭비합니다.

### 2.3 레지스트리 설계

```json
{
  "version": "1.0.0",
  "base_url": "https://cdn.aichub.org/v1",
  "docs": [
    {
      "id": "openai/chat-api",
      "name": "chat-api",
      "description": "Chat completions with GPT models",
      "source": "maintainer",
      "tags": ["openai", "chat", "llm"],
      "languages": [
        {
          "language": "python",
          "versions": [
            { "version": "1.52.0", "path": "openai/docs/chat-api/v1", "files": ["DOC.md", "references/streaming.md"] }
          ],
          "recommendedVersion": "1.52.0"
        }
      ]
    }
  ],
  "skills": [
    {
      "id": "playwright-community/login-flows",
      "name": "login-flows",
      "path": "playwright-community/skills/login-flows",
      "files": ["SKILL.md", "helpers/login-util.ts"]
    }
  ]
}
```

**ID 형식**: `author/name` (npm scopes, Docker images, GitHub repos와 동일 패턴). 이름 충돌이 구조적으로 불가능합니다.

**신뢰도 필터링**: 각 항목에 `source` 필드(`official` | `maintainer` | `community`)가 있고, `~/.chub/config.yaml`에서 기업이 `source: official,maintainer`로 제한하면 에이전트가 커뮤니티 문서를 보지 못하게 할 수 있습니다.

### 2.4 데이터 전략: 하이브리드

| 접근 | 방식 | 장단점 |
|------|------|--------|
| Full bundle | 전체 다운로드 | 단순하나 확장 불가 |
| Index + on-demand | 개별 문서 fetch | 경량이나 매번 네트워크 필요 |
| **Hybrid (채택)** | registry만 기본, 문서는 on-demand, 번들은 선택 | 최적 균형 |

1. `chub update` → `registry.json`만 fetch (~100KB)
2. `chub search` → 로컬 레지스트리 검색 (네트워크 불필요)
3. `chub get <id>` → 진입점만 fetch (DOC.md or SKILL.md), 캐시 우선
4. `chub get <id> --full` → 모든 파일 fetch
5. `chub update --full` → `bundle.tar.gz` 전체 다운로드 (오프라인용)

---

## 3. CLI 명령 체계

```bash
npm install -g @aisuite/chub
```

### 3.1 핵심 5+1 명령

| 명령 | 용도 | 핵심 플래그 |
|------|------|------------|
| `chub search [query]` | 검색 (쿼리 없으면 전체 목록, 정확한 ID면 상세) | `--tags`, `--lang`, `--limit`, `--json` |
| `chub get <ids...>` | 문서/스킬 fetch (타입 자동 감지) | `--lang`, `--version`, `--full`, `--file`, `-o` |
| `chub annotate [id] [note]` | 로컬 노트 부착 (세션 간 영속) | `--clear`, `--list` |
| `chub feedback [id] [rating]` | 품질 평가 (유지보수자에게 전송) | `--label`, `--agent`, `--model` |
| `chub update` | 레지스트리 갱신 | `--force`, `--full` |
| `chub build <dir>` | 콘텐츠 디렉토리에서 레지스트리 빌드 | `-o`, `--base-url`, `--validate-only` |

### 3.2 에이전트 파이핑 패턴

```bash
# 검색 → 최상위 결과 → fetch → 파일 저장
ID=$(chub search "stripe payments" --json | jq -r '.results[0].id')
chub get "$ID" --lang js -o .context/stripe.md

# 여러 문서 동시 fetch
chub get openai/chat stripe/api -o .context/

# Claude Code 스킬로 설치
chub get pw-community/login-flows --full -o .claude/skills/login-flows/

# 멀티 소스 구분
chub get internal:openai/chat-api
```

### 3.3 점진적 공개 (Progressive Disclosure)

50K 토큰짜리 단일 문서 파일은 컨텍스트를 낭비합니다. 각 항목은 **진입점(DOC.md, ~500줄 이내)**과 **참조 파일들**로 구성됩니다.

```bash
chub get acme/widgets                              # 진입점만 (기본)
# 출력 하단:
# Additional files available (use --file to fetch):
#   references/advanced.md
#   references/errors.md

chub get acme/widgets --file references/advanced.md  # 특정 참조만
chub get acme/widgets --full                         # 전부
```

에이전트가 개요를 먼저 읽고, 필요한 참조만 선택적으로 로드합니다. 이것은 GEODE의 PromptAssembler가 컨텍스트 비율을 배분하는 것과 동일한 원리입니다 — **필요한 정보만, 필요한 시점에**.

---

## 4. 자기 개선 루프: Annotations + Feedback

Context Hub의 핵심 혁신은 **에이전트가 문서를 소비만 하는 게 아니라 개선에 기여하는 루프**입니다.

### 4.1 Annotations — 로컬, 나를 위한

```bash
# 태스크 완료 후 발견한 것을 기록
chub annotate stripe/api "Webhook verification requires raw body — do not parse before verifying"

# 다음 세션에서 chub get stripe/api 하면 자동으로 표시:
# ---
# [Agent note — 2026-03-15T10:30:00Z]
# Webhook verification requires raw body — do not parse before verifying
```

- `~/.chub/annotations/`에 JSON으로 저장됩니다
- 로컬 전용 — 공유/동기화되지 않습니다
- 항목당 하나의 주석 — 새 노트가 이전 것을 교체합니다
- 세션 간 영속 — 에이전트가 같은 실수를 반복하지 않습니다

### 4.2 Feedback — 글로벌, 모두를 위한

```bash
chub feedback stripe/api up --label accurate "Clear examples, models are current"
chub feedback openai/chat down --label outdated --label wrong-examples "Lists gpt-4o as latest but gpt-5.4 is out"
```

레이블 체계:
- **긍정**: `accurate`, `well-structured`, `helpful`, `good-examples`
- **부정**: `outdated`, `inaccurate`, `incomplete`, `wrong-examples`, `wrong-version`, `poorly-structured`

피드백은 유지보수자에게 전송되어 문서 품질이 시간이 지남에 따라 개선됩니다.

### 4.3 두 메커니즘의 관계

| | Annotations | Feedback |
|---|---|---|
| **대상** | 내 에이전트 (로컬) | 문서 작성자 (글로벌) |
| **영속** | 내 머신 | 레지스트리 |
| **목적** | 같은 실수 반복 방지 | 콘텐츠 개선 |
| **가시성** | 나만 | 유지보수자 |
| **효과** | 다음 fetch에 자동 표시 | 작성자가 문서 업데이트 |

> Annotations는 오늘 내 에이전트를 돕습니다. Feedback은 내일 모든 사람을 돕습니다.

---

## 5. Claude Code 통합

### 5.1 스킬 기반 통합

`~/.claude/skills/get-api-docs/SKILL.md`를 생성하면, Claude Code가 외부 API를 사용하는 코드를 작성할 때 자동으로 chub를 호출합니다.

```yaml
---
name: get-api-docs
description: >
  Use this skill when you need documentation for a third-party library, SDK, or API
  before writing code that uses it — for example, "use the OpenAI API", "call the
  Stripe API", "use the Anthropic SDK", "query Pinecone", or any time the user asks
  you to write code against an external service and you need current API reference.
  Fetch the docs with chub before answering, rather than relying on training knowledge.
---
```

### 5.2 5단계 워크플로우

SKILL.md가 강제하는 에이전트 워크플로우:

```
Step 1: chub search "<library>" --json     → 문서 ID 확인
Step 2: chub get <id> --lang py            → 최신 문서 fetch
Step 3: 문서를 읽고 정확한 코드 작성        → 학습 데이터 의존 X
Step 4: chub annotate <id> "발견한 것"      → 로컬 지식 축적
Step 5: chub feedback <id> up/down          → 글로벌 품질 개선
```

### 5.3 MCP 서버 지원

chub는 **MCP(Model Context Protocol) 서버**로도 동작합니다:

```bash
chub-mcp  # MCP 서버 실행
```

`cli/src/mcp/tools.js`에 구현된 MCP 도구들:

| 도구 | 용도 |
|------|------|
| `chub_search` | 문서/스킬 검색 |
| `chub_get` | 문서/스킬 fetch (언어/버전/full/file 지원) |
| `chub_list` | 전체 목록 조회 |
| `chub_annotate` | 로컬 주석 CRUD |
| `chub_feedback` | 품질 평가 전송 |

MCP 서버를 통해 Claude Code가 CLI를 거치지 않고 **도구 호출(tool use)**로 직접 chub를 사용할 수 있습니다.

---

## 6. BYOD (Bring Your Own Docs) — 사내 문서 통합

### 6.1 멀티 소스 설정

```yaml
# ~/.chub/config.yaml
sources:
  - name: community
    url: https://cdn.aichub.org/v1       # 공개 CDN
  - name: internal
    path: /path/to/local/docs            # 사내 문서 폴더

source: "official,maintainer,community"   # 신뢰도 정책
```

### 6.2 사내 문서 빌드

```bash
# 콘텐츠 디렉토리 구조
my-internal-docs/
├── mycompany/
│   ├── docs/
│   │   └── internal-api/
│   │       ├── python/
│   │       │   └── DOC.md    # languages: "python", versions: "2.0.0"
│   │       └── javascript/
│   │           └── DOC.md
│   └── skills/
│       └── deploy-workflow/
│           └── SKILL.md

# 빌드
chub build my-internal-docs/ -o dist/

# 에이전트가 사용
chub get internal:mycompany/internal-api --lang py
```

### 6.3 Agent Skills 호환

콘텐츠 형식은 [Agent Skills 사양](https://agentskills.io/specification)을 따릅니다. Claude Code, Cursor, Codex, OpenCode 등 30+ 에이전트와 호환됩니다. chub로 fetch한 스킬을 `.claude/skills/`에 바로 설치할 수 있습니다.

---

## 7. 하네스 엔지니어링과의 접점

### 7.1 harness-for-real과의 관계

harness-for-real은 이미 Context Hub 통합을 내장하고 있습니다:

```bash
# init.sh에서 chub 사용 가능 여부 자동 감지
# 프로젝트 타입별 문서 prefetch
chub search "<library>" → .context/chub-registry.json

# PROMPT_build.md, PROMPT_plan.md에서 에이전트에게 chub 사용 지시
"Use chub search and chub get to fetch current API docs before coding"

# LEARNINGS.md와 연동
chub annotate <id> "<discovery>"  → 세션 간 영속
```

### 7.2 GEODE/REODE와의 비교

| 기능 | GEODE/REODE | Context Hub |
|------|-------------|-------------|
| **목적** | 에이전트 시스템 전체 구축 | 외부 API 문서 제공 |
| **메모리** | 4.5-Tier (SOUL→User→Org→Project→Session) | 2-Tier (Annotations 로컬 + Feedback 글로벌) |
| **컨텍스트 제어** | PromptAssembler 5-Phase + SHA-256 pinning | Progressive Disclosure (--full/--file) |
| **학습 루프** | LEARNINGS.md + ContextAssembler 280c 요약 | chub annotate (자동 표시) + feedback (글로벌) |
| **스킬 시스템** | 27 skills (.claude/skills/) | Agent Skills 사양 호환 SKILL.md |
| **MCP** | 42 catalog auto-discovery | chub-mcp 서버 (5 tools) |
| **신뢰도** | PolicyChain 6-layer | source 필드 + config 필터링 |

### 7.3 하네스 4축 관점에서의 Context Hub

| 축 | Context Hub의 역할 |
|---|---|
| **컨텍스트 제어** | 에이전트에게 최신 API 문서를 주입하여 할루시네이션 방지. Progressive Disclosure로 토큰 예산 관리. |
| **실행 루프** | 5단계 워크플로우 (search → get → code → annotate → feedback)를 SKILL.md로 강제. |
| **검증 파이프라인** | feedback 메커니즘으로 문서 품질을 크라우드소싱 검증. 에이전트가 문서 정확성을 up/down 평가. |
| **관측** | annotate로 에이전트의 학습 내용을 기록/추적. 어떤 문서가 유용했는지 데이터 축적. |

### 7.4 핵심 설계 원칙과 Karpathy 패턴 매핑

| Context Hub 설계 결정 | Karpathy 패턴 |
|---|---|
| 단일 `chub get` 명령 (doc/skill 자동 감지) | **P10 Simplicity Selection** — 불필요한 구분 제거 |
| `registry.json` 100KB만 기본 fetch | **P6 Context Budget** — 필요한 정보만 필요한 시점에 |
| Annotations 로컬 영속 | **P5 Git as State** — 상태를 파일에 외부화 |
| YAML frontmatter + Markdown | **P8 Dumb Platform** — 단순한 형식, 복잡한 로직은 에이전트에게 |
| author/name ID 충돌 방지 | **P2 Single File Constraint** — 구조적으로 충돌 불가능 |

---

## 8. 실전 활용 시나리오

### 8.1 시나리오 A: REODE 마이그레이션 파이프라인에서 사용

```
assess_node
  ↓ "Spring Boot 3으로 마이그레이션해야 합니다"
  ↓ chub search "spring boot 3 migration" --json
  ↓ chub get spring/boot-3-migration --lang java
  ↓ 최신 마이그레이션 가이드 기반으로 assess report 생성

fix_node
  ↓ "javax.xml.bind 에러 발생"
  ↓ chub search "jakarta xml bind" --json
  ↓ chub get jakarta/xml-bind --lang java
  ↓ 정확한 의존성 교체 수행
  ↓ chub annotate jakarta/xml-bind "jaxb-impl 4.0.5 필요, 3.x는 동작 안 함"
```

### 8.2 시나리오 B: harness-for-real에서 외부 API 통합

```
Phase 2 (Build) — Sonnet이 Stripe API 통합 구현
  ↓ SKILL.md 트리거: "Use the Stripe API"
  ↓ chub search "stripe" --json
  ↓ chub get stripe/api --lang js
  ↓ 최신 v2 API 기반 코드 작성 (할루시네이션 없음)
  ↓ chub annotate stripe/api "v2 webhook endpoint 사용, v1은 deprecated"
  ↓ chub feedback stripe/api up --label accurate
```

### 8.3 시나리오 C: 사내 API 문서 관리

```bash
# 사내 API 문서를 chub 형식으로 작성
mkdir -p internal-docs/mycompany/docs/payment-api/python
cat > internal-docs/mycompany/docs/payment-api/python/DOC.md << 'EOF'
---
name: payment-api
description: 사내 결제 API v3 — 주문/결제/환불
metadata:
  languages: "python"
  versions: "3.2.0"
  source: official
  tags: "payment,internal"
---
# Payment API v3
...
EOF

# 빌드 + 로컬 소스로 등록
chub build internal-docs/ -o internal-docs/dist/
# config.yaml에 path 추가

# 에이전트가 사내 문서도 검색 가능
chub get internal:mycompany/payment-api --lang py
```

---

## 9. 제한사항과 채택 판단

### 채택 이유 (O)

- 외부 API를 사용하는 코드를 에이전트가 작성할 때 (할루시네이션 방지)
- 여러 프로바이더(68+)의 최신 문서가 필요할 때
- 세션 간 학습 영속이 필요할 때 (annotations)
- 사내 API 문서를 에이전트에게 제공하고 싶을 때 (BYOD)
- Claude Code 스킬/MCP 서버로 원활하게 통합할 때

### 채택하지 않을 이유 (X)

- 외부 API를 사용하지 않는 프로젝트 (내부 로직만 있는 경우)
- 이미 프로젝트에 충분한 API 문서가 있는 경우 (.context/ 등)
- 오프라인 환경에서 `chub update --full` 사전 실행이 어려운 경우
- Node.js 18+ 설치가 불가능한 환경

### 알려진 제한

| 제한 | 설명 |
|------|------|
| Node.js 의존 | `npm install -g @aisuite/chub` 필요 |
| 문서 커버리지 | 68+ 프로바이더이나 전체 API 생태계의 극히 일부 |
| 언어 편향 | Python/JavaScript 중심, Go/Rust/Java 문서 부족 |
| 품질 편차 | `community` 소스 문서의 품질이 일정하지 않음 |
| 로컬 전용 Annotations | 팀 간 공유 불가 (개인 머신에만 저장) |

---

## 10. 결론

### cmux와 Context Hub — 하네스 인프라의 두 축

| | cmux | Context Hub |
|---|---|---|
| **역할** | 에이전트를 **실행**하는 터미널 인프라 | 에이전트에게 **지식**을 주입하는 문서 인프라 |
| **해결하는 문제** | "여러 에이전트를 어떻게 병렬 관리하나" | "에이전트가 오래된 API를 왜 쓰나" |
| **하네스 레이어** | Layer 1 (터미널, 알림, 소켓) | Layer 1.5 (컨텍스트 주입, 학습 영속) |
| **가격** | 무료 | 무료 |

두 도구 모두 **Dumb Platform** 철학을 따릅니다 — 프리미티브를 제공하고, 워크플로우 결정은 개발자에게 맡깁니다. 하네스 엔지니어링의 로직 레이어(FSM, 래칫, 회로 차단기 등)는 여전히 CLAUDE.md + hooks + skills에서 직접 구축해야 합니다.

### 한 줄 요약

> Context Hub는 코딩 에이전트의 **외부 API 지식 인프라**입니다. 최신 문서를 CLI/MCP로 주입하고, annotations로 세션 간 학습을 영속시키며, feedback으로 문서 품질을 크라우드소싱합니다. 할루시네이션은 모델의 한계가 아니라 컨텍스트의 부재입니다.

---

## Sources

- [andrewyng/context-hub GitHub](https://github.com/andrewyng/context-hub)
- [Andrew Ng 발표 트윗](https://x.com/AndrewYNg/status/2031051809499054099)
- [MarkTechPost: Andrew Ng's Team Releases Context Hub](https://www.marktechpost.com/2026/03/09/andrew-ngs-team-releases-context-hub-an-open-source-tool-that-gives-your-coding-agent-the-up-to-date-api-documentation-it-needs/)
- [DeepLearning.AI: Crowdsourced Context for Coding Agents](https://www.deeplearning.ai/the-batch/crowdsourced-context-for-coding-agents/)
- [DEV.to: Context Hub Has 68 APIs](https://dev.to/aws/context-hub-has-68-apis-add-yours-33ma)
- [Context Hub CLI Reference](https://github.com/andrewyng/context-hub/blob/main/docs/cli-reference.md)
- [Context Hub Design Document](https://github.com/andrewyng/context-hub/blob/main/docs/design.md)
- [Context Hub 공식 사이트](https://www.context-hub.org/cli)

---

*Source: `blog/research/context-hub-chub.md` | Category: [[blog-research]]*

## Related

- [[blog-research]]
- [[blog-hub]]
- [[geode]]
- [[geode-memory-system]]
