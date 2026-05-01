---
title: Kiki AppMaker PIN System (Match-3 + Pitch Deck)
category: concepts
tags: [kiki-appmaker, pin, match-3, pitch-deck, audio, demo, manager-facing, ios-safari]
sources:
  - "kiki-appmaker/git log (2026-04-15..2026-04-30) — PIN-36/44/47/48/57/58/59/60, M3-A/B/C, pitch-*"
  - "kiki-appmaker/output/pin-57/match-3-next/"
  - "kiki-appmaker/output/pitch/SPEC.md"
created: 2026-04-30T11:30:00Z
updated: 2026-04-30T11:30:00Z
---

# Kiki AppMaker PIN System

> Manager-facing demo로 만들어지는 두 가지 product line — pitch deck (브랜드 + manager 설득용 랜딩) + match-3 게임 (sprite/audio/daily challenge로 AppMaker 의 production-quality 역량 시연). PIN-XX 번호로 시리즈 관리.

## 두 Product Line

### Pitch Deck (PIN-47, PIN-48, pitch-*)

Manager-facing landing + howto generator. AppMaker 가 외부 회사에 sales 할 때 "이게 가능하다"를 보여주는 첫 진입점.

| PIN | 내용 | 산출물 | 상태 |
|---|---|---|---|
| PIN-47 / M2-E-1 | landing page generator (server-side) | `output/pitch/landing.tsx` | merged (#74) |
| PIN-48 | howto generator wired into job lifecycle + tests | `output/pin-48/` | merged |
| pitch-byo-tier2-3-and-styles | bring-your-own model UX 디자인 | `docs/superpowers/specs/pitch-model-byo-ux-design.md` | merged (#94) |
| pitch-test-ratchet | lint + test baseline lock at 86 | CI ratchet | merged (#98) |
| pitch-lint-cjs-override | lint baseline clear | merged (#100) |
| pitch-stream-cancel-test | outputs route stream-cancel test | merged (#102) |
| pitch-cleanup-audit (2026-04-28) | rollout report + per-§ status markers | `docs/superpowers/specs/2026-04-28-pitch-cleanup-audit.md`, `reports/2026-04-28-pitch-cleanup-rollout.md` | active |

### Match-3 Game (PIN-36/44/57/58/59/60, M3-A/B/C)

production-quality 데모: sprite + audio + daily challenge + iOS Safari 호환.

| PIN | M3 stage | 내용 | AC |
|---|---|---|---|
| PIN-36 | M3-A | daily challenge | feature merge |
| PIN-44 | M3-C | daily seed + share URL + localStorage persistence | (recent) |
| PIN-57 | M3-B (scope) | match-3-next 골격 | merged |
| PIN-58 | M3-B-3 | audio state + BGM/HUD wiring | AC#8 |
| PIN-59 | M3-B-1 | sprite restore (PIN-56 workspace-reset recovery) | AC#7 |
| PIN-60 | M3-B-2 | iOS Safari AudioContext unlock + unit tests | AC#13 |
| PIN-63 | (scope) | M3-B 의 production scope = `output/pin-57/match-3-next/**` 한정 | scope policy |

## 핵심 기술 challenge

### 1. iOS Safari AudioContext unlock (PIN-60 / M3-B-2)

**문제**: iOS Safari는 user gesture 없이 AudioContext를 자동 시작하지 않음. 첫 터치/클릭 이전엔 game audio 가 silent.

**해결** (`audioUnlock.attach` in `main.ts`):
- 첫 user gesture 이벤트 (touchstart/click) 에서 `AudioContext.resume()` 강제
- L1 (touch) + L3 (focus) 두 layer로 unlock
- unit test 로 L1/L3 path 검증

### 2. localStorage persistence + share URL (PIN-44 / M3-C)

**문제**: daily challenge seed를 정확히 매일 같은 시드로 줘야 manager 가 "어제 했던 게임"을 친구에 share 가능.

**해결**:
- `daily seed = hash(YYYY-MM-DD)` 결정적
- 진행 상태 → localStorage `kiki-match3-state-${date}`
- share URL `?d=YYYY-MM-DD&s=<seed>&p=<progress>` 으로 같은 게임 재현

### 3. Sprite asset 관리 (PIN-59 / M3-B-1)

**문제**: PIN-56 workspace-reset 때 sprite asset 손실. 직전 stash@{5} 에 있던 작업 복원 필요.

**해결**:
- `git stash list` 에서 PIN-56 직전 stash 식별
- `stash@{5}` 적용 + sprite 파일 복원
- assert: 모든 sprite 가 `<canvas>` 에 정상 렌더

### 4. BGM toggle + HUD mute (PIN-58 / M3-B-3)

**문제**: BGM과 SFX는 분리 관리, HUD mute 버튼이 둘 다 제어해야 함.

**해결**: state machine
```
{
  audioState: 'unlocked' | 'locked',
  bgmEnabled: bool,
  sfxEnabled: bool,
  masterMute: bool,
}
```
HUD mute = `masterMute` 토글, BGM-only = `bgmEnabled` 토글, 각각 localStorage 영속화.

## Pitch Cleanup Audit (2026-04-28)

`docs/superpowers/specs/2026-04-28-pitch-cleanup-audit.md` + rollout report. 활성 audit:
- § 1.8 lint baseline clear (#100)
- § 2.8 outputs route stream-cancel test (#102)
- per-§ status markers inline (#94 이후)

## Stage Transition Guards Wave 1 (2026-04-23)

`docs/superpowers/specs/2026-04-23-stage-transition-guards-design.md` + plan. PIN-XX 작업이 stage 간 transition 시 검증해야 할 가드:
- Plan → Design: SPEC.md "서비스 유형" 섹션 존재 확인
- Design → Do: DESIGN_SYSTEM.md 9섹션 모두 작성 확인
- Do → Check: SELF_CHECK.md 작성 + output/<project>/ 생성 확인
- Check → Act: QA_REPORT.md 채점 80+ 확인

## Autonomous Deploy Guards (2026-04-24)

`docs/superpowers/specs/2026-04-24-autonomous-deploy-guards-design.md`. PIN deploy 시 자동 검증:
- D-1 probe 통과
- D-4 standalone build 성공 (size limit)
- D-7 pm2 restart 후 5초 내 200 응답
- D-8 smoke test endpoint healthcheck

## Token Optimization (2026-04-21)

`docs/research/2026-04-21-token-optimization.md`. PIN 시리즈 진행하면서 token 사용 폭증 → 절감 전략 연구. (자세히 [[kiki-appmaker-research]])

## See also

- [[kiki-appmaker]] — Hub
- [[kiki-appmaker-agent-roles]] — Dev Lead checkpoint-resume (PIN-44/PIN-58 같은 중규모 feature 의 80턴 한계)
- [[kiki-appmaker-pdca]] — PDCA host-mode (PoC 모드, 본격 PIN 작업은 Paperclip 모드)
- [[kiki-appmaker-orchestration]] — Stage execution (Paperclip 모드)
- [[kiki-appmaker-superpowers]] — Stage transition / autonomous deploy / scaffold-correctness specs
- [[index]]
