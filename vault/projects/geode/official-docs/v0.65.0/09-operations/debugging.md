---
title: Operational Debugging
category: operations
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/cli/cmd_lifecycle.py"
  - "core/paths.py"
external_refs:
---

# Operational Debugging

GEODE 운영 환경에서 자주 발생하는 디버깅 진입점.

## 1. 상태 확인 — `geode /status`

```
GEODE serve daemon
  PID: 26582  (uptime: 1h 23m)
  Socket: ~/.geode/cli.sock

Active model:
  gpt-5.5 (openai-codex)

Profiles: 8 — anthropic, glm, openai, openai-codex

Memory:
  Org:     12 KB
  Project: 4 KB (PROJECT.md 87 lines, 23 insights)
  Vault:   240 KB (research/12, applications/8, ...)
```

## 2. 로그 — `~/.geode/serve.log`

```bash
tail -f ~/.geode/serve.log
```

또는 특정 패턴:

```bash
grep -E "ERROR|WARN" ~/.geode/serve.log | tail -50
grep "stuck_detector" ~/.geode/serve.log
```

## 3. JSONL Run Log

`~/.geode/runs/log.jsonl` — 매 turn 기록. 분석 도구:

```bash
jq 'select(.event == "AGENT_TURN_ENDED")' ~/.geode/runs/log.jsonl | tail -10
```

## 4. LangSmith Trace

`LANGSMITH_TRACING=true` 일 때 모든 LLM 호출 자동 trace. 대시보드에서:

- 같은 prompt_hash 그룹 비교
- model_id 별 응답 시간 분포
- cache_read_input_tokens 비율

[[observability]] 참조.

## 5. doctor — 환경 진단

```bash
geode doctor
```

다음 항목 검사:
- Python ≥ 3.12
- `geode` PATH
- `~/.geode/.env`
- ProfileStore 파싱
- Serve socket
- Codex CLI OAuth (옵션)

각 실패 항목에 `Run: <fix command>` 안내.

## 6. Profile / Auth 디버깅

```
geode /login                # 대시보드: Plans / Profiles / Routing
```

또는 LLM 호출 후:

```
사용자: "manage_login status"
→ LLM이 manage_login(subcommand="status") 호출 → 결과 표시
```

[[manage-login]] 참조 — v0.65.0의 verdict 표시 fix.

## 7. MCP 서버 디버깅

```bash
ps aux | grep "mcp-"          # 실행 중 MCP 서버
tail ~/.geode/mcp/<server>/log
```

각 MCP 서버는 별도 subprocess. 응답 timeout 시 manager가 자동 restart (3회 한도).

## 8. 캐시 정리

```bash
geode /clean --scope=build --dry-run    # 계획만
geode /clean --scope=build               # build 캐시
geode /clean --scope=project             # 프로젝트 .geode/ (PROJECT.md 보존)
```

## 9. 완전 초기화

```bash
geode /stop                              # daemon 종료
geode /uninstall --keep-config           # ~/.geode/ 삭제 (config.toml 보존)
uv tool uninstall geode                  # CLI 자체 제거
```

## 자주 발생 패턴 (skill: agent-ops-debugging)

| Anti-pattern | 의미 |
|---|---|
| Safe Default Anti-pattern | "에러 시 기본값 반환" 이 silent failure 만들음 |
| ContextVar DI lifecycle | `set_*()` 누락 → `get_*()` None → silent skip |
| Closure capture | factory function의 closure가 stale 상태 capture |
| Multi-gap root cause | 단일 증상 → 다중 결함 원인 (manage_login 결함이 그 사례) |
| Graceful Degradation vs Correctness | 잘못된 결과 반환보다 명시 실패가 나음 |

## 다음

- [[slack-gateway]] — Slack 통합
- [[env-vars]] — 환경 변수
- [[troubleshooting]] — 자주 발생 문제
- [[faq]] — FAQ
