---
title: FAQ
category: operations
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
external_refs:
---

# FAQ

자주 받는 질문.

## 설치 / 환경

**Q. Python 3.11에서 동작하나?**
A. 아니오. 3.12+ 필수 (`pyproject.toml:7`). PEP 604 union syntax 등 사용.

**Q. uv 대신 pip으로 설치 가능?**
A. 가능하나 권장 안 함. uv 가 lock 파일 + tool install 흐름 통합. pip 사용 시 의존성 reproducibility 보장 어려움.

**Q. Windows 동작?**
A. macOS/Linux는 검증됨. Windows는 일부 경로 / 시그널 / Unix socket 호환성 이슈 가능.

## 인증

**Q. ChatGPT Plus / Claude Pro / GLM Coding 중 무엇을 사용해야 하나?**
A. 사용자 비용 정책에 따름. 모두 등록 가능 — `resolve_routing` 이 SUBSCRIPTION 우선 fallback. ChatGPT Plus는 OpenAI 모델, Claude Pro는 (현재 ToS로 비활성), GLM은 ZhipuAI 코딩 plan.

**Q. PAYG API key 만으로 동작?**
A. 가능. `manage_login set-key` 로 등록. Plan 합성으로 PAYG 자동 처리.

**Q. ChatGPT Plus 가입 검증은 어떻게?**
A. OAuth JWT의 `chatgpt_plan_type` 클레임이 OpenAI 측 검증 결과. GEODE 자체 검증 없음 — JWT 신뢰. 자세한 내용 [[oauth-flow]].

**Q. v0.65.0 manage_login 보고 오류는 무엇인가?**
A. `provider_mismatch` verdict 가 healthy profile 을 가리는 결함. 수정됨 (PR #866). [[manage-login]] 분석 참조.

## 운영

**Q. serve daemon이 자꾸 죽는다.**
A. 로그 확인 (`~/.geode/serve.log`). 일반 원인: (1) 메모리 부족, (2) MCP 서버 오류 cascade, (3) 모델 API down. `geode doctor` 로 환경 검사.

**Q. 응답이 너무 느리다.**
A. 캐시 활용 확인 (LangSmith trace의 `cache_read_input_tokens`). Anthropic 모델 사용 시 [[prompt-caching]] 4-슬롯 활용 검증. 모델 자체 응답 시간은 외부 요인.

**Q. 비용이 너무 많이 나온다.**
A. (1) 캐시 hit-rate 검사, (2) 5-tier context 압축 시점 검사, (3) `--dry-run` 모드로 fixture 활용, (4) live 테스트 비활성화 (memory feedback_test_cost ~10,000원/run).

## 도메인 / 분석

**Q. Game IP 외 도메인 추가 어떻게?**
A. [[building-a-plugin]] 6단계. `plugins/<my_domain>/` 디렉터리 + 16-method DomainPort 구현 + 등록.

**Q. Cowboy Bebop dry-run 결과가 다르게 나온다.**
A. 정상은 A (68.4). 다르면 fixture 변경 또는 파이프라인 회귀 의심. CI E2E gate가 검출.

## 보안

**Q. API key가 LangSmith trace에 들어가나?**
A. 들어가지 않도록 설계. 의도적으로 metadata 주입 안 함. 검증: trace의 metadata에 `key`, `token`, `auth` 필드 없는지 확인.

**Q. computer use 도구를 비활성화 하려면?**
A. `.geode/profile_policy.toml` 의 `[deny] tools = ["computer", "run_bash"]`. PolicyChain L1 (Profile) 이 모든 다른 레이어 override.

## 다음

- [[troubleshooting]] — 자주 발생 문제
- [[debugging]] — 디버깅 일반
- [[env-vars]] — 환경 변수
