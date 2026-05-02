---
title: Quickstart
category: getting-started
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/cli/__init__.py:987-1018"
  - "core/agent/loop.py"
  - "README.md"
external_refs:
---

# Quickstart

설치 (`[[installation]]`) 후 5분 안에 첫 호출.

## 1. CLI 시작

```bash
geode
```

자동으로 `geode serve` daemon이 떠오르며 IPC 연결. REPL 진입.

## 2. 자연어 한 줄로 실행

```
> summarize the latest AI research trends
```

GEODE가:
1. AgenticLoop 시작
2. Tool 선택 (`web_fetch`, `general_web_search`, etc.)
3. 결과 종합
4. 요약 응답

```
> compare React vs Vue for a new project
> schedule daily standup reminder at 9am
```

## 3. 도메인 분석 (Game IP plugin)

```bash
geode analyze "Cowboy Bebop" --dry-run     # LLM 안 부르고 fixture 흐름만 검증
geode analyze "Cowboy Bebop" --verbose      # 실제 LLM 호출
```

Dry-run 결과:

```
Final Score: ███████████████████████████░░░░░░░░░░░░░ 68.4/100
A   |  68.4 pts (60-79)  |  undermarketed
```

## 4. 슬래시 명령

| 명령 | 의미 |
|---|---|
| `/login` | 인증 대시보드 |
| `/model` | 모델 전환 |
| `/clear` | 세션 컨텍스트 초기화 |
| `/status` | daemon + disk 사용량 |
| `/skills` | 등록된 스킬 목록 |
| `/help` | 전체 슬래시 명령 |
| `/stop` | serve daemon 종료 |

자세한 내용은 [[cli/overview]].

## 5. 종료

```
> /exit
```

또는 Ctrl+D. serve daemon은 백그라운드 유지 — 명시적 `/stop` 까지 살아 있음.

## 다음

- [[first-analysis]] — Cowboy Bebop dry-run 디테일
- [[learning-path]] — 단계별 학습
- [[manage-login]] — 인증 설정
