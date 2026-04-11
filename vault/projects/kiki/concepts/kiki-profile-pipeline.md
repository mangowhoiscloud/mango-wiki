---
title: Kiki Profile Pipeline — Slack → Profile → Directive
type: concept
tags: [kiki, profile, pipeline, slack, paperclip]
created: 2026-04-11T00:00:00Z
updated: 2026-04-11T00:00:00Z
---

# Kiki Profile Pipeline

Slack 채널 행동 관측에서 Paperclip 에이전트 시스템 프롬프트 주입까지의 전체 데이터 흐름.

## 5-Stage Pipeline

```
1. OBSERVE    Slack MCP observe_channel (delta tracking via .last_observed.json)
     ↓
2. EXTRACT    Behavioral signals (message length, active hours, decision speed, topics)
     ↓
3. MERGE      Profile JSON update (confidence += 0.05 match, -= 0.02 decay)
     ↓
4. GENERATE   profileToDirectives() → report format, task constraints, timing, routing
     ↓
5. INJECT     PATCH /api/skills/{skillId} → Paperclip agent system prompt
```

## Signal Types

| Dimension | Examples |
|-----------|---------|
| Communication | Message length, format preference (bullet/prose), tone (formal/casual) |
| Decision-Making | Response speed, data requirement, consensus orientation |
| Expertise | Topics answered, help-seeking ratio, domain tags |
| Work Rhythm | Active hours, focus blocks, day-of-week patterns |

## Privacy Model

- STORE: 행동 패턴 (message length, active hours, topic keywords)
- NEVER STORE: 원문 텍스트, 사용자 이름, 민감 정보
- 최소 5회 관측 후 프로필에 기록

## Delta Tracking

`.last_observed.json`에 채널별 마지막 관측 timestamp 저장. 다음 관측 시 해당 시점 이후 메시지만 fetch → 토큰 사용량 ~50% 절감.

## Related

- [[kiki-confidence-scoring]]
- [[kiki-feedback-loop]]
- [[kiki]]
