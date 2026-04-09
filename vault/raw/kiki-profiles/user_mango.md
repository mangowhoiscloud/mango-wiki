# Mango
**Role**: mango
**Confidence**: 0.85
**Last Updated**: 2026-04-01

## Communication
- Brevity: concise
- Format: bullet, code_block
- Tone: casual

## Decision Making
- Speed: fast
- Data requirement: high

## Expertise
- ai-agents
- langgraph
- python-backend
- mcp-tooling
- ml-evaluation
- cli-architecture
- typescript

## Key Signals
### communication_patterns
- 간결한 불릿 포인트로 소통, 불필요한 설명 생략
- 코드 블록과 구조적 예시를 선호
- '좋아' 등 짧은 승인 패턴 — 빠른 의사결정 루프
- 한국어 커뮤니케이션 + 영어 코드/커밋
### work_patterns
- 다중 프로젝트 병렬 작업 (GEODE, REODE, Kiki, LLMART 동시)
- 고강도 세션 — 회당 8K-12K 메시지 규모
- 야간 집중 시간대 (22:00-02:00) 핵심 아키텍처 작업
- GitFlow 엄격 준수 (feature→develop→main, PR only)
- 테스트 커버리지 중시 (2000+ tests, 75%+ coverage 타겟)
### decision_patterns
- 데이터 기반 결정 — 벤치마크/수치 근거 필수
- 옵션 2개로 압축 후 빠른 선택
- 비용 인식 강함 — 테스트 비용/토큰 예산 관리
- 아키텍처 우선 논의 → 구현 진입
### tool_preferences
- Claude Code를 주 개발 하네스로 사용
- uv + ruff + mypy strict + pytest + bandit 파이프라인
- MCP 서버 기반 도구 확장 패턴
- 워크트리 기반 병렬 브랜치 작업
