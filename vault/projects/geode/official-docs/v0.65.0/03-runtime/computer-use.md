---
title: Computer Use
category: runtime
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/tools/computer_use.py:1-100"
external_refs:
  - url: "https://docs.anthropic.com/en/docs/agents-and-tools/computer-use"
    pattern: "Anthropic computer_20251124"
  - url: "https://platform.openai.com/docs/"
    pattern: "OpenAI computer_use_preview"
---

# Computer Use

LLM이 마우스/키보드/스크린샷으로 데스크톱을 조작하는 provider-agnostic 하네스. Anthropic + OpenAI 양쪽 지원.

## ComputerUseHarness (`core/tools/computer_use.py:1-100`)

```python
class ComputerUseHarness:
    target_resolution = (1280, 800)  # LLM 보낼 스크린샷 크기

    def screenshot(self) -> bytes: ...                  # PIL → PNG bytes
    def click(self, x: int, y: int) -> None: ...        # pyautogui.click
    def double_click(self, x: int, y: int) -> None: ...
    def type(self, text: str) -> None: ...              # pyautogui.typewrite
    def key(self, key: str) -> None: ...
    def scroll(self, dx: int, dy: int) -> None: ...
    def screenshot_region(self, x, y, w, h) -> bytes: ...
```

## Provider 지원

| Provider | Tool name | 입력 형식 |
|---|---|---|
| Anthropic | `computer_20251124` | `{"action": "click", "coordinate": [x, y]}` |
| OpenAI | `computer_use_preview` | `{"type": "click", "x": x, "y": y}` |

LLM의 tool call → harness 메서드 매핑:

```python
def execute(action: str, coordinate=None, text=None, ...):
    if action == "screenshot":
        return self.screenshot()
    elif action == "click":
        x, y = self._scale_to_screen(coordinate)
        self.click(x, y)
    ...
```

## 좌표 스케일링

LLM은 1280×800 좌표계 기준으로 추론. 실제 화면이 다르면 스케일:

```python
def _scale_to_screen(self, coord: tuple) -> tuple:
    target_w, target_h = self.target_resolution
    actual_w, actual_h = pyautogui.size()
    scale_x = actual_w / target_w
    scale_y = actual_h / target_h
    return (int(coord[0] * scale_x), int(coord[1] * scale_y))
```

스크린샷도 반대 방향으로 스케일 (실제 화면 → 1280×800).

## 의존성

```python
import pyautogui   # 마우스/키보드/screenshot
from PIL import Image  # 리사이즈 + 인코딩
```

`uv sync` 시 설치 (pyproject.toml dependencies).

## 안전

`computer` 는 [[safety-tiers|DANGEROUS_TOOLS]] — *항상 명시 승인*. 사용자가 "use computer to ..." 호출 명시해야 LLM이 호출.

3회 연속 승인 시 streak auto-approve도 적용 (`ApprovalWorkflow`). 그러나 risk가 큰 도구이므로 어떤 LLM도 쓰지 않도록 default profile에서 차단 가능.

## 한계

- **Headless 환경 미지원** — display 필요 (`DISPLAY` env)
- **스크린 lock 시 자동 unlock 안 함**
- **OS 다이얼로그/permission popup**: macOS Accessibility / Screen Recording 권한 요청 시 사용자 수동

## 다음

- [[safety-tiers]] — DANGEROUS_TOOLS
- [[approval]] — Approval Workflow
- [[mcp]] — 외부 도구
