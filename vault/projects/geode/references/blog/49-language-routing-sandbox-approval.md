---
title: "코딩 에이전트의 세 가지 경계: 언어, 샌드박스, 승인"
type: reference
category: blog-post
tags: [blog, safety-verification]
source: "blog/posts/safety-verification/49-language-routing-sandbox-approval.md"
created: 2026-04-08T00:00:00Z
---

# 코딩 에이전트의 세 가지 경계: 언어, 샌드박스, 승인

> 멀티 프로바이더 코딩 에이전트를 운영하면 세 가지 경계 문제가 동시에 터집니다.
> GLM-5는 중국어로 변수명을 짓고, fix_node는 로컬에 JDK를 설치하려 하고,
> 사용자는 37번의 "Allow? [Y/n]"에 지칩니다.
> 이 글은 REODE가 이 세 문제를 어떻게 풀었는지 기록합니다.

---

## 1. 언어 라우팅: GLM-5는 왜 중국어로 코딩하는가

6개 LLM 프로바이더를 지원하면 예상 못한 문제가 생깁니다. Anthropic Claude는 사용자 언어를 잘 따라가지만, GLM-5(ZhipuAI)와 Qwen(Alibaba)은 **기본 출력이 중국어**입니다. 한국어로 질문해도 중국어로 답하고, 변수명까지 중국어로 짓습니다.

리서치 결과, 이 문제는 **프론티어 프레임워크에서도 미해결**입니다. harness-for-real, Claude Code, Codex 모두 언어 라우팅 기능이 없습니다. 단일 프로바이더를 전제하기 때문입니다.

### 해법: 감지 + 지시 + 차단

3계층 접근입니다:

```python
# 1. 감지: Hangul 비율로 한국어/영어 판별
def detect_user_language(text: str) -> str:
    korean_count = sum(1 for c in text[:200] if '\uac00' <= c <= '\ud7a3')
    return "ko" if korean_count / len(text[:200]) > 0.2 else "en"

# 2. 지시: 전 시스템 프롬프트에 Language Rules 주입
## Language Rules (MANDATORY)
- Variable names: ALWAYS English
- Comments: {user_language}
- Responses: {user_language}

# 3. 차단: GLM-5 전용 오버라이드
## GLM Provider — CRITICAL
Do NOT output Chinese (中文) under ANY circumstances.
```

Karpathy의 CAN NOT 패턴을 적용했습니다: "할 수 있는 것"보다 "할 수 없는 것"을 먼저 정의합니다. GLM-5에게는 "한국어로 답하라"보다 **"중국어를 쓰지 마라"**가 더 효과적입니다.

---

## 2. 샌드박스: 코딩 에이전트가 로컬을 오염시킨다

fix_node가 빌드 에러를 고치려고 `brew install openjdk@22`를 실행하면 어떻게 될까요? 사용자의 로컬 환경이 오염됩니다.

Claude Code의 접근은 **프롬프트 제약 + 사용자 승인**입니다. 위험한 동작은 사용자에게 묻고, 시스템 레벨 차단은 최소화합니다.

REODE의 접근은 Claude Code 패턴 + **코드 레벨 deny list**입니다.

```python
# PipelineBashTool에서 코드 레벨 차단 (프롬프트 무시해도 차단됨)
_DENY_PATTERNS = [
    "curl ", "wget ",           # 바이너리 다운로드
    "brew install", "apt install",  # 패키지 설치
    "sdk install", "jenv ",     # JDK 버전 매니저
    "export JAVA_HOME",         # 환경변수 오염
    "git push", "git reset --hard",  # 리포 조작
    "kill ", "pkill ",          # 프로세스 조작
    "--privileged", "-v /:/",   # Docker escape
]
```

### Defense-in-Depth: 왜 4중 방어인가

프롬프트 + 코드 + Seatbelt + env whitelist = 4중 방어입니다. 각 계층이 다른 공격 벡터를 차단합니다:

1. **프롬프트 제약**: LLM이 위험한 명령을 생성하지 않도록 사전에 지시합니다. 가장 가볍지만, LLM은 프롬프트를 무시할 수 있습니다. 특히 긴 컨텍스트에서 초기 지시가 희석되는 "lost in the middle" 현상이 발생합니다.
2. **코드 레벨 deny list**: 프롬프트를 무시하고 `brew install`을 생성해도, 실행 전에 문자열 매칭으로 차단합니다. 프롬프트 계층의 실패를 보완하는 hard boundary입니다.
3. **macOS Seatbelt**: OS 커널 레벨에서 파일시스템 접근을 제한합니다. deny list를 우회하는 새로운 명령어가 등장해도 Seatbelt이 최종 방어선이 됩니다.
4. **환경변수 whitelist**: 컨테이너에 전달되는 환경변수를 명시적으로 제한합니다. `JAVA_HOME`이나 `PATH` 오염을 원천 차단합니다.

이 구조가 자율 에이전트에서 특히 중요한 이유가 있습니다. 사람이 개입하는 에이전트는 승인 단계에서 위험한 명령을 걸러낼 수 있지만, 자율 실행 모드에서는 그 기회가 없습니다. 단일 계층에 의존하면 한 곳이 뚫릴 때 전체가 무방비 상태가 됩니다. 프론티어 도구들이 프롬프트만 의존하는 것보다 한 단계 더 강한 방어를 구축한 이유입니다.

빌드는 **Docker 컨테이너 안에서만** 실행합니다:

```
## Docker Build Mode (MANDATORY)
### PROHIBITED
- java_build 직접 사용 금지
- sdk install / brew install 금지
- JAVA_HOME / PATH 수정 금지
```

---

## 3. 승인 체계: 37번의 "Allow?"를 1번으로

REPL에서 GLM-5에게 "E2E 테스트해봐"라고 하면, Tomcat 구동 -> WAR 배포 -> curl 확인 -> 로그 확인 -> 중지 -> 재시도... 매 `run_bash`마다 `Allow? [Y/n]`이 뜹니다. 37라운드입니다.

### 37번의 승인이 문제인 이유

단순히 "귀찮다"의 문제가 아닙니다. 37번의 승인 요청은 에이전트의 자율성을 근본적으로 훼손합니다. 사용자가 30번째쯤 되면 내용을 읽지 않고 Y를 누르게 되는데, 이는 승인 체계의 보안 가치를 완전히 무효화합니다. 또한 각 승인 대기 시간(평균 3~5초)이 누적되면 37 * 4초 = 약 2.5분이 순수 대기 시간으로 낭비됩니다. 에이전트가 자율적으로 작업해야 하는 구간에서 사람이 병목이 되는 것입니다.

Claude Code의 해법은 **"Allow always for this session"**입니다. 한 번 승인하면 같은 도구는 세션 내 재질문이 없습니다.

REODE에는 3가지 경로를 구현했습니다. 각 경로는 다른 사용 시나리오에 맞춰져 있습니다:

```
# 1. 인터랙티브 — A 누르면 세션 내 자동
Allow? [Y/n/A(lways this tool)]

# 2. CLI 플래그
reode --auto-approve          # 전체 자동
reode --trust-bash            # run_bash만 자동

# 3. REPL 슬래시 명령 (세션 중 변경)
/approve all                  # 전체 자동
/approve bash                 # bash만 자동
/approve reset                # 수동으로 복원
```

**경로별 사용 시나리오**:
- **인터랙티브 (A)**: 개발 중 탐색 단계에서 사용합니다. 처음에는 수동으로 확인하다가, 패턴이 안전하다고 판단되면 A를 눌러 전환합니다. Claude Code의 permission model과 동일한 철학입니다.
- **CLI 플래그 (`--auto-approve`, `--trust-bash`)**: CI/CD 파이프라인이나 배치 실행에 적합합니다. 사람이 모니터링하지 않는 환경에서 사전에 신뢰 범위를 설정합니다. `--trust-bash`는 파일 편집은 수동 확인하되 빌드/테스트 실행만 자동화하는 중간 지점입니다.
- **REPL 슬래시 (`/approve`)**: 세션 도중 신뢰 수준을 동적으로 변경합니다. 위험한 작업 구간에서는 `/approve reset`으로 수동 모드로 복귀하고, 안전한 구간에서는 다시 `/approve all`로 전환할 수 있습니다.

---

## 4. 트레이드오프

| 결정 | 선택 | 대안 | 이유 |
|------|------|------|------|
| 언어 감지 | Hangul 휴리스틱 | langdetect 라이브러리 | 외부 의존성 0, 한국어/영어만 필요 |
| 샌드박스 | deny list + Seatbelt | Docker 완전 격리 (OpenHands) | Claude Code 패턴 — 실용적 + 로컬 개발 편의 |
| 승인 | A(lways) + CLI + /approve | 전체 자동만 (Codex) | 세분화된 제어 — bash만 자동, 나머지는 수동 가능 |
| 중국어 차단 | 프롬프트 "DO NOT Chinese" | 응답 후 필터링 | 프롬프트가 더 효율적 + 토큰 낭비 없음 |

이 네 가지 결정을 관통하는 하나의 주제가 있습니다: **경계를 설정하면 자율성이 올라갑니다.** 역설적으로 들리지만, 제약이 없는 에이전트는 오히려 자율적으로 동작할 수 없습니다. deny list가 없으면 모든 bash 명령에 사용자 승인이 필요하고, 승인 체계가 없으면 에이전트를 아예 자율 모드로 전환할 수 없습니다. 언어 경계가 없으면 중국어 출력을 사람이 수동으로 걸러야 합니다. 명확한 경계가 있기 때문에 그 경계 안에서는 안심하고 에이전트에게 제어를 넘길 수 있는 것입니다.

---

## 마무리

세 가지 경계 문제를 풀면서 얻은 핵심 인사이트가 있습니다. 자율 에이전트의 신뢰성은 "얼마나 많은 것을 할 수 있는가"가 아니라 **"얼마나 명확하게 할 수 없는 것이 정의되어 있는가"**에 달려 있습니다. 언어 라우팅은 출력 언어의 경계를, 샌드박스는 실행 환경의 경계를, 승인 체계는 권한의 경계를 설정합니다. 이 세 경계가 명확할수록 에이전트를 더 적극적으로 활용할 수 있게 됩니다.

---

## 5. What's Next

- 언어 감지 고도화: 일본어, 중국어 입력 지원 (현재는 한국어/영어만)
- 승인 이력 persist: `~/.reode/permissions.json`에 세션 간 유지
- Playwright E2E와 승인 체계 통합: 브라우저 테스트도 auto-approve 대상

---

*REODE v0.15.0 — PR #257~#261. 경계를 설정하면 자율성이 올라갑니다.*

---

*Source: `blog/posts/safety-verification/49-language-routing-sandbox-approval.md` | Category: [[blog-safety]]*

## Related

- [[blog-safety]]
- [[blog-hub]]
- [[geode]]
