---
title: Troubleshooting
category: operations
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
external_refs:
---

# Troubleshooting

증상 → 원인 → fix 룩업.

## 인증 / 모델

### `manage_login` 이 모든 PAYG profile을 "provider_mismatch"로 표시

**증상:** v0.64.0 이전. PAYG / OAuth profile이 dashboard / LLM 보고에서 `eligible=False / reason=provider_mismatch`.

**원인:** `core/cli/tool_handlers.py:handle_manage_login` 의 verdict 집계 dict 키 collision.

**Fix:** v0.65.0 (PR #866) 으로 자동 해결. `uv tool install -e . --force` 로 업그레이드.

### `Codex OAuth token not available` 경고

**원인:** GEODE-issued OAuth 만료 + 외부 Codex CLI auth.json도 없음.

**Fix:** `geode /login oauth openai` 또는 사용자가 Codex CLI에서 `codex login`.

### 모델 호출 시 401 / 403

**원인:** API key 만료 / OAuth 토큰 expired / Plus 구독 해지.

**Fix:**
1. `geode /status` 로 active profile 확인
2. `manage_login` 으로 reason 확인 (EXPIRED / DISABLED / COOLING_DOWN)
3. 해당 fix:
   - EXPIRED → `oauth <provider>` 재인증
   - COOLING_DOWN → 대기 또는 다른 plan
   - MISSING_KEY → `set-key <plan> <key>`

## 운영

### serve daemon이 시작 안 함

**증상:** `geode` 호출 시 IPC 연결 실패.

**원인:**
1. socket 파일 stale (`~/.geode/cli.sock` 존재하지만 daemon 죽음)
2. startup lock 잠겨있음 (`~/.geode/cli.startup.lock` 으로 다른 프로세스 시작 중)
3. 포트 충돌 (드물게 — Unix socket 사용 중)

**Fix:**
```bash
ps aux | grep "geode serve" | grep -v grep | awk '{print $2}' | xargs kill
rm -f ~/.geode/cli.sock ~/.geode/cli.startup.lock
geode  # 다시 시도
```

### "stuck" turn 알림이 자주 뜸

**원인:** AgenticLoop이 7200s(기본) 초과. 외부 API 응답 지연 또는 LLM이 무한 도구 호출.

**Fix:**
1. 해당 turn 로그 확인 (`~/.geode/runs/log.jsonl`)
2. `config.toml` 의 `[automation] stuck_timeout_seconds` 임계값 조정
3. 도구 무한 루프 — `ApprovalWorkflow` 의 streak auto-deny 트리거 확인

### MCP 서버 응답 timeout

**원인:** MCP 서버 subprocess crash 또는 API 호출 지연.

**Fix:** MCP manager가 자동 3회 restart 시도. 그 후 disable:

```bash
tail -50 ~/.geode/mcp/<server>/log     # crash 원인 확인
```

manual restart:

```python
from core.mcp import get_mcp_manager
mgr = get_mcp_manager()
mgr.stop("<server>")
mgr.start("<server>")
```

## E2E / 분석

### `geode analyze "Cowboy Bebop" --dry-run` 결과가 A (68.4) 아님

**원인:** 파이프라인 회귀. 노드 / scoring constants / fixture 변경 의심.

**Fix:**
1. `git status` — 의도치 않은 변경?
2. `git log -- plugins/game_ip/` — 최근 변경 확인
3. fixture 무결성: `plugins/game_ip/fixtures/_golden_set.json` 비교
4. `pytest tests/test_calibration.py -v` — golden set match

### Guardrails G3 (Grounding) 자주 fail

**원인:** LLM이 환각 수치 생성.

**Fix:**
1. signal 데이터 충분한지 확인 (signal 없으면 LLM이 추정값 사용)
2. analyst prompt에 "evidence는 signals 데이터에 있는 것만" 강조
3. 모델 변경 — gpt-4 family는 환각이 더 많을 수 있음

## 디버깅

### LangSmith trace 안 만들어짐

**원인:** `LANGSMITH_TRACING=true` 환경변수 누락 또는 API key 잘못.

**Fix:** `.env` 또는 `~/.geode/.env`:
```
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=ls__...
LANGSMITH_PROJECT=geode-dev
```

### Run log JSONL 파일 너무 큼

**원인:** Snapshot manager GC 안 돌고 있음 또는 임계값 너무 큼.

**Fix:**
```bash
geode /clean --older-than=30d --scope=global
```

또는 `config.toml` 의 `[automation] snapshot_max_runs` 값 줄임.

## 다음

- [[faq]] — FAQ
- [[debugging]] — 디버깅 일반
- [[env-vars]] — 환경 변수
