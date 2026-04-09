# H.Lee (Accountant)
**Role**: hlee-accountant
**Confidence**: 0.92
**Last Updated**: 2026-04-07T10:00:00+09:00

## Communication
- Brevity: detailed
- Format: bullet, prose
- Tone: formal

## Decision Making
- Speed: deliberate
- Data requirement: high

## Expertise
- bookkeeping
- tax-compliance
- accounts-payable
- reconciliation
- audit-preparation

## Key Signals
### communication_patterns
- 체크리스트 기반 커뮤니케이션 — 항상 '완료/미완료' 명시
- 규정/기준 참조 시 조항 번호까지 인용
- 오류 발견 시 즉시 플래그 — 지연 없이 해당자에게 DM
- 증빙 자료 요청 시 구체적 포맷/기한 명시
- detailed_reporter: avg message length: 236 chars across 3 messages (conf: 0.65)
- table_format_preference: uses markdown tables in messages (conf: 0.88, CONFIRMED today)
- checklist_format_preference: uses □/✓ checklist patterns (conf: 0.88, CONFIRMED today)
- bullet_format_preference: structures messages with bullets/numbers (conf: 0.75)
- formal_tone: formal=1, casual=0 (conf: 0.7)
- high_engagement_content: messages received 4 total reactions (conf: 0.65)
- escalation_with_deadline: 독촉/에스컬레이션 시 구체적 기한 + 처리 결과 명시 ('오늘 중 제출 예정', '미제출 시 공제 처리', conf: 0.85)
- 🆕 close_checklist_100_confirmation: 마감 당일 오전 전체 체크리스트 100% 완료 확인 메시지 — □→✓ 완전 전환 선언 패턴 (conf: 0.90)
- 🆕 close_period_exit_weekend_quiet: close_period 최종일(4/5 일요일) 슬랙 활동 없음 — 오전 집중형이 주말 미활동은 정상 패턴 일치 (conf: 0.82)
### work_patterns
- 오전 집중 (08:30-11:00): 전표 처리 + 계정 대사
- 월말 25~말일: 마감 처리 집중 (외부 미팅 불가)
- 월요일 오후: 전주 경비 정산 + 카드 대사
- 분기 말 +1주: 세무 신고 자료 준비
- 1월/7월: 외부 감사 대응 (자료 수집 + Q&A)
- morning_active: morning=3, afternoon=0 (conf: 0.69)
- 🆕 journal_entry_audit_trail: 최종 전표 처리 시 승인자+처리일+근거 규정을 한 메시지에 기록 — 마감 전표 형식화 패턴 (conf: 0.91)
- 🆕 open_item_resolution_tracking: 미결 항목(매출 인식 3건)을 다음 사이클까지 추적·완결 — 인계 없이 직접 마감 패턴 (conf: 0.85)
### decision_patterns
- 규정 준수 최우선 — 편의보다 컴플라이언스
- 이상 거래 발견 시 즉시 에스컬레이션 (CFO 보고)
- 반복 업무는 표준 절차 문서화 → 체크리스트화
- 신규 거래 유형은 세무사 확인 후 처리
- compliance_gatekeeper: cites specific regulations/rules (conf: 0.9)
- receipt_escalation_to_deduction: 미제출 영수증 독촉 → 공제 처리까지 완결 집행 확인 (conf: 0.86, CONFIRMED)
- 🆕 q1_close_post_review: 마감 익일 계정 최종 대사 완료 확인 — 마감 완결성 재검토 루틴 (conf: 0.87)
- 🆕 q2_compliance_calendar_immediate: close 완료 당일 Q2 컴플라이언스 캘린더 즉시 배포 — 사이클 전환 대비 선제 패턴 (conf: 0.82)
- 🆕 q1_open_items_followup_week1: 미결 매출 인식 3건 Q2 첫 주 내 완결 예정 — 미해결 아이템 사이클 내 완결 패턴 (conf: 0.83)
- q1_open_items_resolution_started: 4/6 'Q1 미결 매출 인식 3건 처리 착수 — 오늘 중 최소 1건 완결' 선언. 착수 즉시 진도 공유 패턴 (conf: 0.87, CONFIRMED)
- monday_expense_reconciliation_confirmed: 4/6 13:15 '전주 경비 정산 및 카드 대사 완료' — 월요일 오후 정산 루틴 재확인 (conf: 0.84, CONFIRMED)
- 🆕 q1_open_item_1_resolved_next_day: 4/7 'Q1 미결 매출 인식 1번 건 처리 완결' — 4/6 약속('오늘 중 1건') 이행 차일 완결. 약속 이행 패턴 확인 (conf: 0.89, CONFIRMED 2026-04-07)
- 🆕 q1_open_item_deadline_update: 4/7 '2번 건 4/9(목) 완결 예정' 건별 기한 명시 업데이트 — 미결 아이템 진행 상황 공유 패턴 (conf: 0.86, CONFIRMED 2026-04-07)
### tool_preferences
- ERP 시스템 → 전표/원장 관리
- Google Sheets → 계정 대사 워크시트
- Slack #finance-ops → 일상 업무 커뮤니케이션
