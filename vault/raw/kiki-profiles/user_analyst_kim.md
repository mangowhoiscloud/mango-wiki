# S.Kim (Financial Analyst)
**Role**: skim-analyst
**Confidence**: 0.94
**Last Updated**: 2026-04-07T10:00:00+09:00

## Communication
- Brevity: concise
- Format: bullet, code_block
- Tone: casual

## Decision Making
- Speed: fast
- Data requirement: high

## Expertise
- financial-modeling
- forecasting
- data-analysis
- scenario-planning
- saas-metrics

## Key Signals
### communication_patterns
- 숫자 먼저, 설명 나중 — 항상 테이블/차트로 리드
- 슬랙에서 스레드 적극 사용, 메인 채널에는 결론만
- 분석 결과 공유 시 항상 '가정(Assumptions)' 섹션 포함
- 코드 블록으로 수식/쿼리 공유하는 습관
- detailed_reporter: avg message length: 256 chars across 5 messages (conf: 0.75)
- table_format_preference: uses markdown tables in messages (conf: 0.8)
- code_block_preference: shares code/calculations in code blocks (conf: 0.85)
- bullet_format_preference: structures messages with bullets/numbers (conf: 0.75)
- formal_tone: formal=2, casual=1 (conf: 0.7)
- high_engagement_content: messages received 10 total reactions (conf: 0.65)
- emoji_insight_marker: 💡 이모지로 핵심 인사이트/제안 강조 — ROI 리밸런싱 추천 시 사용 확인 (conf: 0.80)
- 🆕 version_lock_signal: 'v5-FINAL', 'LOCKED' 키워드로 시나리오 완료 명시적 선언 패턴 — 마감 일정 준수 의지 표시 (conf: 0.82)
- 🆕 close_period_exit_weekend_recovery: close_period 최종일(4/5 일요일) 슬랙 활동 없음 — 야간 크런치(4/3 22:43) 이후 주말 완전 회복 패턴 (conf: 0.79)
### work_patterns
- 오후 집중 시간대 (14-17시)에 모델링 작업 집중
- 월말 첫째 주: CFO Board Deck 데이터 서포트
- 수요일: 주간 KPI 대시보드 갱신일
- ad-hoc 분석 요청에 24시간 내 초안 회신 패턴
- 오후 14:30 이후 딥다이브 결과 공유 — SMB 코호트 분석 오후 발행 확인
- morning_active: morning=4, afternoon=3 (conf: 0.78, UPDATED)
- 🆕 night_crunch_pattern: 마감 전날 22:43 최종 시나리오 업로드 확인 — close_period 야간 집중 작업 패턴 (conf: 0.79)
- 🆕 late_night_recovery: 야간 크런치(22:43) 다음날 17:22 정상 종료 — 빠른 리커버리 패턴 (conf: 0.74)
- 🆕 q2_model_prep_immediate: close 완료 당일 Q2 기준선 모델 세팅 착수 선언 — 분기 전환 즉시 착수 패턴 (conf: 0.81)
- 🆕 q2_week1_dashboard_prep: Q2 첫 주 수요일(4/8) KPI 대시보드 갱신 예정 — Q2 기준 지표 첫 공식 업데이트 (conf: 0.85)
- q2_kpi_dashboard_prep_announced: 4/6 '수요일(4/8) Q2 첫 KPI 대시보드 갱신 예정' 공식 선언 — 준비 상황 사전 공유 패턴 (conf: 0.88, CONFIRMED)
- q2_baseline_model_v01_released: 주간 리뷰 후 Q1 확정 실적 반영 완료 + Q2 기준선 모델 v0.1 발행 — 데이터 수신 즉시 모델 업데이트 패턴 (conf: 0.85)
- smb_scenario_preemptive_prep: SMB Retention 시나리오 3개 CFO 요청 전 선행 준비 — 선제적 분석 준비 패턴 (conf: 0.83)
- 🆕 kpi_dashboard_prep_completed_d1before: 4/7 '내일(4/8) KPI 대시보드 준비 완료 — Q2 기준 지표 세트 확정, 4개 신규 지표 추가' 선언. 갱신 전날 완료 공유 패턴 (conf: 0.87, CONFIRMED 2026-04-07)
- 🆕 smb_scenario_v1_1_refinement: SMB 시나리오 v1.1 정교화 — CS 온보딩 비용 가정 업데이트 반영. 외부 데이터 수신 전 자발적 모델 정교화 패턴 (conf: 0.83, CONFIRMED 2026-04-07)
- 🆕 afternoon_deep_work_d2_confirmed: 4/7 14:22~17:38 연속 집중 작업 — 메시지 없는 딥워크 블록 후 16:45 결과 공유. 오후 집중 시간대(14:00-17:00) 패턴 재확인 (conf: 0.88, CONFIRMED 2026-04-07)
### decision_patterns
- 시나리오 3개 (Base/Bull/Bear) 제시 후 추천안 명시
- 민감도 분석으로 핵심 변수 식별 → 의사결정자에게 전달
- 데이터 부족 시 가정 명시 + 신뢰 구간 함께 제시
- roi_driven_decision: references ROI/payback in decision context (conf: 0.8)
- risk_aware_decision: proactively identifies risks and scenarios (conf: 0.85)
- assumption_always_explicit: Burn Rate 시나리오 포함 모든 분석에 가정 섹션 명시 — 재확인 (conf: 0.89, CONFIRMED)
- 🆕 cs_data_handoff_upward: 자체 범위 밖 데이터 요청은 상위(CFO)에 명확히 위임 수용 — 수직적 에스컬레이션 수용 패턴 (conf: 0.76)
### tool_preferences
- Python/Jupyter → 복잡한 분석
- Google Sheets → 공유 모델
- Looker → KPI 대시보드
