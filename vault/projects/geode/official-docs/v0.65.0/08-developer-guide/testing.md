---
title: Testing & Quality Gates
category: developer-guide
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "CLAUDE.md:309-316"
  - "tests/"
  - "pyproject.toml"
external_refs:
---

# Testing & Quality Gates

GEODE의 quality 4-gate. 매 변경에 통과 필수.

## 4 게이트

| Gate | 명령 | 기준 |
|---|---|---|
| **Lint** | `uv run ruff check core/ tests/ plugins/` | 0 errors |
| **Type** | `uv run mypy core/ plugins/` | 0 errors |
| **Test** | `uv run pytest tests/ -m "not live"` | 4380+ pass |
| **E2E** | `uv run geode analyze "Cowboy Bebop" --dry-run` | A (68.4) unchanged |

## 테스트 마커

```toml
# pyproject.toml
[tool.pytest.ini_options]
testpaths = ["tests"]
markers = [
    "live: external API calls (excluded by default)",
]
```

| 마커 | 실행 |
|---|---|
| (없음) | 기본 — `pytest` 호출 시 |
| `not live` | 기본 + 명시 (`-m "not live"`) |
| `live` | 명시 호출 (`-m live`). **사용자 동의 필수** (CHANGELOG: ~10,000원/run, memory feedback_test_cost) |

## 테스트 디렉터리 구조

```
tests/
├── test_*.py              # 단위/통합
├── conftest.py             # 공유 fixture
└── ...
plugins/game_ip/
└── (별도 테스트 경로 검토)
```

## 공통 패턴

### 회귀 테스트

bug fix 시 *fix 제거 시 fail 하는 테스트* 동반:

```python
def test_my_fix_works():
    # 정상 입력으로 정상 출력 검증
    # fix 없으면 fail 해야 함 — anti-deception 룰
```

`git stash push -- core/<fixed_file>.py` → `pytest test_my_fix` → fail 확인 → `git stash pop`.

### Mock 사용

| 용도 | 권장 방법 |
|---|---|
| LLM 어댑터 mock | `unittest.mock.MagicMock()` 또는 dry-run 모드 |
| 외부 API mock | `pytest-httpx`, `responses` |
| 파일시스템 | `tmp_path` fixture |
| 환경변수 | `monkeypatch.setenv()` |
| ProfileStore | `monkeypatch.setenv("GEODE_AUTH_TOML", str(tmp_path / "auth.toml"))` |

### 인증 테스트

```python
def test_with_isolated_auth(tmp_path, monkeypatch):
    monkeypatch.setenv("GEODE_AUTH_TOML", str(tmp_path / "auth.toml"))
    # ... ProfileStore가 tmp 경로 사용
```

`test_manage_login_tool.py::TestVerdictPerOwnProvider` 가 이 패턴의 예.

## E2E

`uv run geode analyze "Cowboy Bebop" --dry-run` — fixture 기반 결정적 E2E.

| IP | 기대 |
|---|---|
| Berserk | S (81.2), conversion_failure |
| Cowboy Bebop | A (68.4), undermarketed |
| Ghost in the Shell | B (51.7), discovery_failure |

분포 변경 = 파이프라인 동작 변경 = 검증 필요.

## CI

| Job | runtime |
|---|---|
| Lint & Format | ~10s |
| Security Scan | ~15s |
| Type Check | ~30s |
| Test | ~2-3분 |
| Gate | ~3s |

CI 5/5 통과 후에만 merge.

## 의존성

`pyproject.toml [tool.uv.dev]` 에 dev dependencies. `uv sync` 시 자동 설치.

## 다음

- [[workflow]] — 8-step
- [[contributing]] — PR 흐름
- [[verification-team]] — 대규모 검증
