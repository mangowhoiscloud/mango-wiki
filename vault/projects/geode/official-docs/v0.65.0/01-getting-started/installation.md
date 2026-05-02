---
title: Installation
category: getting-started
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "pyproject.toml:1-7"
  - "README.md"
external_refs:
---

# Installation

GEODE는 Python 3.12+ + [uv](https://docs.astral.sh/uv/) 패키지 매니저 환경에서 동작한다.

## 사전 준비

| 도구 | 검증 명령 | 설치 |
|---|---|---|
| Python 3.12+ | `python3 --version` | macOS: `brew install python@3.12` / Windows: [python.org](https://www.python.org/downloads/) |
| Git | `git --version` | [git-scm.com](https://git-scm.com/) |
| uv | `uv --version` | `curl -LsSf https://astral.sh/uv/install.sh | sh` |

## 설치 (편집 가능한 CLI 도구)

GEODE는 **`uv tool install -e .`** 패턴으로 글로벌 CLI를 박는다 — 코드 수정이 즉시 반영되는 editable install.

```bash
git clone https://github.com/<your-fork>/geode.git
cd geode
uv tool install -e . --force
uv sync
```

설치 확인:

```bash
geode about
# GEODE v0.65.0
# Model      <model>  (<provider>)
# Auth       N profile(s) — ...
```

## 의존성 변경 시 재설치

`pyproject.toml` 의 dependencies 변경 시:

```bash
uv tool install -e . --force
uv sync
```

dependencies 변경 없으면 `uv sync` 만으로 충분.

## 첫 실행 — Doctor

설치 직후 `geode doctor` 로 환경 진단:

| 항목 | 검사 |
|---|---|
| Python | >= 3.12 |
| `geode` PATH | `which geode` 결과 |
| `~/.geode/.env` | 환경 변수 파일 |
| Codex CLI OAuth | `~/.codex/auth.json` 가독성 (옵션) |
| ProfileStore | `~/.geode/auth.toml` 존재 + 파싱 가능 |
| Serve socket | `~/.geode/cli.sock` |
| `~/.local/bin` PATH | shell PATH에 포함 |

각 실패 항목별 `Run: <fix command>` 안내.

## 인증 설정

`/login` 슬래시 명령 또는 LLM 호출 시 자동 안내. 자세한 내용은 [[manage-login]], [[oauth-flow]] 참조.

```bash
geode /login                # 대시보드
geode "use ChatGPT Plus"    # LLM이 manage_login(oauth, openai) 자동 호출
```

## 다음

- [[quickstart]] — 첫 실행
- [[learning-path]] — 단계별 학습 경로
- [[first-analysis]] — 도메인 분석 실습
