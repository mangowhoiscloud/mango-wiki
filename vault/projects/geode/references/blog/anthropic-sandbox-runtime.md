---
title: "Anthropic sandbox-runtime 오픈소스 리서치"
type: reference
category: blog-post
tags: [blog, research]
source: "blog/research/anthropic-sandbox-runtime.md"
created: 2026-04-08T00:00:00Z
---

# Anthropic sandbox-runtime 오픈소스 리서치

> Date: 2026-03-29 | Repo: `anthropic-experimental/sandbox-runtime`
> Status: 리서치 완료 — Phase 3 Sandbox 설계 입력

---

## 0. 개요

Anthropic이 Claude Code의 OS 레벨 샌드박싱을 **별도 오픈소스**로 공개한 프로젝트. 컨테이너 없이 네이티브 OS 프리미티브(Seatbelt, bubblewrap, seccomp)로 파일시스템+네트워크 격리를 수행한다.

| 항목 | 내용 |
|------|------|
| Repo | [anthropic-experimental/sandbox-runtime](https://github.com/anthropic-experimental/sandbox-runtime) |
| License | Apache 2.0 |
| Version | 0.0.43 |
| Stars | 3,560 |
| 언어 | TypeScript (Node.js >= 18) |
| CLI | `srt` — `npm install -g @anthropic-ai/sandbox-runtime` |
| 마지막 업데이트 | 2026-03-28 |
| 의존성 | `zod`, `shell-quote`, `@pondwader/socks5-server`, `commander` |

---

## 1. 아키텍처

### 1.1 전체 구조

```
srt "bash -c 'curl example.com'"
       │
       ▼
┌─ SandboxManager ─────────────────────────────────┐
│                                                   │
│  getPlatform() → macOS / Linux                    │
│       │                                           │
│  ┌────┴────┐          ┌──────────────────┐        │
│  │ macOS   │          │ Linux            │        │
│  │ Seatbelt│          │ bubblewrap       │        │
│  │ .sbpl   │          │ + seccomp BPF    │        │
│  └─────────┘          │ + socat bridge   │        │
│                       └──────────────────┘        │
│                                                   │
│  ┌─────────────┐     ┌──────────────────┐         │
│  │ HTTP Proxy  │     │ SOCKS5 Proxy     │         │
│  │ :3128       │     │ :1080            │         │
│  │ domain      │     │ domain           │         │
│  │ filtering   │     │ filtering        │         │
│  └─────────────┘     └──────────────────┘         │
└───────────────────────────────────────────────────┘
```

### 1.2 파일 구성

```
src/
├── cli.ts                         # srt CLI 진입점
├── index.ts                       # SandboxManager export
├── utils/                         # 설정 로더, 플랫폼 감지
└── sandbox/
    ├── sandbox-manager.ts         # 메인 오케스트레이터 (싱글톤)
    ├── sandbox-config.ts          # Zod 스키마 (설정 검증)
    ├── sandbox-schemas.ts         # 내부 타입 (FsRead/Write/NetworkRestriction)
    ├── sandbox-utils.ts           # 공유 유틸 (경로 정규화, glob→regex)
    ├── sandbox-violation-store.ts # 위반 추적
    ├── macos-sandbox-utils.ts     # Seatbelt .sbpl 생성
    ├── linux-sandbox-utils.ts     # bubblewrap 인자 생성
    ├── http-proxy.ts              # HTTP/HTTPS 프록시 서버
    ├── socks-proxy.ts             # SOCKS5 프록시 서버
    ├── parent-proxy.ts            # 상위 프록시 체이닝
    └── generate-seccomp-filter.ts # seccomp BPF 필터 생성
vendor/
├── seccomp-src/                   # apply-seccomp C 소스
└── seccomp/                       # 사전 빌드된 BPF 바이너리
```

---

## 2. 플랫폼별 구현

### 2.1 macOS — Seatbelt (sandbox-exec)

**핵심 함수**: `wrapCommandWithSandboxMacOS(params: MacOSSandboxParams): string`

**커맨드 변환**:
```typescript
const wrappedCommand = shellquote.quote([
  'env', ...proxyEnvArgs,
  'sandbox-exec', '-p', profile,
  shell, '-c', command,
])
```

**프로필 생성** — `generateSandboxProfile()`:

```scheme
(version 1)
(deny default (with message "{logTag}"))

;; Process
(allow process-exec process-fork process-info* signal)
(allow mach-priv-task-port (target same-sandbox))

;; Mach IPC — 13개 Apple 서비스만 허용
(allow mach-lookup
  (global-name "com.apple.fonts")
  (global-name "com.apple.logd")
  (global-name "com.apple.securityd.xpc")
  ;; ... 10개 더
)

;; POSIX IPC (Python multiprocessing용)
(allow ipc-posix-shm ipc-posix-sem)

;; Sysctl — ~50개 화이트리스트
(allow sysctl-read (sysctl-name "hw.ncpu") ...)

;; 파일시스템 (레이어 방식)
(allow file-read*)
(deny file-read* (subpath "~/.ssh"))
(allow file-read* (subpath "~/.ssh/known_hosts"))  ;; allow-within-deny

;; 쓰기 (allow-only)
(allow file-write* (subpath "."))
(allow file-write* (subpath "/tmp"))
(deny file-write* (literal ".env"))

;; 네트워크
(deny network*)
(allow network* (local ip "*:3128"))   ;; HTTP proxy
(allow network* (local ip "*:1080"))   ;; SOCKS proxy
```

**우회 방지**:
- `generateMoveBlockingRules()` — `mv`/`rename` syscall로 deny 경로를 우회하는 것 차단
- `(allow file-read-metadata (vnode-type DIRECTORY))` — `realpath()`가 deny 영역을 순회할 수 있도록 메타데이터만 허용
- 로그 모니터링 — `log stream` 프로세스로 위반 실시간 감지

**강제 차단 파일** (`DANGEROUS_FILES`):
`.gitconfig`, `.gitmodules`, `.bashrc`, `.bash_profile`, `.zshrc`, `.zprofile`, `.profile`, `.ripgreprc`, `.mcp.json`, `.git/hooks`

### 2.2 Linux — bubblewrap + seccomp

**핵심 함수**: `wrapCommandWithSandboxLinux(params): Promise<string>` (비동기 — ripgrep 실행)

**bwrap 인자 구성 순서**:
```bash
bwrap \
  --new-session --die-with-parent \
  # 1. Seccomp (Unix socket 차단용 BPF 필터)
  # 2. Network namespace 격리
  --unshare-net \
  --bind /path/to/http.sock /path/to/http.sock \
  --bind /path/to/socks.sock /path/to/socks.sock \
  --setenv HTTP_PROXY http://localhost:3128 \
  --setenv HTTPS_PROXY http://localhost:3128 \
  # 3. 파일시스템
  --ro-bind / / \                     # 전체 읽기전용
  --bind /cwd /cwd \                  # CWD 쓰기 허용
  --bind /tmp /tmp \                  # tmp 쓰기 허용
  --tmpfs /home/user/.ssh \           # 민감 디렉토리 차단
  # 4. Device
  --dev /dev \
  # 5. PID 격리
  --unshare-pid --proc /proc \
  -- bash -c "{sandboxCommand}"
```

**2단계 실행** (seccomp):
```
단계 1: bwrap 시작 → socat 브릿지 시작 (Unix socket 필요)
단계 2: apply-seccomp 바이너리 → socket(AF_UNIX) BPF 차단 → exec 사용자 커맨드
```

socat이 먼저 시작된 후 seccomp가 `AF_UNIX` 소켓 생성을 차단하므로, 브릿지는 유지되면서 사용자 커맨드는 새 소켓을 만들 수 없다.

**네트워크 브릿지 아키텍처**:
```
[sandbox 내부]                    [호스트]
TCP:3128 ──socat──▶ UDS:http.sock ──socat──▶ HTTP Proxy (도메인 필터링)
TCP:1080 ──socat──▶ UDS:socks.sock ──socat──▶ SOCKS5 Proxy (도메인 필터링)
```

### 2.3 비교

| | macOS (Seatbelt) | Linux (bwrap+seccomp) |
|--|------|------|
| 파일시스템 | .sbpl 규칙 (deny/allow 레이어) | bind mount (--ro-bind/--bind/--tmpfs) |
| 네트워크 | Seatbelt 프로필에서 localhost 포트 허용 | --unshare-net + socat UDS 브릿지 |
| Unix socket | Seatbelt allowlist | seccomp BPF `socket(AF_UNIX)` 차단 |
| 프로세스 | same-sandbox 범위 | --unshare-pid + --new-session |
| 위반 감지 | `log stream` 실시간 모니터링 | 없음 (커널 거부 시 EPERM) |
| Glob 지원 | regex 변환 | ripgrep으로 경로 확장 |

---

## 3. 네트워크 격리 — 프록시 기반 도메인 필터링

syscall 차단(Codex CLI) 대신 **프록시 기반** 접근:

### 3.1 HTTP Proxy (`http-proxy.ts`)

```typescript
interface HttpProxyServerOptions {
  filter(port: number, host: string, socket: Socket): Promise<boolean> | boolean
  getMitmSocketPath?(host: string): string | undefined
  parentProxy?: ResolvedParentProxy
}
```

- CONNECT 핸들러 (HTTPS): 타겟 파싱 → `filter()` → 403 or 200 Connection Established
- Request 핸들러 (HTTP): URL 파싱 → `filter()` → hop-by-hop 헤더 제거 → 프록시
- 차단 시: `403 Forbidden` + `X-Proxy-Error: blocked-by-allowlist`

### 3.2 도메인 매칭 (`filterNetworkRequest`)

```
평가 순서: deniedDomains → allowedDomains → sandboxAskCallback (interactive)
```

- `matchesDomainPattern()`: exact match + `*.example.com` 와일드카드
- `canonicalizeHost()`: IPv6 브라켓 처리
- deny 우선 — allowedDomains에 있어도 deniedDomains에 있으면 차단

### 3.3 SOCKS5 Proxy (`socks-proxy.ts`)

- `@pondwader/socks5-server` 기반
- `setRulesetValidator()` → `filter()` 호출
- `isValidHost()` — 제어 문자 거부 (DNS 스푸핑 방지)
- 상위 프록시 체이닝 지원

---

## 4. 설정 스키마

### 4.1 사용자 설정 (`~/.srt-settings.json`)

```json
{
  "network": {
    "allowedDomains": ["api.anthropic.com", "api.openai.com", "*.npmjs.org"],
    "deniedDomains": ["malicious.com"],
    "allowUnixSockets": ["/var/run/docker.sock"],
    "allowLocalBinding": false
  },
  "filesystem": {
    "denyRead": ["~/.ssh", "~/.aws"],
    "allowRead": ["~/.ssh/known_hosts"],
    "allowWrite": [".", "/tmp", "src/"],
    "denyWrite": [".env", ".bashrc", "*.key"],
    "allowGitConfig": false
  },
  "enableWeakerNestedSandbox": false,
  "mandatoryDenySearchDepth": 3
}
```

### 4.2 Zod 검증 규칙

| 필드 | 검증 |
|------|------|
| `domainPattern` | 프로토콜/경로/포트 거부, `*.X.Y` 최소 2 파트, `*.com` 거부 (너무 광범위) |
| `httpProxyPort` | 1-65535 범위 |
| `mandatoryDenySearchDepth` | 1-10, 기본 3 |

### 4.3 내부 타입

```typescript
// 파일시스템 읽기: deny 후 allow-back (기본 허용)
interface FsReadRestrictionConfig {
  denyOnly: string[]
  allowWithinDeny?: string[]
}

// 파일시스템 쓰기: allow-only (기본 차단)
interface FsWriteRestrictionConfig {
  allowOnly: string[]
  denyWithinAllow: string[]
}

// 네트워크: allow/deny 호스트
interface NetworkRestrictionConfig {
  allowedHosts?: string[]
  deniedHosts?: string[]
}
```

---

## 5. 보안 설계 원칙

### 5.1 Deny-Default

- macOS: `(deny default)` 로 시작
- Linux: `--ro-bind / /` (전체 읽기전용) 로 시작
- 네트워크: 모든 외부 접근 차단, 프록시만 허용

### 5.2 우회 방지

| 우회 벡터 | 대응 |
|-----------|------|
| `mv`/`rename`으로 deny 경로 이동 | macOS: move-blocking 규칙 |
| 심볼릭 링크로 sandbox 외부 접근 | `isSymlinkOutsideBoundary()` 검증 |
| mkdir로 deny 경로 재생성 | Linux: 미존재 경로에 `/dev/null` 마운트 |
| DNS 스푸핑으로 도메인 필터 우회 | `isValidHost()` — 제어 문자 거부 |
| socat 시작 후 새 Unix socket 생성 | seccomp BPF `socket(AF_UNIX)` 2단계 차단 |
| `.git/hooks` 실행으로 코드 주입 | mandatory deny — 항상 차단 |

### 5.3 강제 차단 목록 (Mandatory Deny)

어떤 설정으로도 해제 불가:

```
파일: .gitconfig, .gitmodules, .bashrc, .bash_profile,
      .zshrc, .zprofile, .profile, .ripgreprc, .mcp.json
디렉토리: .git/hooks, .vscode, .idea, .claude/commands, .claude/agents
```

---

## 6. Claude Code 통합 방식

### 6.1 Bash 도구 래핑

```bash
# Claude Code가 bash 커맨드 실행 시:
srt "npm install express"
# → sandbox-exec -p <dynamic_profile> bash -c "npm install express"
```

### 6.2 MCP 서버 샌드박싱

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "srt",
      "args": ["npx", "-y", "@modelcontextprotocol/server-filesystem"]
    }
  }
}
```

### 6.3 Claude Code 내 계층

```
Layer 1: Permission System (Deny>Ask>Allow)  — 항상 ON
Layer 2: OS Sandbox (srt)                    — opt-in (/sandbox)
Layer 3: Auto Mode Classifier (Sonnet 4.6)   — 선택
Layer 4: System Prompt 지시                  — 항상 ON
```

허가 프롬프트 84% 감소 (Anthropic 내부 측정).

---

## 7. Codex CLI 비교

| | sandbox-runtime (Claude Code) | Codex CLI |
|--|------|------|
| 언어 | TypeScript | Rust |
| 오픈소스 | Apache 2.0 | MIT |
| 설치 | `npm install -g` | cargo/binary |
| 기본 상태 | opt-in | always-on |
| macOS | Seatbelt (.sbpl 동적 생성) | Seatbelt |
| Linux 파일시스템 | bubblewrap (namespace) | Bubblewrap (namespace) |
| Linux 네트워크 | bubblewrap --unshare-net + socat 프록시 | seccomp `SYS_connect` 차단 |
| Unix socket | seccomp BPF (2단계) | seccomp BPF |
| 네트워크 필터링 | 프록시 기반 도메인 allow/deny | syscall 차단 (전부 or 없음) |
| 설정 | JSON 파일 (Zod 검증) | Rust enum (코드 내) |
| 위반 감지 | macOS: log stream / Linux: EPERM | sandbox denial heuristic |

**핵심 차이**: Codex는 네트워크를 syscall 레벨에서 차단 (세밀도 낮음). sandbox-runtime은 프록시 기반 도메인 필터링 (세밀도 높음, 구현 복잡도 높음).

---

## 8. GEODE 적용 가능성

### 8.1 직접 사용 (권장)

```python
# core/cli/bash_tool.py
import shutil

def execute(self, command: str, timeout: int = 30) -> BashResult:
    if self._sandbox_enabled and shutil.which("srt"):
        cmd = ["srt", command]
    else:
        cmd = ["bash", "-c", command]
    result = subprocess.run(cmd, ...)
```

장점:
- Seatbelt/bwrap 역공학 불필요
- Anthropic 팀이 유지보수
- 도메인 필터링 포함

단점:
- Node.js 의존성 추가 (`npm install -g`)
- TypeScript 런타임 오버헤드 (~200ms 시작)

### 8.2 패턴 참조 후 Python 포팅

`sandbox-runtime`의 .sbpl 생성 로직과 bwrap 인자 구성을 Python으로 포팅.

장점:
- Node.js 의존성 없음
- 필요한 부분만 구현 (파일시스템 격리만, 네트워크 프록시 제외)

단점:
- 유지보수 부담
- 우회 방지 로직 누락 위험

### 8.3 혼합 (Phase 적용)

```
Phase 3a: srt 바이너리 직접 사용 (빠른 통합, npm 의존)
Phase 3b: 핵심 로직 Python 포팅 (장기, 의존성 제거)
```

---

## 9. 참고 자료

- [Repo](https://github.com/anthropic-experimental/sandbox-runtime) — Apache 2.0
- [Sandboxing - Claude Code Docs](https://code.claude.com/docs/en/sandboxing)
- [Making Claude Code More Secure and Autonomous](https://www.anthropic.com/engineering/claude-code-sandboxing) — Anthropic Engineering Blog
- [Beyond Permission Prompts](https://www.anthropic.com/engineering/claude-code-auto-mode) — Auto Mode 아키텍처
- [A Deep Dive on Agent Sandboxes](https://pierce.dev/notes/a-deep-dive-on-agent-sandboxes) — Pierce Freeman
- [Codex CLI vs Claude Code 2026](https://blakecrosley.com/blog/codex-vs-claude-code-2026) — Blake Crosley

---

*Source: `blog/research/anthropic-sandbox-runtime.md` | Category: [[blog-research]]*

## Related

- [[blog-research]]
- [[blog-hub]]
- [[geode]]
- [[geode-sandbox-breadcrumb]]
