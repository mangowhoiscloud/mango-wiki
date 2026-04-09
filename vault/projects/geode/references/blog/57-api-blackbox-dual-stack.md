---
title: "API Blackbox Testing — Dual-Stack 응답 비교로 마이그레이션 동치성을 증명하다"
type: reference
category: blog-post
tags: [blog, reode]
source: "blog/posts/reode/57-api-blackbox-dual-stack.md"
created: 2026-04-08T00:00:00Z
---

# API Blackbox Testing — Dual-Stack 응답 비교로 마이그레이션 동치성을 증명하다

> Java 8에서 22로 올렸습니다. 빌드 성공, 테스트 통과.
> 그런데 `/api/users`가 `[]`을 반환합니다. 이전에는 `[{"id":1, "name":"Alice"}]`였는데.
>
> 코드를 바꾸면 행동도 바뀝니다.
> 빌드와 단위 테스트만으로는 이 변화를 잡을 수 없습니다.
> 이 글은 REODE가 **마이그레이션 전후의 HTTP 응답을 1:1 비교**하여
> 행동적 동치성(behavioral equivalence)을 자동 검증하는 방법을 기록합니다.

---

## 1. 문제: 빌드 성공 != 동작 보존

마이그레이션의 목표는 "같은 기능이 새 환경에서 돌아가는 것"입니다. 이것을 어떻게 증명할까요?

**빌드 성공**은 문법이 맞다는 것이고, **단위 테스트 통과**는 개별 함수가 동작한다는 것입니다. 하지만 API 레벨에서 응답이 달라지는 것은 둘 다 잡지 못합니다.

실제 사례:
- Spring Boot 2 → 3 전환 후 `@RequestMapping` 기본 매핑 변경 → 404
- Jackson 버전 업그레이드 후 날짜 직렬화 형식 변경 → JSON body 불일치
- `javax.servlet` → `jakarta.servlet` 전환 후 필터 순서 변경 → 헤더 누락

이 문제를 해결하려면 **실행 중인 서버의 HTTP 응답을 직접 비교**해야 합니다.

---

## 2. 설계: Dual-Stack 비교 아키텍처

핵심 아이디어는 단순합니다. **이전 버전과 새 버전을 동시에 띄우고, 같은 요청을 보내서 응답을 비교합니다.**

```
                  ┌─────────────────────┐
                  │  discover_endpoints  │
                  │  Spring annotation   │
                  │  regex 스캔          │
                  └──────────┬──────────┘
                             │ endpoint 목록
                             ▼
┌───────────────┐    ┌──────────────┐    ┌───────────────┐
│  Old Version  │    │              │    │  New Version  │
│  Docker :8081 │◄───│  run_compare │───►│  Docker :8082 │
│  (Java 8)     │    │  GET × N     │    │  (Java 22)    │
└───────────────┘    └──────┬───────┘    └───────────────┘
                            │
                            ▼
                   ┌────────────────┐
                   │ status 비교     │
                   │ body 비교       │
                   │ (JSON 정규화)   │
                   └────────┬───────┘
                            │
                            ▼
                   equivalence_rate: 87%
                   breaking: 2건
```

> 이 아키텍처를 "Dual-Stack"이라 부르는 이유는 두 개의 독립적인 애플리케이션 스택이
> 동시에 실행되기 때문입니다. A/B 테스트와 개념적으로 유사하지만,
> 목적이 "어느 것이 더 좋은가"가 아니라 "둘이 같은가"라는 점이 다릅니다.

4단계 파이프라인으로 구성됩니다.

| 단계 | 함수 | 역할 |
|------|------|------|
| **1. Discover** | `discover_endpoints()` | Spring annotation 정적 분석 → GET 엔드포인트 목록 |
| **2. Deploy** | `deploy_dual_stack()` | Docker 컨테이너 2개 기동 + health check |
| **3. Compare** | `run_comparison()` | 동일 요청 전송 → status + body 비교 |
| **4. Teardown** | `teardown_dual_stack()` | 컨테이너 정리 |

---

## 3. Endpoint Discovery — Spring Annotation 정적 분석

첫 번째 문제는 "어떤 API를 테스트할 것인가"입니다. OpenAPI 스펙이 있으면 좋겠지만, 레거시 프로젝트에는 없는 경우가 대부분입니다.

REODE는 **소스 코드의 Spring annotation을 regex로 스캔**합니다.

```python
# core/tools/api_blackbox.py
_GET_MAPPING = re.compile(
    r'@GetMapping\s*\(\s*(?:value\s*=\s*)?["\']([^"\']+)["\']',
)

_REQUEST_MAPPING_GET = re.compile(
    r"@RequestMapping\s*\([^)]*"
    r'(?:value\s*=\s*)?["\']([^"\']+)["\']'
    r"[^)]*method\s*=\s*(?:RequestMethod\.)?GET",
)
```

> 왜 AST 파싱이 아닌 regex인가? 두 가지 이유입니다.
> (1) Java AST 파서(JavaParser 등)는 외부 의존성이 필요합니다.
> Phase 0의 CAN NOT 제약은 "외부 의존성 0개"입니다.
> (2) Spring annotation 패턴은 정형화되어 있어 regex로 충분합니다.
> `@GetMapping`, `@RequestMapping(method=GET)` 두 패턴만 잡으면 대부분의 GET 엔드포인트를 커버합니다.

클래스 레벨 `@RequestMapping` prefix도 처리합니다.

```java
@RestController
@RequestMapping("/api/orders")      // 클래스 레벨 prefix
public class OrderController {
    @GetMapping("/list")             // 메서드 레벨 path
    public List<Order> list() { ... }
}
// → /api/orders/list
```

```python
# core/tools/api_blackbox.py — discover_endpoints()
for rm_match in _CLASS_REQUEST_MAPPING.finditer(content):
    start = rm_match.start()
    paren_end = content.find(")", start)
    annotation_text = content[start : paren_end + 1]
    # method= 가 있으면 메서드 레벨 매핑이므로 prefix가 아님
    if "method" not in annotation_text.lower():
        class_prefix = rm_match.group(1).rstrip("/")
        break
```

> `method=` 존재 여부로 클래스 레벨과 메서드 레벨을 구분하는 것이 핵심입니다.
> `@RequestMapping(value="/api", method=GET)`은 메서드 레벨 매핑이지,
> 클래스 prefix가 아닙니다.

---

## 4. Dual-Stack Deploy — Docker 격리

발견된 엔드포인트를 테스트하려면 두 버전의 애플리케이션이 실행되어야 합니다. Docker 컨테이너로 격리합니다.

```python
# core/tools/api_blackbox.py — deploy_dual_stack()
def deploy_dual_stack(
    old_path: str | Path, new_path: str | Path,
    old_jdk: int, new_jdk: int,
    *, old_port: int = 8081, new_port: int = 8082,
) -> tuple[str, str]:
    teardown_dual_stack()  # 잔존 컨테이너 정리

    _start_container(name="reode-old", image=old_image,
                     project_path=str(old_path), host_port=old_port)
    _start_container(name="reode-new", image=new_image,
                     project_path=str(new_path), host_port=new_port)

    _wait_for_health(f"http://localhost:{old_port}", label="old")
    _wait_for_health(f"http://localhost:{new_port}", label="new")

    return f"http://localhost:{old_port}", f"http://localhost:{new_port}"
```

컨테이너 보안 제약:

| 제약 | 이유 |
|------|------|
| `--memory=1g` | Spring Boot 앱의 힙 제한 |
| `--privileged` 금지 | 호스트 커널 접근 차단 |
| `--network=host` 금지 | 포트 충돌 방지 |
| `-v /:/` 금지 | 호스트 파일시스템 전체 노출 차단 |

> 이 제약들은 CAN NOT 목록에 명시되어 있습니다.
> 마이그레이션 검증 도구가 호스트 시스템을 위험에 노출시켜서는 안 됩니다.

Health check는 HTTP 응답 코드 < 500이면 통과입니다.

```python
# core/tools/api_blackbox.py — _wait_for_health()
while time.time() - start < timeout_s:
    try:
        resp = urllib.request.urlopen(f"{base_url}/", timeout=5)
        if resp.status < 500:
            return
    except urllib.error.HTTPError as he:
        if he.code < 500:  # 4xx = 앱은 실행 중 (인증 등)
            return
    time.sleep(3)
```

> 404를 "실패"로 처리하지 않는 이유: Spring Boot의 루트 경로(`/`)가
> 매핑되지 않으면 404를 반환합니다. 하지만 이것은 앱이 정상 기동했다는 증거입니다.
> 진짜 문제는 5xx(서버 에러)이거나 연결 자체가 안 되는 경우입니다.

---

## 5. Response Comparison — 상태 코드 + JSON 정규화

핵심 비교 로직은 두 가지를 검사합니다: **HTTP 상태 코드**와 **응답 body**.

```python
# core/tools/api_blackbox.py — run_comparison() (핵심 루프)
for ep in endpoints:
    if time.time() - start_time > timeout_s:
        timed_out = True
        break

    old_status, old_body = _http_get(f"{old_url}{ep['path']}")
    new_status, new_body = _http_get(f"{new_url}{ep['path']}")

    # 1. 상태 코드 비교
    if old_status != new_status:
        breaking.append({"path": ep["path"], "type": "status",
                         "old": str(old_status), "new": str(new_status)})
        continue

    # 2. Body 비교 (JSON 정규화)
    old_norm = _normalize_body(old_body)
    new_norm = _normalize_body(new_body)
    if old_norm == new_norm:
        equivalent += 1
    else:
        breaking.append({"path": ep["path"], "type": "body",
                         "old": old_norm[:200], "new": new_norm[:200]})
```

JSON 정규화는 키 순서를 무시합니다.

```python
# core/tools/api_blackbox.py
def _normalize_body(body: str) -> str:
    try:
        parsed = json.loads(body)
        return json.dumps(parsed, sort_keys=True, ensure_ascii=False)
    except (json.JSONDecodeError, ValueError):
        return body.strip()
```

> `sort_keys=True`가 핵심입니다. 이전 버전이 `{"name":"Alice","id":1}`을 반환하고
> 새 버전이 `{"id":1,"name":"Alice"}`를 반환하면, 의미적으로 동일합니다.
> JSON 직렬화 순서는 구현 세부사항이지 API 계약이 아닙니다.

결과 구조:

```python
{
    "total": 15,          # 테스트한 엔드포인트 수
    "equivalent": 12,     # 동치 판정
    "breaking": [         # 불일치 목록
        {"path": "/api/users", "type": "status", "old": "200", "new": "500"},
        {"path": "/api/orders", "type": "body", "old": "...", "new": "..."},
    ],
    "errors": [],         # 요청 실패 (connection refused 등)
    "equivalence_rate": 80.0,
    "timed_out": False,
}
```

---

## 6. 5분 Timebox — 예측 가능한 검증 시간

API blackbox testing에 무제한 시간을 투자할 수 없습니다. 5분 하드 타임박스가 적용됩니다.

```python
API_TEST_TIMEOUT_S = 300  # 5분

for ep in endpoints:
    if time.time() - start_time > timeout_s:
        timed_out = True
        break
    # ... 비교 로직
```

> 5분은 Karpathy autoresearch의 "고정 시간 예산(fixed time budget)" 원칙에서 가져온 값입니다.
> 검증은 코드 변환보다 빠르게 완료되어야 합니다. 5분 안에 테스트하지 못한 엔드포인트는
> 결과에 `"timed_out": true`로 표시되어, 사용자가 판단할 수 있습니다.

---

## 7. CAN NOT 제약 — 결과 조작 방지

이 모듈의 가장 독특한 설계는 **CAN NOT 제약** 목록입니다. Expert Panel(Kent Beck + Karpathy + Claude Code) v2 설계에서 도출되었습니다.

```python
# core/tools/api_blackbox.py (모듈 docstring)
# CAN NOT constraints:
# - CAN NOT add tolerance rules dynamically to classify diffs as tolerated
# - CAN NOT selectively exclude endpoints to inflate api_equivalence_rate
# - CAN NOT modify old container source code (immutable reference)
# - CAN NOT use --privileged, --network=host, or -v /:/ on Docker containers
# - CAN NOT let LLM judge pass/fail -- all logic is deterministic code
# - CAN NOT exceed 5-minute timebox
```

> 마이그레이션 결과의 신뢰성은 검증 도구의 조작 불가능성에 달려 있습니다.
> LLM이 "이 차이는 무시해도 됩니다"라고 판단하거나, 특정 엔드포인트를 제외하여
> 동치율을 올리는 것은 **자기기만**입니다.
>
> 모든 비교 로직이 결정적(deterministic) 코드라는 제약이
> 이 도구의 결과를 신뢰할 수 있게 만듭니다.

---

## 8. 파이프라인 통합 — validate_node에서 자동 실행

API blackbox testing은 독립 도구가 아니라, 마이그레이션 파이프라인의 `validate_node`에 통합됩니다.

```
ASSESS → PLAN → TRANSFORM → VALIDATE → FIX → MEASURE
                               │
                        ┌──────┴──────┐
                        │ build test  │
                        │ API blackbox│ ← 여기
                        └─────────────┘
```

`transform_node`가 소스 코드를 변환할 때 원본을 `source_path_backup`에 보존합니다. `validate_node`는 이 백업과 변환된 코드를 각각 Docker에 띄워 비교합니다.

결과는 state에 기록됩니다.

```python
# core/state.py — MigrationState 확장
class MigrationState(TypedDict, total=False):
    source_path_backup: str           # transform 전 원본 경로
    api_equivalence_rate: float       # 0.0 ~ 100.0
    api_breaking_changes: list[dict]  # breaking 목록
    api_test_summary: str             # LLM 소비용 요약
    api_test_ran: bool                # 실행 여부
```

`measure_node`의 Scorecard는 `api_equivalence_rate`를 포함합니다.

---

## 9. 테스트 전략 — Docker 없이 24개 테스트

Docker 의존성 없이 모든 로직을 테스트합니다. `unittest.mock`으로 HTTP 호출과 Docker 명령을 모킹합니다.

테스트 분류:

| 카테고리 | 테스트 수 | 대상 |
|---------|---------|------|
| Endpoint discovery | 4 | Spring annotation regex 파싱 |
| Response comparison | 5 | 상태 코드, JSON body, timebox, 에러 |
| Format summary | 4 | LLM 소비용 요약 포맷 |
| Teardown | 2 | 컨테이너 정리 + graceful failure |
| Path normalization | 4 | 클래스 prefix + 메서드 path 결합 |
| Body normalization | 3 | JSON sort_keys, 비-JSON 스트립 |
| Class-level mapping | 1 | `@RequestMapping("/api")` prefix 처리 |
| Legacy annotation | 1 | `@RequestMapping(method=GET)` 지원 |

```python
# tests/test_api_blackbox.py — JSON 필드 순서 무시 테스트
@patch("core.tools.api_blackbox._http_get")
def test_json_field_order_irrelevant(self, mock_get):
    old_body = json.dumps({"name": "Alice", "id": 1})  # name 먼저
    new_body = json.dumps({"id": 1, "name": "Alice"})  # id 먼저
    mock_get.side_effect = [(200, old_body), (200, new_body)]

    result = run_comparison("http://old:8081", "http://new:8082", endpoints)

    assert result["equivalent"] == 1  # 동치 판정
    assert result["breaking"] == []
```

> 이 테스트가 중요한 이유: Jackson/Gson 버전이 바뀌면 JSON 직렬화 순서가
> 달라질 수 있습니다. 필드 순서 차이를 "breaking change"로 잡으면 오탐(false positive)입니다.
> `sort_keys=True` 정규화가 이 문제를 해결합니다.

---

## 10. Phase 0 → Phase 1 로드맵

현재 Phase 0 제약:

| 제약 | 이유 | Phase 1 계획 |
|------|------|-------------|
| GET only | POST/PUT은 부작용(side effect)이 있음 | 멱등성 보장 전략 필요 |
| String 비교 | 타임스탬프, UUID 등 변동값 오탐 | Tolerance rule 도입 |
| 외부 의존성 0 | YAGNI — Phase 0에서는 불필요 | httpx, pytest-docker 고려 |
| LLM 판단 금지 | 결과 조작 방지 | 유지 (핵심 원칙) |

---

## 11. 마무리

### 핵심 정리

| 구성요소 | 역할 | 특징 |
|---------|------|------|
| `discover_endpoints()` | Spring annotation 정적 스캔 | 외부 파서 없이 regex |
| `deploy_dual_stack()` | Docker 2개 기동 + health check | `--memory=1g`, 보안 제약 |
| `run_comparison()` | HTTP GET 비교 + JSON 정규화 | 5분 timebox, sort_keys |
| `format_summary()` | ~300 토큰 LLM 요약 | Scorecard 연동 |
| CAN NOT 제약 | 결과 조작 방지 7개 규칙 | LLM 판단 금지 |

### 설계 체크리스트

- [x] 마이그레이션 전후 동치성을 HTTP 레벨에서 검증
- [x] 엔드포인트 자동 발견 (Spring annotation regex)
- [x] Docker 격리 + 보안 제약 (privileged/host 금지)
- [x] JSON 필드 순서 무시 (sort_keys 정규화)
- [x] 5분 하드 타임박스 (Karpathy 고정 예산)
- [x] CAN NOT 제약으로 결과 조작 원천 차단
- [x] Docker 없이 24개 단위 테스트 (mock 기반)
- [x] validate_node 파이프라인 통합 + Scorecard 연동

---

*Source: `blog/posts/reode/57-api-blackbox-dual-stack.md` | Category: [[blog-reode]]*

## Related

- [[blog-reode]]
- [[blog-hub]]
- [[geode]]
- [[geode-architecture]]
