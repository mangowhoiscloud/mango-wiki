# J.Park (CFO)
**Role**: jpark-cfo
**Confidence**: 0.95
**Last Updated**: 2026-04-07T10:00:00+09:00

## Communication
- Brevity: detailed
- Format: bullet, prose
- Tone: formal

## Decision Making
- Speed: deliberate
- Data requirement: high

## Expertise
- financial-planning
- budget-management
- compliance
- investor-relations
- risk-management

## Key Signals
### communication_patterns
- 주간 리포트에 KPI 대시보드 링크 필수 첨부
- 의사결정 시 항상 '리스크 시나리오'와 '대안' 동시 요구
- 이메일/슬랙 메시지에 수치 근거 없으면 되묻는 패턴
- 경영진 보고 시 Executive Summary + 상세 백업 데이터 2단 구조
- 월말 마감 주간에는 슬랙 응답 시간 평균 3분 → 30분으로 증가
- concise_reporter: avg message length: 160 chars across 6 messages (conf: 0.8)
- bullet_format_preference: structures messages with bullets/numbers (conf: 0.75)
- formal_tone: formal=5, casual=0 (conf: 0.7)
- high_engagement_content: messages received 6 total reactions (conf: 0.65)
- 🆕 close_day_brevity_mode: 마감일 메시지 평균 74% 압축 — 지시형 단문 전환 ('확인 완료', '승인'). close_period 한정 패턴 (conf: 0.84)
- 🆕 post_close_message_length_normalization: 마감 완료 다음날(4/4) 평균 메시지 길이 148자 — 마감 당일 42자 대비 정상 수준 복귀 확인 (conf: 0.85)
- 🆕 close_period_exit_weekend_silence: close_period 최종일(4/5 일요일) 슬랙 활동 없음 — 주말 미활동 + 마감 피로 회복 패턴 일치 (conf: 0.83)
### work_patterns
- 월초 1~5일: 전월 실적 마감 + Board Deck 준비 (집중 모드)
- 분기 말 -2주: 분기 실적 예측 + Forecast 갱신 집중
- 월요일 오전: 주간 재무 리뷰 미팅 (08:30-09:30)
- 금요일 오후: 주간 Cash Flow 리뷰 + 다음 주 자금 계획
- 감사 시즌 (1월, 7월): 외부 커뮤니케이션 최소화, 내부 자료 정리 집중
- morning_active: morning=5, afternoon=1 (conf: 0.78)
- 🆕 q1_close_early_start: Q1 마감 직전일/당일 평소 대비 80분 조기 출근 관찰 (07:05~07:12). close_period 한정 패턴 (conf: 0.82)
- 🆕 post_close_normal_rhythm_return: Q1 마감 다음날(4/4) 08:34 정상 출근 복귀 — close_period 조기 출근 경계 확인 (conf: 0.80)
- 🆕 close_period_officially_ends_4_5: close_period 공식 종료 (2026-04-05 일요일). 4/6(월)부터 normal_period 전환 — 주간 재무 리뷰(08:30) + Q2 팀 브리핑 예정 (conf: 0.87)
- q2_week1_monday_review_confirmed: 4/6 08:33 첫 메시지 — Q2 첫 주간 재무 리뷰 어젠다 발행. 정상 출근 시각(08:33) + Q2 브리핑 동시 진행 실증 (conf: 0.89, 2회 관찰)
- 🆕 tuesday_normal_rhythm_q2w1d2: 4/7 09:12 첫 메시지 — 화요일(비리뷰일) 정상 출근 패턴. 월요일 08:33 대비 39분 늦음 — 주간 리뷰 유무에 따른 시작 시간 차이 실증 (conf: 0.85, CONFIRMED 2026-04-07)
### decision_patterns
- 투자/비용 의사결정 시 ROI + Payback Period 필수
- $10K 이상 집행은 2인 이상 승인 라인 요구
- 불확실성 높은 건은 '소규모 파일럿 → 검증 → 확대' 선호
- 외부 벤더 계약은 반드시 3개 이상 비교 견적 요구
- roi_driven_decision: references ROI/payback in decision context (conf: 0.8)
- risk_aware_decision: proactively identifies risks and scenarios (conf: 0.85)
- cross_functional_coordinator: delegates/tags others 4 times (conf: 0.75)
- compliance_gatekeeper: cites specific regulations/rules (conf: 0.9)
- budget_violation_response: 예산 초과 발견 시 즉시 원인 분석 + 규정 위반 건 기록 요구 (규정 제8조 위반 건 실증, conf: 0.88)
- board_escalation_speed: 리스크 발견 즉시 이사회 격상 + 전사 대응 선언 — SMB NRR 88% 발견 시 파일럿 아닌 전사 대응 결정 (conf: 0.85)
- cross_functional_coordinator_v2: 단일 이슈에 여러 팀원에게 교차 분석 동시 지시 — 오늘 5건 지시 확인 (conf: 0.88)
- 🆕 board_deck_sign_off_protocol: Board Deck 최종 승인 시 버전(v5-FINAL) + 날짜 + 수신자 명시 후 '배포 승인' 선언 — 형식화된 마감 프로토콜 (conf: 0.87)
- 🆕 q1_runway_escalation_confirmed: SMB Retention Risk 이사회 격상 실행 확인 + CS팀 데이터 CBO에 직접 요청 (conf: 0.90, CONFIRMED)
- 🆕 q2_planning_kickoff_speed: close 완료 당일 즉시 Q2 팀 브리핑 요청 — 분기 전환 속도 패턴 (conf: 0.83)
- 🆕 board_deck_distribution_followup: 배포 완료 후 익일 이사회 배포 확인 루틴 — 마감 후속 확인 패턴 (conf: 0.88)
- 🆕 q2_week1_monday_sync: Q2 첫 주 월요일(4/6) 주간 재무 리뷰 + Q2 팀 브리핑 동시 진행 예상 — Q1 close 후 첫 정상 사이클 (conf: 0.84)
- q2_briefing_agenda_structured: Q2 팀 브리핑 4개 항목 구조화 발행 — ①Q1 실적, ②Q2 OKR, ③SMB Retention, ④팀 리소스 (conf: 0.88, CONFIRMED 2026-04-06)
- q2_smb_retention_weekly_tracking: SMB NRR 88% 이사회 격상 후 CS 데이터 수신 여부 주간 추적 지시 — 리스크 아이템 주간 팔로업 패턴 (conf: 0.84)
- q2_normal_message_length_stable: Q2 normal_period 메시지 길이 — 4/6 152자, 4/7 147자 (비리뷰일 소폭 감소). 기준 범위 140~155자 확립 (conf: 0.86)
- 🆕 smb_cs_data_pending_day2: SMB CS 데이터 미수신 2일차 — CBO에 재확인 요청. 리스크 아이템 매일 팔로업 + 에스컬레이션 패턴 (conf: 0.83, CONFIRMED 2026-04-07)
### tool_preferences
- Google Sheets → 실시간 협업 재무 모델
- Notion → 이사회 보고 자료 드래프트
- Slack #finance-alerts → 예산 초과/이상 거래 알림 채널
