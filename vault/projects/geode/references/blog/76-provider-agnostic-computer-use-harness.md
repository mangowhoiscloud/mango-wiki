---
title: "LLM에게 눈과 손을 달아주다 — Provider-Agnostic Computer-Use Harness 설계"
type: reference
category: blog-post
tags: [blog, architecture]
source: "blog/posts/architecture/76-provider-agnostic-computer-use-harness.md"
created: 2026-04-08T00:00:00Z
---

# LLM에게 눈과 손을 달아주다 — Provider-Agnostic Computer-Use Harness 설계

> Date: 2026-04-06 | Author: geode-team | Tags: computer-use, pyautogui, Anthropic, OpenAI, screen-automation, agent-system

## 목차
1. 문제: LLM은 화면을 볼 수 없다
2. 아키텍처: 3-Tier Computer-Use 스택
3. Layer 1 — ComputerUseHarness: 좌표 스케일링과 액션 루프
4. Provider 통합: Anthropic과 OpenAI의 서로 다른 인터페이스
5. 안전 장치: FAILSAFE, Opt-in, Accessibility 권한
6. 실전 시나리오: VS Code 열고 블로그 작성하기
7. 정리

---

## 1. 문제: LLM은 화면을 볼 수 없다

에이전트 시스템의 도구(tool)는 대부분 API 호출입니다. `web_search`, `read_file`, `run_bash` — 모두 텍스트를 주고받습니다. 하지만 데스크톱 앱을 조작하거나, 브라우저의 시각적 레이아웃을 이해하거나, GUI 기반 워크플로우를 자동화하려면 **화면을 보고 마우스와 키보드를 제어하는 능력**이 필요합니다.

Anthropic의 `computer_20251124`와 OpenAI의 `computer_use_preview`는 이 문제를 해결하기 위한 도구 스펙입니다. 하지만 두 프로바이더의 인터페이스가 다르고, 실제 OS 제어 로직은 직접 구현해야 합니다. GEODE에서는 **provider-agnostic한 실행 하네스**를 만들어 양쪽 모두에서 동일한 코드로 화면을 제어합니다.

## 2. 아키텍처: 3-Tier Computer-Use 스택

GEODE의 computer-use는 단일 레이어가 아닌 3개 계층으로 구성됩니다. 각 계층은 서로 다른 추상화 수준에서 동작합니다.

```
┌─────────────────────────────────────────────────────┐
│  Layer 1: ComputerUseHarness (pyautogui)            │
│  로컬 OS 전체 제어 — 데스크톱 앱, Finder, 시스템 설정  │
│  7 actions, 좌표 스케일링, 매 액션 후 screenshot 반환  │
├─────────────────────────────────────────────────────┤
│  Layer 2: Playwright MCP (browser_*)                │
│  브라우저 DOM 레벨 — 웹앱, 폼, 네비게이션              │
│  18 tools, ref 기반 셀렉터, 접근성 스냅샷              │
├─────────────────────────────────────────────────────┤
│  Layer 3: Playwriter (Chrome Extension)             │
│  인증된 브라우저 세션 — SPA, 로그인 필요 사이트         │
│  14+ utilities, CDP, 녹화, 디버깅                    │
└─────────────────────────────────────────────────────┘
```

> 왜 3개 계층인가? 단일 도구로 모든 시나리오를 커버할 수 없기 때문입니다. pyautogui는 OS 전체를 제어하지만 DOM 구조를 모릅니다. Playwright는 DOM을 정밀하게 제어하지만 데스크톱 앱에 접근할 수 없습니다. Playwriter는 로그인된 세션을 활용하지만 Chrome 확장이 필요합니다. 각 계층의 강점이 다른 계층의 약점을 보완합니다.

## 3. Layer 1 — ComputerUseHarness: 좌표 스케일링과 액션 루프

핵심 설계 결정은 **LLM 좌표 공간과 실제 스크린 해상도의 분리**입니다.

```python
# core/tools/computer_use.py
TARGET_WIDTH = 1280
TARGET_HEIGHT = 800

class ComputerUseHarness:
    def _scale_to_screen(self, x: int, y: int) -> tuple[int, int]:
        """Scale coordinates from LLM space (target) to screen space."""
        if not self._screen_width:
            self._get_screen_size()
        sx = int(x * self._screen_width / self._target_width)
        sy = int(y * self._screen_height / self._target_height)
        return sx, sy
```

> LLM은 항상 1280x800 해상도의 스크린샷을 봅니다. 실제 디스플레이가 2560x1600(Retina)이든 1920x1080이든, LLM이 `(640, 400)`을 클릭하면 하네스가 실제 화면의 정중앙으로 변환합니다. 이 분리가 없으면 LLM이 디스플레이 해상도를 알아야 하고, 해상도가 바뀔 때마다 프롬프트를 수정해야 합니다.

스크린샷은 JPEG 75% 품질로 압축하여 토큰 비용을 절감합니다:

```python
# core/tools/computer_use.py
def screenshot(self) -> str:
    pag = self._ensure_pyautogui()
    from PIL import Image

    img = pag.screenshot()
    self._screen_width, self._screen_height = img.size

    img = img.resize(
        (self._target_width, self._target_height),
        Image.LANCZOS,
    )

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=self._jpeg_quality)
    return base64.b64encode(buf.getvalue()).decode("ascii")
```

> Anthropic 데모에서도 동일한 1280x800 타겟을 사용합니다. PNG 대신 JPEG를 선택한 이유는 토큰 비용입니다. 스크린샷 1장이 약 800 토큰인데, PNG는 2-3배 더 큽니다. 75% 품질에서 텍스트 가독성은 충분히 유지됩니다.

**7개 액션**은 모두 동일한 패턴을 따릅니다: 좌표 변환 → OS 명령 실행 → 스크린샷 반환.

```python
# core/tools/computer_use.py
def click(self, x: int, y: int, button: str = "left", click_count: int = 1) -> str:
    pag = self._ensure_pyautogui()
    sx, sy = self._scale_to_screen(x, y)
    pag.click(sx, sy, clicks=click_count, button=button)
    return self.screenshot()  # 매 액션 후 화면 상태 반환

def type_text(self, text: str) -> str:
    pag = self._ensure_pyautogui()
    chunk_size = 50
    for i in range(0, len(text), chunk_size):
        pag.typewrite(text[i : i + chunk_size], interval=0.012)
    return self.screenshot()
```

> 모든 액션이 `screenshot()`을 반환하는 것이 핵심입니다. LLM의 observe-act-observe 루프를 강제합니다. 클릭 후 화면이 어떻게 변했는지 확인하지 않으면, 다음 액션의 좌표가 틀릴 수 있습니다. 이 패턴은 Anthropic의 computer-use 가이드라인과 일치합니다.

`type_text`에서 50자 청크로 나누는 이유는 pyautogui의 버퍼 제한입니다. 긴 텍스트를 한 번에 보내면 일부가 누락될 수 있습니다.

## 4. Provider 통합: Anthropic과 OpenAI의 서로 다른 인터페이스

Anthropic과 OpenAI는 computer-use 도구의 스펙이 다릅니다.

| 항목 | Anthropic | OpenAI |
|------|-----------|--------|
| 도구 타입 | `computer_20251124` | `computer_use_preview` |
| 좌표 형식 | `coordinate: [x, y]` | `x: int, y: int` |
| 스크린샷 반환 | `tool_result` + `image` content block | `computer_call_output` + `image_url` |
| 액션 이름 | `mouse_move`, `left_click`, `type` | `click`, `type`, `scroll` |

GEODE는 양쪽 프로바이더에서 동일한 `ComputerUseHarness`를 호출합니다:

```python
# core/llm/providers/anthropic.py
if is_computer_use_enabled() and "computer" not in existing_names:
    # Anthropic computer-use tool 자동 주입
    tools.append({
        "type": "computer_20251124",
        "name": "computer",
        "display_width_px": TARGET_WIDTH,
        "display_height_px": TARGET_HEIGHT,
    })
```

```python
# core/llm/providers/openai.py
OPENAI_COMPUTER_USE_TOOL = {
    "type": "computer_use_preview",
    "display_width": TARGET_WIDTH,
    "display_height": TARGET_HEIGHT,
    "environment": "mac",
}
```

> 두 프로바이더 모두 동일한 `TARGET_WIDTH`, `TARGET_HEIGHT`를 사용합니다. 하네스의 좌표 스케일링이 프로바이더 독립적이므로, LLM이 Anthropic이든 OpenAI든 같은 좌표 체계로 동작합니다. 이것이 "provider-agnostic"의 핵심입니다.

tool_handler에서의 라우팅:

```python
# core/cli/tool_handlers.py
def _build_computer_use_handler() -> dict[str, Any]:
    from core.tools.computer_use import ComputerUseHarness

    harness = ComputerUseHarness()

    def handle(**kwargs) -> str:
        action = kwargs.get("action", "screenshot")
        if action == "screenshot":
            return harness.screenshot()
        elif action == "click":
            return harness.click(kwargs["x"], kwargs["y"])
        elif action == "type":
            return harness.type_text(kwargs["text"])
        elif action == "key":
            return harness.key(kwargs["keys"])
        elif action == "scroll":
            return harness.scroll(kwargs["x"], kwargs["y"], kwargs.get("direction", "down"))
        # ...
    return {"computer": handle}
```

> 핸들러는 단순한 디스패처입니다. 프로바이더별 파라미터 변환은 각 provider 모듈에서 처리하고, 핸들러는 정규화된 파라미터만 받습니다. 이 분리 덕분에 새 프로바이더(예: Google Gemini)가 computer-use를 지원해도 하네스 코드는 변경 없이 핸들러만 추가하면 됩니다.

## 5. 안전 장치: FAILSAFE, Opt-in, Accessibility 권한

로컬 OS를 제어하는 도구는 위험합니다. 3중 안전 장치를 적용합니다.

**1. Opt-in 활성화**: 기본값은 `False`입니다. 명시적으로 환경변수를 설정해야 합니다.

```python
# core/config.py
computer_use_enabled: bool = False  # set GEODE_COMPUTER_USE_ENABLED=true
```

**2. pyautogui FAILSAFE**: 마우스를 화면 코너로 이동하면 즉시 중단됩니다.

```python
# core/tools/computer_use.py
pyautogui.FAILSAFE = True   # 코너 이동 → FailSafeException
pyautogui.PAUSE = 0.05      # 액션 간 50ms 딜레이
```

**3. Safety Constants**: `computer` 도구는 safety_constants에 등록되어 있어, 실행 전 사용자 확인이 필요합니다.

```python
# core/agent/safety_constants.py
SAFETY_TOOLS = {
    "computer",  # computer-use: screen control
    # ...
}
```

> 3중 장치의 설계 의도: (1) 환경변수로 "이 머신에서 computer-use를 허용한다"는 의사 표시, (2) pyautogui FAILSAFE로 "실행 중 긴급 중단" 가능, (3) safety_constants로 "매 호출마다 사용자 확인". 하나만으로는 부족합니다 — 환경변수만 있으면 실행 중 제어가 불가능하고, FAILSAFE만 있으면 의도하지 않은 활성화를 막을 수 없습니다.

## 6. 실전 시나리오: VS Code 열고 블로그 작성하기

computer-use의 실제 동작 흐름입니다. "VS Code를 열고 블로그를 작성하라"는 요청을 처리하는 과정:

```
Round 1: LLM → screenshot()
         ← 현재 데스크톱 화면 (base64 JPEG)
         LLM: "VS Code가 보이지 않는다. 터미널을 열어야 한다."

Round 2: LLM → key("cmd+space")
         ← Spotlight 검색 화면
         LLM: "Spotlight이 열렸다. 'Visual Studio Code'를 입력한다."

Round 3: LLM → type_text("Visual Studio Code")
         ← Spotlight에 VS Code가 검색된 화면
         LLM: "VS Code가 검색 결과에 보인다. Enter를 누른다."

Round 4: LLM → key("enter")
         ← VS Code가 열리는 화면
         LLM: "VS Code가 열렸다. 파일 탐색기에서 blog 디렉토리를 찾는다."

Round 5~N: 파일 열기 → 내용 확인 → 새 파일 생성 → 텍스트 입력 → 저장
```

> 각 라운드가 observe(screenshot) → think(LLM 추론) → act(액션) → observe(screenshot) 사이클입니다. LLM이 "다음에 무엇을 해야 하는지"를 매번 스크린샷을 보고 판단합니다. 이것이 rule-based 자동화(Selenium 스크립트 등)와의 근본적 차이입니다 — 예상치 못한 팝업, 레이아웃 변경, 에러 다이얼로그에 적응할 수 있습니다.

하지만 실전에서는 **Layer 선택이 중요합니다**. 위 시나리오에서 VS Code를 여는 것은 `run_bash("open -a 'Visual Studio Code'")`가 더 효율적이고, 파일 작성은 `write_file()`이 더 정확합니다. computer-use(Layer 1)는 **다른 도구로 불가능한 GUI 조작**에 사용해야 합니다:

- 데스크톱 앱의 메뉴/버튼 클릭
- 시스템 설정 변경
- 드래그 앤 드롭 작업
- 시각적 확인이 필요한 검증

## 7. 정리

| 항목 | 설명 |
|------|------|
| 하네스 클래스 | `ComputerUseHarness` (323줄) |
| 액션 수 | 7개 (screenshot, click, double_click, type, key, scroll, drag) |
| 좌표 공간 | LLM: 1280x800 → 실제 해상도 자동 스케일링 |
| 스크린샷 | JPEG 75%, base64, ~800 토큰/장 |
| Provider 지원 | Anthropic `computer_20251124`, OpenAI `computer_use_preview` |
| 안전 장치 | 3중: env opt-in + pyautogui FAILSAFE + safety_constants |
| 활성화 | `GEODE_COMPUTER_USE_ENABLED=true` + `uv pip install pyautogui` |
| 3-Tier 스택 | pyautogui (OS) + Playwright (DOM) + Playwriter (Chrome) |

| Layer | 적합한 시나리오 | 부적합한 시나리오 |
|-------|----------------|------------------|
| Layer 1 (pyautogui) | 데스크톱 앱, 시스템 설정, GUI 자동화 | 웹 DOM 조작, 대량 텍스트 입력 |
| Layer 2 (Playwright) | 웹앱 테스트, 폼 입력, 네비게이션 | 데스크톱 앱, 로그인 필요 사이트 |
| Layer 3 (Playwriter) | SPA, 로그인 세션, 디버깅, 녹화 | 비-Chrome 브라우저, 데스크톱 앱 |

**설계 교훈**: computer-use는 "만능 도구"가 아닙니다. 스크린샷 1장에 ~800 토큰, 한 시나리오에 10-20 라운드면 8,000-16,000 토큰이 스크린샷만으로 소비됩니다. **텍스트 기반 도구로 해결 가능한 작업은 텍스트 도구를 쓰고, GUI 조작이 불가피한 경우에만 computer-use를 사용하는 것**이 비용과 정확도 모두에서 최적입니다.

---

*Source: `blog/posts/architecture/76-provider-agnostic-computer-use-harness.md` | Category: [[blog-architecture]]*

## Related

- [[blog-architecture]]
- [[blog-hub]]
- [[geode]]
- [[geode-architecture]]
- [[geode-computer-use]]
- [[geode-llm-models]]
