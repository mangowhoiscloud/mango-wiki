---
title: Prompt Hashing
category: runtime-llm
geode_version: 0.65.0
last_grounded: 2026-05-02
status: drafted
code_refs:
  - "core/llm/prompts/__init__.py:80-100"
  - "core/llm/prompts/axes.py:59-63"
external_refs:
---

# Prompt Hashing

매 LLM 호출에 prompt SHA256[:12] 해시를 첨부 — drift detection + reproducibility.

## 왜 필요한가

LLM 응답 품질이 갑자기 떨어졌을 때 원인 후보:
1. 모델 자체 변경 (model_id 추적으로 검출)
2. **Prompt 변경** ← prompt hashing이 검출
3. Signal 데이터 변경 (signal hash로 검출)

prompt hashing으로 (2)를 격리.

## hash_rendered_prompt (`prompts/__init__.py:80-88`)

```python
def hash_rendered_prompt(template: str, **kwargs) -> str:
    """format(**kwargs) 후 SHA256[:12]."""
    try:
        rendered = template.format(**kwargs)
    except KeyError:
        rendered = template  # 변수 누락 — raw template 해시
    return hashlib.sha256(rendered.encode("utf-8")).hexdigest()[:12]
```

## 사용

```python
prompt = load_prompt("analyst", "user")
prompt_hash = hash_rendered_prompt(prompt, ip_name="Cowboy Bebop", signals=signals_payload)
# → "a1b2c3d4e5f6"

response = llm_adapter.invoke(messages, metadata={"prompt_hash": prompt_hash})
```

LangSmith trace에 `prompt_hash` 필드로 첨부 → 같은 hash 끼리 grouping → drift 발생 시 trace 비교.

## AXES_VERSIONS

`prompts/axes.py:59-63`:

```python
AXES_VERSIONS = {
    "evaluator_axes_v1": "<sha256 of evaluator_axes.yaml>",
    "rubric_v2026q2": "<sha256>",
}
```

YAML 파일 변경 시 hash 갱신. CI의 `verify_prompt_integrity()` 가 `AXES_VERSIONS` 와 실제 파일 hash 비교 — 불일치 시 빌드 실패.

## drift 발생 흐름

```
1. 누군가 evaluator_axes.yaml 수정
2. AXES_VERSIONS 갱신 안 함
3. CI: verify_prompt_integrity() FAIL → main 머지 차단
4. 수정자: AXES_VERSIONS도 같이 갱신 (의도적 변경 명시)
5. CI 통과
```

이 ratchet 패턴(Karpathy P4)이 prompt drift를 방지.

## 다음

- [[prompt-system]] — 로더
- [[prompt-caching]] — Anthropic ephemeral
- [[testing]] — Quality gates
