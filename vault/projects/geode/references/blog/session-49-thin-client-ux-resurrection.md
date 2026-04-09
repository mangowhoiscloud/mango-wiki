---
title: "'아무것도 안 나와요' — thin-only 전환 후 UX를 되살리기까지"
type: reference
category: blog-post
tags: [blog, narrative]
source: "blog/posts/narrative/session-49-thin-client-ux-resurrection.md"
created: 2026-04-08T00:00:00Z
---

# "아무것도 안 나와요" — thin-only 전환 후 UX를 되살리기까지

> Date: 2026-03-30 | Author: geode-team | Tags: narrative, thin-client, ux, agent-architecture, ipc

## Table of Contents

1. [세션의 시작 — 핸드오프 리스트](#1-세션의-시작)
2. [E2E 테스트, 첫 충격](#2-e2e-테스트)
3. [console.print()는 어디로 갔나](#3-console-print)
4. [ContextVar는 스레드를 넘지 않는다](#4-contextvar)
5. [스케줄러 좀비 사냥](#5-스케줄러-좀비)
6. [색이 없다 — DEVNULL의 저주](#6-색이-없다)
7. [사용자 한마디가 설계를 바꾸다](#7-사용자-한마디)
8. [over-engineering 유혹을 거부하다](#8-over-engineering)
9. [10개의 PR, 그리고 남은 것](#9-10개의-pr)

---

## 1. 세션의 시작

v0.37.1 핸드오프를 받았습니다. 5개 백로그 항목. README subtitle 변경, slash command IPC 개선, concurrency config, serve 로그, welcome screen 모델. 일상적인 유지보수 세션이 될 것 같았습니다.

사용자가 말했습니다.

> "이전에 REPL에서 동작하고 나왔던 모든 CLI UI/UX 및 동작을 현재 구조에서도 재현해야 돼. 지금 문제 사항이 꽤 많아 보이니 직접 E2E 하면서 진행해."

단순 백로그 소화가 아니라, 전면 점검이 시작됐습니다.

## 2. E2E 테스트, 첫 충격

25개 slash 명령어를 하나씩 thin client에서 실행했습니다.

```
> /status
>
> /model
>
> /schedule
>
```

전부 빈 출력. 단 하나도 작동하지 않았습니다. `/help`와 `/quit`만 동작했는데, 이것들은 thin client 로컬에서 실행되는 `_LOCAL_COMMANDS`였기 때문.

25개 명령어가 전부 침묵한다. 이건 단순 버그가 아니라 **구조적 결함**이었습니다.

## 3. console.print()는 어디로 갔나

원인은 간단했습니다. `_handle_command_on_server()`에서 `_handle_command()`를 호출하면, 내부의 `console.print()`가 serve 프로세스의 stdout으로 갑니다. IPC 응답에는 `{"status": "ok"}`만 담겨서 thin client로 돌아옵니다.

해결도 간단했습니다. `capture_output()` context manager로 console 출력을 StringIO에 캡처하고, IPC 응답에 `"output"` 필드로 포함. client에서 `sys.stdout.write(output)`.

이 수정 하나로 25개 slash 명령어가 전부 살아났습니다. 하지만 이건 시작에 불과했습니다.

## 4. ContextVar는 스레드를 넘지 않는다

`/schedule`이 동작했지만, dynamic jobs가 안 보였습니다. `/status`에서 "Mode: Dry-Run Only"가 표시됐는데, API key가 설정돼 있는데도.

원인: Python의 ContextVar는 **스레드 간 자동 전파가 안 됩니다**. serve main 스레드에서 `_scheduler_service_ctx.set()`, `_set_readiness()` 한 값이 CLI poller 스레드에서는 보이지 않았습니다.

해결: `CLIPoller._propagate_contextvars()`에서 readiness, scheduler_service, domain, memory, profile을 명시적으로 설정. readiness는 CLI poller 스레드에서 직접 `check_readiness()` 호출 (가벼운 연산, LLM 없음).

## 5. 스케줄러 좀비 사냥

사용자가 물었습니다.

> "스케줄러는 정상 동작해? 이전에 NL 파싱이 데드코드로 남아있을 가능성이 높은데."

NL 파서는 데드코드가 아니었습니다 (621줄, 2개 활성 경로). 하지만 감사를 하니 더 큰 문제가 나왔습니다.

`jobs.json`에 13개 job이 있었고, **전부 `action=""`**. 매 60초마다 13번 fire → 전부 no-op. 8개는 predefined template이 dynamic store에 중복 등록된 잔재, 5개는 NL 테스트 잔해.

root cause: `/schedule create`가 NL 파서 결과를 그대로 `add_job()` — action 없이. tool handler (`schedule_job`)에서는 action 필수 검증이 있었지만, CLI 경로에는 없었습니다.

수정:
1. `add_job()` guardrail — action 또는 callback 없으면 reject
2. `load()` — action="" job 자동 skip + warning log
3. `/schedule create` — `"schedule" "action"` 쌍따옴표 구문 필수

사용자가 말했습니다.

> "no action이나 의도하지 않은 값들이 들어가는 경우 없게 구조 디벨롭도 같이 진행해."

guardrail은 양쪽에 걸어야 합니다. 입력 측(CLI)과 저장 측(add_job) 모두. 한쪽만 하면 다른 경로에서 뚫립니다.

## 6. 색이 없다 — DEVNULL의 저주

아직 끝이 아니었습니다. prompt 실행 시 tool call은 streaming으로 보였지만, **색이 없었습니다**. 그리고 spinner 애니메이션도 안 보였습니다.

serve 프로세스는 `nohup ... > /dev/null 2>&1 &`로 시작됩니다. `sys.stdout = DEVNULL`. Rich Console은 초기화 시 `stdout.isatty()` 체크 → `False` → `_color_system = None` → 모든 ANSI 스타일 제거.

나중에 `_force_terminal = True`를 설정해도 `_color_system`은 이미 None. 두 번째 수정이 필요했습니다: `_color_system = ColorSystem.TRUECOLOR` 강제 override.

TextSpinner는 또 다른 함정. `sys.stdout.write()` 직접 호출 — console redirect와 무관하게 DEVNULL로 갑니다. `console.file`을 따라가도록 `_out()` 메서드 추가.

DEVNULL이라는 하나의 사실이 3가지 다른 형태의 버그를 만들었습니다:
1. console output → DEVNULL (capture_output으로 해결)
2. color system → None (ColorSystem override로 해결)
3. spinner → DEVNULL (TextSpinner._out()으로 해결)

## 7. 사용자 한마디가 설계를 바꾸다

여기까지가 Raw Console Stream — serve의 console 출력을 그대로 socket으로 파이프하는 방식. 동작했지만, client가 데이터의 의미를 몰랐습니다.

사용자가 병렬 tool call UI를 보고 말했습니다.

> "호출했을 때 옆에 스피닝을 돌다가 완료되면 체크가 되는 방식으로 바꾸자."

이걸 하려면 client가 "이 tool은 아직 실행 중이고, 저 tool은 완료됐다"를 알아야 합니다. Raw stream에서는 불가능.

> "IPC 측은 시작과 종료 요청만 주고 thin CLI에서 그동안 스피닝을 주다가 완료되면 체크만 딱 뜨면 되지 않아?"

이 한 문장이 Raw Stream에서 Structured Events로의 전환점이었습니다. 12개 event type, client-side EventRenderer, per-tool ToolCallTracker — 전부 이 한 문장에서 나왔습니다.

## 8. over-engineering 유혹을 거부하다

Lane Queue 조사 중, 흥미로운 패턴들을 발견했습니다. Temporal의 Priority + Fairness Keys, Netflix의 Adaptive Concurrency (AIMD), Kubernetes ResourceQuota. 모드별 Lane 분리, per-mode slot quota, preemptive priority scheduling.

설계 문서까지 작성했습니다:

```
Total: 8 slots
├── IPC (interactive): min=2, max=4
├── DAEMON (gateway):  min=2, max=4
├── SCHEDULER (cron):  min=1, max=3
└── SUBAGENT (fan-out): min=0, max=4
```

사용자가 물었습니다.

> "시스템을 더 복잡하게 하지 말자. 원래 해결하려던 문제가 뭐였지?"

원래 문제: **thin-only에서 REPL UX 재현**. Lane 분리는 현재 발생하지 않는 문제를 해결하는 것이었습니다. Global Lane 8슬롯에서 starvation이 일어난 적 없고, scheduler는 `try_acquire`로 양보하고, CLI 사용자는 1명.

조사 결과는 보존했습니다. 실제 병목이 관찰되면 그때 꺼내 쓰면 됩니다.

## 9. 10개의 PR, 그리고 남은 것

세션 종료 시점: 10개 PR merged to main. 3422 tests maintained.

해결한 것:
- 25개 slash 명령어 출력 복원
- 실시간 streaming agentic UI (tool calls, results, tokens)
- 12 structured event types + client-side direct rendering
- Per-tool spinner with in-place ✓
- Scheduler 좀비 13개 제거 + guardrail
- 색상/spinner DEVNULL 문제 해결
- README, setup guide, context lifecycle 문서

남은 것:
- `/model` hot-swap — settings만 변경하고 active loop은 안 바뀌는 버그
- `/quit` session cost relay
- `--continue/--resume` IPC session persistence

"아무것도 안 나와요"에서 시작해서 structured event protocol까지. 단순한 UX 수정이 될 줄 알았던 세션이 IPC 프로토콜 설계로 끝났습니다. 문제를 직접 E2E로 확인하는 것, 그리고 사용자의 요구를 기술적 결정으로 번역하는 것 — 이 둘이 세션의 방향을 결정했습니다.

---

*Source: `blog/posts/narrative/session-49-thin-client-ux-resurrection.md` | Category: [[blog-narrative]]*

## Related

- [[blog-narrative]]
- [[blog-hub]]
- [[geode]]
