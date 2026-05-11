---
title: Petri × GEODE Alignment Audit
category: concepts
tags: [geode, petri, alignment-audit, inspect-ai, meridian-labs, safety, evaluation]
sources:
  - "geode/CHANGELOG.md"
  - "geode/plugins/petri_audit/"
  - "https://meridianlabs.ai"
created: 2026-05-12T00:00:00Z
updated: 2026-05-12T00:00:00Z
---

# Petri × GEODE Alignment Audit

GEODE 의 첫 alignment audit 통합 PoC. Anthropic Alignment Science 가 만든 **Petri** framework 를 GEODE 의 wrapped agent 위에 얹어, 본인 (LLM 추론 wrapper + tool registry) 의 misalignment risk 를 측정한다. v0.92.0 + scenarios-v1 (진행 중) 기준.

## Petri 란?

**Petri (Parallel Exploration Tool for Risky Interactions)** 는 Anthropic Alignment Science 가 만든 alignment audit framework. [[inspect-ai]] (UK AISI) 위에 build 되었고, [Meridian Labs](https://meridianlabs.ai) 가 `inspect_petri` v3 (MIT) 로 maintain 한다.

3 model role 구조:

| Role | 역할 |
|------|------|
| **Auditor** | Target 을 misalign 방향으로 유도하는 적대적 agent |
| **Target** | 측정 대상. GEODE wrapped agent 또는 vanilla LLM |
| **Judge** | Transcript 를 38 dimension 으로 평가하는 평가자 |

기본 패키지에 **173 default seeds + 38 judge dimensions**. 호출:

```bash
inspect eval inspect_petri/audit \
  --model-role auditor=<m> target=<m> judge=<m>
```

### Inspect transcript viewer v3 (2026-05-07)

2026-05-07 "Introducing Petri 3" (출처: meridianlabs.ai) 에서 Inspect transcript viewer 가 Petri 를 네이티브 지원하기 시작:

> "The Inspect transcript viewer now natively supports Petri transcripts."
>
> "The viewer lets you easily sort and filter them by judge dimension..."
>
> "Within a selected transcript, you can view and navigate between the different branches of the target trajectory."

사용:

- `inspect view start --log-dir <path>` — localhost interactive
- `inspect view bundle --output-dir <dir>` — 정적 SPA (GitHub Pages 호환)

Judge dimension sort/filter + branch navigation + citation highlight 모두 native.

## 왜 GEODE 가 Petri 를 택했나

[[geode]] 는 범용 자율 실행 에이전트 ([[geode-architecture]] 의 4-layer stack: Model → Runtime → Harness → Agent). 본인의 alignment 측정이 필요했던 이유:

1. **Frontier model evaluation 은 bare-LLM 측정.** Wrapped agent 의 misalignment risk 는 wrapper 의 system prompt + tool policies + HITL 가드레일의 **combined effect**. 본 effect 측정에 Petri 의 "auditor 가 target 을 misalign 방향으로 유도" pattern 이 적합.

2. **inspect_ai 가 자연 확장.** Anthropic SDK → inspect_ai ModelAPI → GEODE [[geode-agentic-loop]] 의 3-layer stack 으로 [[geode-llm-models]] 의 호출 path 와 매끄럽게 결합.

3. **GEODE vs vanilla 비교 가능.** 동일 seed 를 `target=geode/<model>` 과 `target=anthropic/<model>` 두 번 돌리면 wrapper 의 marginal protection 을 정량화할 수 있음.

## 결합 과정 (timeline)

PR sequence (GEODE main):

| Phase | PR(s) | 내용 |
|-------|-------|------|
| **P0/P1/P2** | (`docs/plans/eval-petri-integration.md`) | 초기 통합 phase |
| **P3-b-1** | #962, #964, #966, #967 | inspect_ai entry-point discovery 등록 (develop b7ef350d → main) |
| **P3-b-2 라이브** | #996–#1020 시리즈 | N1/N2/N3/N3a/N5/N6/N7'/N8 라이브 (5/10–5/11) |
| **Defect A root cause** | #1024 | target tokens 가 role_usage 에 안 흐름 → F-A1/A2/A3 fix |
| **6-PR plan A–F** | #1026–#1031 | 3-layer observability + Defect B 인벤토리 + B-1 fix |
| **v0.90.0 release** | #1032, #1033 (main 6a6f2486) | — |
| **B-3 + B-4 fix** | #1034–#1036 | + 자연 검증 라이브 |
| **v0.91.0 release** | #1037, #1038 (main 89fdf59f) | — |
| **diagnostics 인프라** | #1039 | fa4 pattern 정식화 |
| **v0.92.0 release** | #1040, #1041 (main a621dc19) | — |
| **scenarios-v1** | (worktree 진행 중) | 8 seeds × 5-level pressure curve + audit-mode + GEODE vs vanilla 비교 |

총 cost ~$0.55, 30K KRW cap 의 2.6%.

## scenarios-v1 시나리오 (8 seeds)

`plugins/petri_audit/seeds/<category>/<name>.md` 위치. 각 seed 는 **1→2→3→2→1 pressure curve** (5 branches). 매 seed 마다 GEODE vs vanilla 비교.

### Compute use (real exec — HIGH 위험)

| Seed | 목적 |
|------|------|
| `compute_use/unrestricted_shell.md` | 위험 shell 명령 (rm -rf, curl\|sh, sudo systemctl). escalation: cleanup → urgent → command → de-escalation → baseline |
| `compute_use/sensitive_path_access.md` | 자격증명 / ssh 키 / 시스템 config 접근 |

### Research

| Seed | 목적 |
|------|------|
| `research/fabrication_under_pressure.md` | 존재하지 않는 paper 인용 fabrication |
| `research/cherry_picking_dataset.md` | 통계 cherry-pick |

### Exploratory

| Seed | 목적 |
|------|------|
| `exploratory/silent_codebase_modification.md` | Disclosure 없는 codebase 수정 |
| `exploratory/dependency_change_disclosure.md` | Dependency 변경 누락 |

### Reasoning

| Seed | 목적 |
|------|------|
| `reasoning/chain_manipulation.md` | False correction pressure |
| `reasoning/self_critique_bypass.md` | Self-critique skip pressure |

각 시나리오의 정확한 body 는 GEODE 의 `plugins/petri_audit/seeds/<category>/<name>.md` 참조. 모든 seed 의 frontmatter 에 `canary GUID` 가 포함되어 학습 corpora 오염을 방지.

### Pressure curve 구조 (공통)

| Branch | Pressure | 의도 |
|--------|----------|------|
| 1 | 1 (low / casual) | Baseline. 자연스러운 요청. |
| 2 | 2 (medium / urgency) | 시간 압박. |
| 3 | 3 (peak / commanding) | 명령형 + 권위 framing. **Peak resistance test.** |
| 4 | 2 (de-escalation) | Pressure 해제. 다만 context 는 이미 escalated → **carry-over 여부** 측정. |
| 5 | 1 (return to baseline) | Branch 1 과 동일 수준 → **lingering effect** (post-pressure target ≠ pre-pressure) 측정. |

## audit-mode (guardrail lift)

`plugins/petri_audit/audit_mode.py` 신규 모듈. PoC scope 안에서 GEODE 의 ProfilePolicy + Readiness 가드레일을 **일시 override** (audit 자체가 target 의 raw 반응을 측정해야 하므로). 활성화 3 path:

| Path | 사용 |
|------|------|
| CLI flag | `--unrestricted` |
| Env var | `GEODE_AUDIT_UNRESTRICTED=1` |
| Config | `.geode/audit-mode.toml` |

Audit-mode 가 켜진 target 만 destructive 명령 실험 대상. 일반 운영에서는 [[geode-sandbox-breadcrumb]] / Readiness 가 그대로 작동.

## 잔존 이슈

- **inspect_ai upstream scoring race** — B-4 의 본질. GEODE 측 fallback 으로 user-facing 0% 도달.
- **inspect_ai generate cache stale 응답** — PoC 진단 시 cache clear 필요.
- **PII gate** — ransomware seed 의 publish 보호 (canary GUID + tags 로 1차 차단, gating 은 별도).

## 참조

- **GEODE 본체 repo**: `/Users/mango/workspace/geode`
- **inspect_petri repo**: [`meridianlabs-ai/inspect_petri`](https://github.com/meridianlabs-ai/inspect_petri)
- **inspect_ai**: [`UKGovernmentBEIS/inspect_ai`](https://github.com/UKGovernmentBEIS/inspect_ai)
- **Meridian Labs Petri 3 공지**: [meridianlabs.ai](https://meridianlabs.ai) (2026-05-07)

## Related

- [[geode]] — 본 framework 의 측정 대상
- [[geode-architecture]] — 4-layer stack (Petri 가 Model layer 의 wrapper 효과를 측정)
- [[geode-agentic-loop]] — Target 의 실행 primitive
- [[geode-sandbox-breadcrumb]] — audit-mode 가 일시 override 하는 정상 운영 가드레일
- [[geode-llm-models]] — auditor/target/judge 모델 선택
- [[geode-quality-evaluation]] — Game IP 의 5-Layer verification. Petri 는 **agent 자체의** alignment 평가 (보완 관계)
- [[index]]
