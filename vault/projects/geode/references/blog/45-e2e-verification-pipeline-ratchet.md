---
title: "E2E Verification Pipeline — '빌드 성공'과 '실제 동작' 사이의 간극"
type: reference
category: blog-post
tags: [blog, safety-verification]
source: "blog/posts/safety-verification/45-e2e-verification-pipeline-ratchet.md"
created: 2026-04-08T00:00:00Z
---

# E2E Verification Pipeline — "빌드 성공"과 "실제 동작" 사이의 간극

> Build succeeded. Tests passed. App crashes on startup.

마이그레이션 파이프라인의 validate_node가 green을 보고한 지 30초 후, Spring Boot 애플리케이션이 `BeanCreationException`으로 사망했습니다. **컴파일과 런타임 사이에는 심연이 있습니다.**

이 간극은 Spring 생태계에서 특히 치명적입니다. Java의 정적 타입 시스템은 컴파일 타임에 많은 오류를 잡아주지만, Spring Framework의 핵심 메커니즘인 bean wiring, auto-configuration, component scanning, property resolution은 모두 런타임에 수행됩니다. 즉, 컴파일러가 보증하는 범위와 애플리케이션이 실제로 동작하기 위해 필요한 조건 사이에 구조적인 사각지대가 존재하며, 마이그레이션은 이 사각지대에서 발생하는 오류를 집중적으로 유발합니다.

---

## Context: 검증의 세 단계와 빠진 마지막 단계

REODE의 마이그레이션 파이프라인은 6-node DAG로 구성됩니다:

```
START -> assess -> plan -> transform -> validate -> measure -> END
                                  ^                    |
                                  |   (conditional)    |
                                  +---- fix_node <-----+
```

`validate_node`는 두 가지를 검증합니다:
1. **Build 검증**: `mvn compile` 성공 여부
2. **Test 검증**: `mvn test` 통과율

이 두 가지가 모두 통과하면 `measure_node`로 진행하고, 파이프라인은 성공으로 종료됩니다.

하지만 실제 운영에서 마주한 실패 사례들이 있습니다:

- `mvn compile` 성공 + `mvn test` 100% 통과, 하지만 `spring-boot:run` 시 `NoSuchBeanDefinitionException` — XML 설정 파일에서 bean 참조가 변경된 클래스를 가리키고 있었습니다
- 빌드/테스트 성공, 하지만 `application.properties`의 `server.port`가 이미 사용 중인 포트와 충돌했습니다
- 빌드/테스트 성공, 하지만 `DataSource` 설정이 마이그레이션 과정에서 제거되어 DB 연결에 실패했습니다

**컴파일 타임 검증과 테스트 검증만으로는 "이 애플리케이션이 실제로 동작한다"를 보장할 수 없습니다.** 특히 Spring 생태계에서는 bean wiring, auto-configuration, property resolution이 모두 런타임에 발생합니다.

---

## Trade-offs: 세 가지 검증 전략

### Strategy A: Playwright 풀 브라우저 테스트 (과잉)

Playwright로 브라우저를 띄우고 로그인 -> 메인 페이지 -> CRUD 작업을 자동화하는 방식입니다.

**기각 이유**:
- 마이그레이션 검증에 비즈니스 로직 테스트는 과잉입니다. "앱이 뜨는가?"가 핵심이지, "게시판 글쓰기가 되는가?"는 범위 밖입니다.
- 테스트 스크립트가 프로젝트마다 다릅니다. 범용 마이그레이션 도구에 프로젝트별 Playwright 시나리오를 요구할 수 없습니다.
- Node.js + Playwright 의존성이 추가됩니다. 순수 Java 프로젝트에 JavaScript 런타임을 요구하는 것은 부담입니다.

### Strategy B: HTTP smoke test (채택)

`curl` 수준의 endpoint check입니다. 앱을 실행하고, HTTP 요청을 보내고, 5xx가 아닌 응답이 오면 성공입니다.

**장점**:
- 의존성 없음 (Python 표준 라이브러리의 `urllib` 사용)
- 프로젝트 독립적 — 어떤 웹 애플리케이션이든 적용 가능합니다
- "앱이 뜨는가?" 질문에 정확히 답합니다

### Strategy C: Hybrid — HTTP smoke + Playwright (구현)

HTTP smoke test를 기본으로 하되, Playwright가 설치되어 있으면 활용 가능하도록 확장점을 열어두는 방식입니다. 실제로 구현한 접근입니다.

---

## Implementation: `JavaAppStartTool`

앱 실행과 health check를 담당하는 tool입니다. `core/tools/app_runner.py`에 구현되어 있습니다.

```python
class JavaAppStartTool:
    """Start a Java web application (Spring Boot, WAR, etc.)."""

    def execute(self, **kwargs: Any) -> dict[str, Any]:
        project_path = kwargs["project_path"]
        port = kwargs.get("port", 8080)
        timeout = kwargs.get("timeout", 60)

        pom = Path(project_path) / "pom.xml"
        if not pom.exists():
            return {"error": "pom.xml not found"}

        # Check if spring-boot-maven-plugin exists
        pom_content = pom.read_text(encoding="utf-8")
        is_boot = "spring-boot-maven-plugin" in pom_content

        if is_boot:
            cmd = ["mvn", "spring-boot:run", f"-Dserver.port={port}"]
        else:
            # WAR/standalone -- package first, then find jar
            build_cmd = ["mvn", "package", "-DskipTests", "-q"]
            subprocess.run(build_cmd, cwd=project_path, timeout=120, capture_output=True)
            target = Path(project_path) / "target"
            jars = list(target.glob("*.jar")) + list(target.glob("*.war"))
            if jars:
                cmd = ["java", "-jar", str(jars[0]), f"--server.port={port}"]
            else:
                return {"error": "No runnable artifact found in target/"}
```

설계 결정 포인트:

1. **Spring Boot 자동 감지**: pom.xml에서 `spring-boot-maven-plugin` 존재 여부로 실행 방식을 결정합니다. Boot 프로젝트는 `mvn spring-boot:run`, 일반 WAR/JAR은 `java -jar`로 실행합니다.

2. **포트 주입**: `-Dserver.port={port}`로 포트를 외부에서 제어합니다. 기본 포트(8080)가 이미 사용 중인 환경에서의 충돌을 방지합니다.

3. **Background process + health check loop**:

```python
        proc = subprocess.Popen(cmd, cwd=project_path,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        _running_processes[project_path] = proc

        # Health check loop
        health_url = f"http://localhost:{port}/"
        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                resp = urllib.request.urlopen(health_url, timeout=2)
                if resp.status < 500:
                    return {"result": {
                        "success": True, "pid": proc.pid, "port": port,
                        "startup_seconds": round(time.time() - start_time, 1),
                    }}
            except urllib.error.HTTPError as he:
                # 4xx means app is running (auth required, etc.)
                if he.code < 500:
                    return {"result": {"success": True, ...}}
            except (urllib.error.URLError, OSError):
                pass

            # Check if process died
            if proc.poll() is not None:
                stderr = proc.stderr.read().decode("utf-8", errors="replace")[-500:]
                return {"error": f"App exited with code {proc.returncode}: {stderr}"}

            time.sleep(2)
```

**401/403 처리가 핵심입니다.** Spring Security가 활성화된 프로젝트에서 `/` 요청은 401(Unauthorized) 또는 403(Forbidden)을 반환합니다. 이것은 "앱이 정상 동작하고 있으나 인증이 필요하다"는 의미입니다. 5xx만 실패로 간주하고, 4xx는 성공으로 처리합니다.

**프로세스 사망 감지**: health check 대기 중에 `proc.poll()`로 프로세스 종료를 감지합니다. `BeanCreationException` 같은 startup 실패는 프로세스가 비정상 종료하므로, stderr에서 마지막 500자를 읽어 오류 원인을 보고합니다.

---

## Implementation: `E2ESmokeTestTool`

앱이 실행된 후 endpoint별 smoke test를 수행합니다:

```python
class E2ESmokeTestTool:
    def execute(self, **kwargs: Any) -> dict[str, Any]:
        base_url = kwargs.get("base_url", "http://localhost:8080")
        endpoints = kwargs.get("endpoints", ["/"])

        results: list[dict[str, Any]] = []
        passed = 0; failed = 0

        for endpoint in endpoints:
            url = f"{base_url}{endpoint}"
            try:
                resp = urllib.request.urlopen(url, timeout=10)
                status = resp.status
                ok = status < 400
                results.append({"endpoint": endpoint, "status": status, "passed": ok})
                ...
            except urllib.error.HTTPError as e:
                # 401/403 = app is running but needs auth -- count as "running"
                running = e.code in (401, 403)
                results.append({"endpoint": endpoint, "status": e.code, "passed": running})
                ...

        # Optionally detect Playwright availability
        playwright_result = None
        try:
            check = subprocess.run(
                ["npx", "playwright", "--version"],
                capture_output=True, timeout=10,
            )
            if check.returncode == 0:
                playwright_result = "playwright available but no test scripts configured"
        except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
            pass

        return {"result": {
            "total": len(results), "passed": passed, "failed": failed,
            "pass_rate": (passed / len(results) * 100) if results else 0,
            "endpoints": results,
            "playwright": playwright_result,
        }}
```

Playwright 감지는 의도적으로 "감지만 하고 실행하지 않는" 설계입니다. Playwright가 설치되어 있다는 정보를 보고하되, 실행은 사용자가 별도로 설정해야 합니다. 범용 도구에서 프로젝트별 브라우저 테스트를 자동 실행하는 것은 예측 불가능한 부작용을 초래합니다.

---

## measure_node의 multi-perspective verification

E2E tool 외에도 `measure_node`에서 수행하는 추가 검증이 있습니다:

```python
# core/pipelines/migration.py — measure_node 내부

# G-8/G-10: Multi-perspective verification + deployment readiness
if source_path and not dry_run:
    integrity = _verify_integrity(source_path, state)
    deployment = _verify_deployment_readiness(source_path)
    state_updates["verification_results"] = {
        "integrity": integrity,
        "deployment": deployment,
        "all_passed": integrity["passed"] and deployment["passed"],
    }
```

`_verify_integrity()`는 테스트 무결성을 검증합니다:
- `@Disabled`/`@Ignore` annotation이 추가되지 않았는지 (테스트 삭제 방지)
- 최종 빌드가 여전히 성공하는지
- 테스트 통과율이 baseline 대비 50% 이상인지

`_verify_deployment_readiness()`는 배포 준비 상태를 검증합니다:
- 소스 코드에 하드코딩된 비밀번호/API 키가 없는지
- 절대 경로(`/Users/`, `/home/`)가 포함되지 않았는지
- README 파일이 존재하는지

이 검증들은 **LLM 없이** 순수하게 grep과 파일 시스템 검사로 수행됩니다. LLM에게 "비밀번호가 하드코딩되어 있는지 확인해줘"라고 요청하는 것보다, `grep -rn "password=" src/`를 실행하는 것이 정확하고 비용이 0입니다.

---

## Decision Rationale

HTTP smoke test를 선택한 핵심 근거는 **검증 목표의 명확한 정의**에 있습니다.

마이그레이션 파이프라인의 E2E 검증 목표는 "이 애플리케이션이 마이그레이션 후에도 시작되는가?"입니다. 비즈니스 로직의 정확성 검증은 목표가 아닙니다. 목표를 명확히 하면 도구의 복잡도가 자연스럽게 결정됩니다:

- "시작되는가?" -> HTTP health check (선택)
- "정확히 동작하는가?" -> 통합 테스트 (프로젝트의 기존 테스트가 담당)
- "사용자 시나리오가 동작하는가?" -> Playwright (범위 밖)

검증 파이프라인은 ratchet(역진 방지 장치)처럼 작동해야 합니다. 한 번 통과한 검증은 이후 단계에서 깨져서는 안 됩니다. `validate_node`의 build + test 검증, `measure_node`의 integrity + deployment 검증, 그리고 E2E smoke test가 세 겹의 ratchet을 형성합니다.

이 ratchet 모델 — validate(구문 정합성) -> measure(무결성 + 배포 준비) -> E2E(런타임 동작) — 은 defense-in-depth(심층 방어) 전략의 구현입니다. 각 단계는 이전 단계가 잡지 못하는 결함 클래스를 타겟팅합니다. validate는 컴파일 오류를 잡고, measure는 테스트 삭제나 비밀번호 노출 같은 "빌드는 되지만 배포하면 안 되는" 문제를 잡고, E2E는 "배포할 수는 있지만 실행되지 않는" 문제를 잡습니다. 어느 한 단계만으로는 불충분하지만, 세 단계를 직렬로 연결하면 결함이 최종 결과물에 도달할 확률이 기하급수적으로 줄어듭니다. 이것은 Swiss Cheese Model과 동일한 원리입니다 — 개별 방어층에는 구멍이 있지만, 여러 층을 겹치면 모든 구멍이 동시에 정렬될 확률은 극히 낮아집니다.

---

## What's Next

현재 `JavaAppStartTool`은 Spring Boot에 최적화되어 있습니다. 향후 확장 계획:

- **Gradle 지원**: `spring-boot-maven-plugin` 외에 `bootRun` task 감지를 추가합니다. Maven 전용이라는 현재의 제약은 Gradle 기반 프로젝트(특히 최신 Spring Boot 프로젝트에서 점유율이 높은)를 마이그레이션 대상에서 제외시키므로, 적용 범위 확장을 위해 우선순위가 높습니다.
- **Docker Compose 환경**: 앱이 DB, Redis 등 외부 서비스에 의존할 때 `docker-compose up` 자동 실행을 지원합니다. 현실의 Spring 애플리케이션은 대부분 외부 서비스에 의존하므로, 이것 없이는 E2E smoke test가 `DataSource` 연결 실패로 false negative를 보고하게 됩니다.
- **Startup log 분석**: stderr의 마지막 500자 대신, Spring의 startup log에서 `Started Application in X seconds` 패턴을 감지하여 정확한 startup 완료 시점을 판단합니다. 현재의 HTTP polling 방식은 앱이 완전히 기동하기 전에 요청을 보내 불필요한 재시도가 발생할 수 있습니다.
- **Port conflict 자동 해소**: 8080이 사용 중이면 8081, 8082로 자동 시도합니다. CI 환경에서 여러 파이프라인이 동시에 실행될 때 포트 충돌은 가장 흔한 false failure 원인입니다.

"빌드 성공"은 "동작함"의 필요조건이지 충분조건이 아닙니다. 그 간극을 메우는 것이 E2E verification의 존재 이유입니다. 비용은 HTTP 요청 몇 개, 효과는 "startup crash" 오류 클래스의 완전 제거입니다.

---

*Source: `blog/posts/safety-verification/45-e2e-verification-pipeline-ratchet.md` | Category: [[blog-safety]]*

## Related

- [[blog-safety]]
- [[blog-hub]]
- [[geode]]
